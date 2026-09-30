/**
 * Shuttle Deck simulation.
 * Same split as Gemini Capsule: commands → mission events → systems →
 * dynamics → publish. Presentation never owns truth.
 * Units are SI. The flat ENU frame includes centrifugal support so a
 * circular burn actually orbits.
 */

export type Phase =
  | "pad"
  | "ascent"
  | "orbit"
  | "entry"
  | "taem"
  | "approach"
  | "rollout"
  | "landed"
  | "lost";

export type StartMode = "launch" | "orbit" | "entry" | "approach";

export type ViewMode = "chase" | "cockpit" | "tower";

const EARTH_R = 6_371_000;
const MU = 3.986004418e14;
const G0 = 9.80665;

const STEP = 1 / 40;

/** Heading-alignment cylinder, tangent to the centerline at the approach gate. */
export const HAC = {
  cx: -11_000,
  cz: -2_500,
  r: 2_500,
};

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export function wrapPi(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export function hypot3(x: number, y: number, z: number) {
  return Math.hypot(x, y, z);
}

type Basis = {
  nx: number;
  ny: number;
  nz: number;
  rx: number;
  ry: number;
  rz: number;
  dx: number;
  dy: number;
  dz: number;
};

export function bodyBasis(yaw: number, pitch: number, bank: number): Basis {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const nx = fx * cp;
  const ny = sp;
  const nz = fz * cp;

  // Right-handed: local X right, Y up, Z nose, so right × up = nose.
  // The old right vector pointed left, which made a mirror. A quaternion
  // cannot store a mirror, so the mesh yawed 90° off the runway.
  let rx = nz;
  let ry = 0;
  let rz = -nx;
  let rm = Math.hypot(rx, ry, rz);
  if (rm < 1e-4) {
    rx = -Math.cos(yaw);
    ry = 0;
    rz = Math.sin(yaw);
    rm = Math.hypot(rx, ry, rz) || 1;
  }
  rx /= rm;
  ry /= rm;
  rz /= rm;

  let dx = ny * rz - nz * ry;
  let dy = nz * rx - nx * rz;
  let dz = nx * ry - ny * rx;
  const dm = Math.hypot(dx, dy, dz) || 1;
  dx /= dm;
  dy /= dm;
  dz /= dm;

  const cb = Math.cos(bank);
  const sb = Math.sin(bank);
  return {
    nx,
    ny,
    nz,
    rx: rx * cb + dx * sb,
    ry: ry * cb + dy * sb,
    rz: rz * cb + dz * sb,
    dx: dx * cb - rx * sb,
    dy: dy * cb - ry * sb,
    dz: dz * cb - rz * sb,
  };
}

export type ChecklistId =
  | "cells"
  | "apu"
  | "liftoff"
  | "srb"
  | "meco"
  | "doors"
  | "burn"
  | "entry"
  | "taem"
  | "gear"
  | "wheels";

export interface ShuttleSnapshot {
  version: 1;
  mode: StartMode;
  phase: Phase;
  get: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  bank: number;
  mass: number;
  srbProp: number;
  omsProp: number;
  rcsProp: number;
  fuelCell: boolean;
  apu: boolean;
  doorsOpen: boolean;
  gear: boolean;
  heat: number;
  auto: boolean;
  timeRate: number;
  rateLock: boolean;
  srbAttached: boolean;
  etAttached: boolean;
  dvDeorbit: number;
  fail: string;
  callout: string;
}

type Listener = () => void;

let version = 0;
const listeners = new Set<Listener>();

export function subscribeSim(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSimVersion() {
  return version;
}

function emit() {
  version += 1;
  listeners.forEach((fn) => fn());
}

export class ShuttleRuntime {
  mode: StartMode = "launch";
  phase: Phase = "pad";
  running = false;
  paused = false;
  get = 0;
  x = 0;
  y = 250_000;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = -Math.PI / 2;
  pitch = 0.15;
  bank = 0.2;
  mass = 780_000;
  srbProp = 1;
  omsProp = 1;
  rcsProp = 1;
  fuelCell = true;
  apu = true;
  doorsOpen = false;
  gear = false;
  heat = 0;
  auto = true;
  timeRate = 1;
  rateLock = false;
  srbAttached = true;
  etAttached = true;
  srbSepAge = 0;
  etSepAge = 0;
  dvDeorbit = 0;
  fail = "";
  callout = "";
  calloutT = 0;
  view: ViewMode = "chase";
  shake = 0;
  gLoad = 1;
  qbar = 0;
  mach = 0;
  alpha = 0;
  busVolts = 28.2;
  plume = 0;
  plasma = 0;
  blackout = false;
  fdBank = 0;
  fdPitch = 0;
  altErr = 0;
  steerOverride: number | null = null;
  analog = { roll: 0, pitch: 0 };
  muted = false;

  private physical = new Set<string>();
  private inject: Set<string> | null = null;
  private hudAcc = 0;
  private orbitMark = 0;

  private keys() {
    return this.inject ?? this.physical;
  }

  private down(code: string) {
    return this.keys().has(code);
  }

  rollInput() {
    if (this.steerOverride != null) return clamp(this.steerOverride, -1, 1);
    const k = this.keys();
    let r = 0;
    if (k.has("KeyA") || k.has("ArrowLeft")) r += 1;
    if (k.has("KeyD") || k.has("ArrowRight")) r -= 1;
    r += this.analog.roll;
    return clamp(r, -1, 1);
  }

  pitchInput() {
    const k = this.keys();
    let p = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) p += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) p -= 1;
    p += this.analog.pitch;
    return clamp(p, -1, 1);
  }

  yawInput() {
    const k = this.keys();
    let y = 0;
    if (k.has("KeyQ")) y += 1;
    if (k.has("KeyE")) y -= 1;
    return clamp(y, -1, 1);
  }

  burning() {
    return this.down("KeyB") || (this.auto && this.phase === "orbit" && this.get > this.orbitMark + 3);
  }

  setKeys(codes: string[]) {
    this.inject = new Set(codes);
  }

  clearInject() {
    this.inject = null;
  }

  setSteer(v: number) {
    this.steerOverride = v;
  }

  onKey(code: string, pressed: boolean) {
    if (this.inject) return;
    if (pressed) this.physical.add(code);
    else this.physical.delete(code);
  }

  blur() {
    this.physical.clear();
  }

  speed() {
    return hypot3(this.vx, this.vy, this.vz);
  }

  horizSpeed() {
    return Math.hypot(this.vx, this.vz);
  }

  gamma() {
    return Math.atan2(this.vy, Math.max(1, this.horizSpeed()));
  }

  alt() {
    return this.y;
  }

  busAuthority() {
    if (!this.fuelCell || this.busVolts < 18) return 0.35;
    if (!this.apu && (this.phase === "entry" || this.phase === "taem" || this.phase === "approach")) return 0.4;
    return 1;
  }

  start(mode: StartMode) {
    this.mode = mode;
    this.running = true;
    this.paused = false;
    this.fail = "";
    this.inject = null;
    this.steerOverride = null;
    this.get = 0;
    this.heat = 0;
    this.dvDeorbit = 0;
    this.gear = false;
    this.doorsOpen = false;
    this.srbSepAge = 0;
    this.etSepAge = 0;
    this.shake = 0;
    this.rateLock = false;
    this.bank = 0;
    this.vz = 0;
    this.z = 0;

    if (mode === "launch") {
      this.phase = "ascent";
      this.x = -8_000;
      this.y = 20;
      this.vx = 0;
      this.vy = 0;
      this.yaw = -Math.PI / 2;
      this.pitch = Math.PI / 2;
      this.mass = 1_150_000;
      this.srbProp = 1;
      this.omsProp = 1;
      this.rcsProp = 1;
      this.srbAttached = true;
      this.etAttached = true;
      this.timeRate = 4;
      this.say("Main engines at throttle. Tower cleared when you are.");
    } else if (mode === "orbit") {
      this.enterOrbit(250_000, true);
      this.timeRate = 8;
    } else if (mode === "entry") {
      this.fuelCell = true;
      this.apu = true;
      this.beginEntry();
    } else {
      this.fuelCell = true;
      this.apu = true;
      this.phase = "approach";
      this.mass = 104_000;
      this.srbAttached = false;
      this.etAttached = false;
      this.srbProp = 0;
      this.omsProp = 0.42;
      this.captureApproach(800);
      this.timeRate = 1;
      this.say("Final. Gear below 160 meters per second.");
    }
    emit();
  }

  togglePause() {
    if (!this.running || this.fail || this.phase === "landed") return;
    this.paused = !this.paused;
    emit();
  }

  setRate(rate: number) {
    this.timeRate = rate;
    this.rateLock = true;
    emit();
  }

  cycleView() {
    this.view = this.view === "chase" ? "cockpit" : this.view === "cockpit" ? "tower" : "chase";
    emit();
  }

  toggleAuto() {
    this.auto = !this.auto;
    emit();
  }

  toggleMute() {
    this.muted = !this.muted;
    emit();
  }

  toggleDoors() {
    if (this.phase !== "orbit") return;
    this.doorsOpen = !this.doorsOpen;
    this.say(this.doorsOpen ? "Payload bay doors open." : "Payload bay doors closed.");
    emit();
  }

  toggleGear() {
    if (this.phase !== "approach" && this.phase !== "rollout") return;
    if (!this.gear && this.speed() > 190) {
      this.say("Too fast for gear.");
      emit();
      return;
    }
    this.gear = !this.gear;
    this.say(this.gear ? "Gear down and locked." : "Gear up.");
    emit();
  }

  private say(text: string) {
    this.callout = text;
    this.calloutT = 0;
  }

  private lose(reason: string) {
    this.phase = "lost";
    this.fail = reason;
    this.timeRate = 1;
    this.say(reason);
  }

  private enterOrbit(alt: number, fresh: boolean) {
    this.phase = "orbit";
    this.y = alt;
    this.z = 0;
    this.vz = 0;
    this.vy = 0;
    const vc = Math.sqrt(MU / (EARTH_R + alt));
    this.vx = vc;
    this.yaw = -Math.PI / 2;
    this.pitch = 0;
    this.bank = 0;
    this.mass = 104_000;
    this.srbAttached = false;
    this.etAttached = false;
    this.srbProp = 0;
    if (fresh) {
      this.x = 0;
      this.omsProp = 1;
      this.rcsProp = 1;
    }
    this.orbitMark = this.get;
    if (!this.rateLock) this.timeRate = 8;
    this.say("Main engine cutoff. External tank clear. You are in orbit.");
    this.shake = Math.max(this.shake, 0.6);
  }

  private beginEntry() {
    this.phase = "entry";
    this.x = -3_840_000;
    this.y = 80_000;
    this.z = 2_200;
    this.vx = 7_200;
    this.vy = -280;
    this.vz = 0;
    this.yaw = -Math.PI / 2;
    this.pitch = 0.35;
    this.bank = 0;
    this.mass = 104_000;
    this.srbAttached = false;
    this.etAttached = false;
    this.srbProp = 0;
    this.doorsOpen = false;
    if (!this.rateLock) this.timeRate = 16;
    this.say("Entry interface. Hold the corridor with bank.");
    this.shake = Math.max(this.shake, 0.3);
  }

  private hacGuide() {
    const dx = this.x - HAC.cx;
    const dz = this.z - HAC.cz;
    const radial = Math.hypot(dx, dz) || 1;
    const urx = dx / radial;
    const urz = dz / radial;
    let tx = dz / radial;
    let tz = -dx / radial;
    const radErr = radial - HAC.r;
    const corr = clamp(radErr / HAC.r, -0.5, 0.5);
    tx -= urx * corr;
    tz -= urz * corr;
    const tm = Math.hypot(tx, tz) || 1;
    tx /= tm;
    tz /= tm;
    const err = wrapPi(Math.atan2(tz, tx) - Math.atan2(this.vz, this.vx));
    const prog = clamp((this.z - (HAC.cz - HAC.r)) / (2 * HAC.r), 0, 1);
    return { err, radErr, radial, tx, tz, prog };
  }

  /** Pull the ground track onto the cylinder. Manual bank still steers; auto tracks the tangent. */
  private steerCylinder(dt: number) {
    const g = this.hacGuide();
    const vh = Math.hypot(this.vx, this.vz) || 1;
    let d = 0;
    if (this.auto) d = clamp(g.err, -0.9 * dt, 0.9 * dt);
    else d = Math.sin(this.bank) * 0.22 * dt;
    const c = Math.cos(d);
    const s = Math.sin(d);
    const nvx = this.vx * c - this.vz * s;
    const nvz = this.vx * s + this.vz * c;
    this.vx = nvx;
    this.vz = nvz;
    const want = 165;
    if (vh < want) {
      const fill = (want - vh) * Math.min(1, 0.35 * dt);
      this.vx += g.tx * fill;
      this.vz += g.tz * fill;
    }
  }

  /** Line up on the runway centerline. Manual bank steers; auto tracks the intercept. */
  private steerFinal(dt: number) {
    const intercept = clamp(-this.z * 0.0011 - this.vz * 0.015, -0.4, 0.4);
    const err = wrapPi(intercept - Math.atan2(this.vz, this.vx));
    const d = this.auto ? clamp(err, -0.55 * dt, 0.55 * dt) : Math.sin(this.bank) * 0.2 * dt;
    const c = Math.cos(d);
    const s = Math.sin(d);
    const nvx = this.vx * c - this.vz * s;
    const nvz = this.vx * s + this.vz * c;
    this.vx = nvx;
    this.vz = nvz;
  }

  private beginTaem() {
    this.phase = "taem";
    this.x = HAC.cx;
    this.z = HAC.cz - HAC.r;
    this.y = 3_600;
    this.vx = -175;
    this.vz = 0;
    this.vy = -18;
    this.yaw = Math.PI / 2;
    this.pitch = 0.14;
    this.bank = 0.4;
    this.doorsOpen = false;
    this.gear = false;
    if (!this.rateLock) this.timeRate = 1;
    this.say("Heading alignment cylinder. Bank left to the runway.");
    this.shake = Math.max(this.shake, 0.35);
  }

  private captureApproach(cross: number) {
    this.phase = "approach";
    this.x = -11_000;
    this.y = 1_980;
    this.z = clamp(cross, -180, 180);
    this.vx = 148;
    this.vy = -26;
    this.vz = 0;
    this.yaw = -Math.PI / 2;
    this.pitch = 0.05;
    this.bank = 0;
    if (!this.rateLock) this.timeRate = 1;
    this.say("Heading alignment. Runway is ahead.");
  }

  private ended() {
    const phase: Phase = this.phase;
    return phase === "lost" || phase === "landed";
  }

  step(wallDt: number) {
    if (!this.running || this.paused) return;
    if (this.phase === "lost" || this.phase === "landed") return;
    const wall = Math.min(Math.max(wallDt, 0), 0.05);
    this.readGamepad();
    this.applyAttitude(wall);
    let left = wall * this.timeRate;
    while (left > 1e-6) {
      const h = Math.min(STEP, left);
      this.substep(h);
      left -= h;
      if (this.ended()) break;
    }
    this.calloutT += wall;
    this.shake = Math.max(0, this.shake - wall * 0.8);
    this.hudAcc += wall;
    if (this.hudAcc > 0.08) {
      this.hudAcc = 0;
      emit();
    }
  }

  private readGamepad() {
    if (this.inject || this.steerOverride != null) return;
    const list = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
    const gp = list ? list[0] : null;
    if (!gp) return;
    const ax = gp.axes[0] ?? 0;
    const ay = gp.axes[1] ?? 0;
    if (Math.abs(ax) > 0.18) this.analog.roll = clamp(-ax, -1, 1);
    if (Math.abs(ay) > 0.18) this.analog.pitch = clamp(-ay, -1, 1);
  }

  private applyAttitude(dt: number) {
    const auth = this.busAuthority();
    const roll = this.rollInput() * auth;
    const pitchStick = this.pitchInput() * auth;
    const yawStick = this.yawInput() * auth;

    if (this.phase === "ascent") {
      const t = this.get;
      const vh = this.horizSpeed();
      let target: number;
      if (t < 8) target = Math.PI / 2;
      else if (this.y < 50_000) {
        const u = clamp((t - 8) / 38, 0, 1);
        const s = u * u * (3 - 2 * u);
        target = (Math.PI / 2) * (1 - s) + (38 * Math.PI) / 180 * s;
      } else target = clamp(0.22 - this.vy / 2800, 0.02, 0.9);
      if (this.auto) this.bank += (0 - this.bank) * 0.35 * dt;
      this.pitch += (target - this.pitch) * 1.8 * dt;
      this.pitch += pitchStick * 0.28 * dt;
      this.pitch = clamp(this.pitch, 0.02, Math.PI / 2);
    } else if (this.phase === "entry") {
      const mach = this.mach;
      const alphaT = mach > 5 ? 0.58 : mach > 2 ? 0.32 : 0.18;
      const desired = clamp(this.gamma() + alphaT, -0.25, 1.05);
      const pull = this.auto ? 2.4 : 0.85;
      this.pitch += (desired - this.pitch) * pull * dt;
      this.pitch += pitchStick * 0.5 * dt;
      if (this.auto) this.bank += (this.fdBank - this.bank) * 1.15 * dt;
    } else if (this.phase === "approach" || this.phase === "taem") {
      const pull = this.auto ? 2.2 : 0.7;
      this.pitch += (this.fdPitch - this.pitch) * pull * dt;
      this.pitch += pitchStick * 0.55 * dt;
      if (this.auto) this.bank += (this.fdBank - this.bank) * 1.6 * dt;
    } else {
      this.pitch += pitchStick * 0.7 * dt;
      this.pitch = clamp(this.pitch, -1.1, 1.2);
    }

    this.bank += roll * 1.55 * dt;
    this.bank = clamp(this.bank, -1.25, 1.25);
    if (Math.abs(roll) < 0.05 && !this.auto && this.phase !== "entry" && this.phase !== "taem") {
      this.bank *= Math.exp(-0.15 * dt);
    }

    // Aileron-rudder interconnect: +roll (left wing down) increases yaw.
    // Gated to phases with airflow. In vacuum (orbit/pad) there is no
    // aileron or rudder authority; a latched bank would otherwise spin
    // the heading forever.
    const yawK =
      this.phase === "orbit" || this.phase === "pad"
        ? 0
        : this.phase === "taem"
          ? 0.28
          : 0.72;
    this.yaw += Math.sin(this.bank) * yawK * dt;
    this.yaw += roll * 0.22 * dt;
    this.yaw += yawStick * 0.55 * dt;
    this.yaw = wrapPi(this.yaw);

    const q = this.qbar;
    const vh = this.horizSpeed();
    if (q > 80 && vh > 30 && (this.phase === "entry" || this.phase === "taem" || this.phase === "approach" || this.phase === "ascent")) {
      const targetYaw = Math.atan2(-this.vx, -this.vz);
      const blend = 1 - Math.exp(-2.4 * dt);
      this.yaw = wrapPi(this.yaw + wrapPi(targetYaw - this.yaw) * blend);
    }

    if (this.rcsProp > 0 && (Math.abs(roll) + Math.abs(pitchStick) + Math.abs(yawStick) > 0.2)) {
      this.rcsProp = Math.max(0, this.rcsProp - dt * 0.004);
    }
  }

  private substep(dt: number) {
    this.get += dt;
    const phase = this.phase;

    if (phase === "ascent" && this.srbAttached && this.get >= 42) {
      this.srbAttached = false;
      this.srbProp = 0;
      this.mass = Math.max(104_000, this.mass - 560_000);
      this.shake = 1;
      this.say("Solid rockets have separated.");
    }

    let thrust = 0;
    if (phase === "ascent") {
      const spool = clamp(this.get / 2.2, 0.4, 1);
      const srb = this.srbAttached ? 18e6 : 0;
      thrust = (srb + 5.4e6) * spool;
      const cap = 2.8 * G0 * this.mass;
      if (thrust > cap) thrust = cap;
      if (this.srbAttached) {
        this.srbProp = clamp(1 - this.get / 42, 0, 1);
        this.mass = Math.max(104_000, this.mass - 8_000 * dt);
      } else {
        this.mass = Math.max(104_000, this.mass - 1_500 * dt);
      }
    }

    if (!this.srbAttached) this.srbSepAge += dt;
    if (!this.etAttached) this.etSepAge += dt;

    const basis = bodyBasis(this.yaw, this.pitch, this.bank);
    let ax = basis.nx * (thrust / this.mass);
    let ay = basis.ny * (thrust / this.mass);
    let az = basis.nz * (thrust / this.mass);

    const r = EARTH_R + Math.max(this.y, -1000);
    const grav = MU / (r * r);
    const cent = (this.vx * this.vx + this.vz * this.vz) / r;
    ay += -grav + cent;

    if (phase === "orbit" && this.burning() && this.omsProp > 0.02 && !this.doorsOpen) {
      const vh = this.horizSpeed() || 1;
      const accel = 2.5;
      ax += (-this.vx / vh) * accel;
      az += (-this.vz / vh) * accel;
      this.omsProp = Math.max(0, this.omsProp - dt * 0.012);
      this.dvDeorbit += accel * dt;
      this.plume = 0.55;
    }

    this.applyAero(dt, (x, y, z) => {
      ax += x;
      ay += y;
      az += z;
    });

    this.vx += ax * dt;
    this.vy += ay * dt;
    this.vz += az * dt;
    if (this.phase === "taem") this.steerCylinder(dt);
    if (this.phase === "approach") this.steerFinal(dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;

    if (this.phase === "approach" && this.y < 48 && this.y > 0) {
      const targetVy = this.y > 12 ? -3.4 : -1.8;
      this.vy += (targetVy - this.vy) * Math.min(1, 4 * dt);
    }

    const speed = this.speed();
    this.gLoad = hypot3(ax, ay + grav - cent, az) / G0;
    this.mach = speed / 295;
    this.alpha = this.pitch - this.gamma();
    this.plume =
      phase === "ascent" ? clamp(thrust / 24e6, 0, 1) : this.burning() && phase === "orbit" ? 0.45 : 0;
    this.plasma = phase === "entry" ? clamp((this.qbar - 1500) / 22000, 0, 1) : 0;
    this.blackout = phase === "entry" && this.mach > 8 && this.qbar > 1800;

    const load = (this.apu ? 0.35 : 0.1) + (phase === "ascent" ? 0.25 : 0.15);
    this.busVolts = this.fuelCell ? 28.6 - load * 1.4 : 0;

    if (phase === "entry") {
      this.heat += Math.max(0, this.qbar - 14000) * dt * 0.0000045;
      this.heat += Math.max(0, this.gLoad - 2.4) * dt * 0.05;
    } else if (phase === "ascent") {
      const abuse = Math.max(0, Math.abs(this.pitchInput()) - 0.92);
      if (this.qbar > 70_000 && abuse > 0) this.heat += abuse * dt * 0.04;
    } else {
      this.heat = Math.max(0, this.heat - dt * 0.02);
    }

    this.updateDirector();
    this.events();

    if (this.heat > 1 && phase !== "lost") this.lose("Thermal limit. The corridor was left behind.");
    if (this.gLoad > 5.6 && (phase === "entry" || phase === "ascent")) {
      this.lose("Load limit. Ease the pull.");
    }
    if (this.y < 0 && phase === "ascent") this.lose("The stack did not clear the pad profile.");
  }

  private applyAero(dt: number, add: (x: number, y: number, z: number) => void) {
    if (this.phase === "orbit" || this.phase === "pad") {
      this.qbar = 0;
      return;
    }
    const v = this.speed();
    if (v < 8 || this.y > 130_000) {
      this.qbar = 0;
      return;
    }
    const rho = 1.225 * Math.exp(-Math.max(this.y, 0) / 7200);
    const q = 0.5 * rho * v * v;
    this.qbar = q;
    const mach = v / 295;
    const alpha = clamp(this.pitch - this.gamma(), -0.2, 0.9);
    let cd: number;
    let cl: number;
    if (mach > 3) {
      cd = 70;
      cl = 70 * 1.12;
    } else if (mach > 1) {
      cd = 34;
      cl = 34 * (1.6 + alpha * 1.4);
    } else {
      cd = 12 * (1 + alpha * alpha * 2.4);
      cl = cd * (0.9 + Math.max(0, alpha) * 20);
    }
    const drag = (q * cd) / this.mass;
    const lift = (q * cl) / this.mass;
    const ux = this.vx / v;
    const uy = this.vy / v;
    const uz = this.vz / v;
    let lx = -ux * uy;
    let ly = 1 - uy * uy;
    let lz = -uz * uy;
    let lm = Math.hypot(lx, ly, lz);
    if (lm < 1e-4) {
      lx = 0;
      ly = 1;
      lz = 0;
      lm = 1;
    }
    lx /= lm;
    ly /= lm;
    lz /= lm;
    const rx = uy * lz - uz * ly;
    const ry = uz * lx - ux * lz;
    const rz = ux * ly - uy * lx;
    const cb = Math.cos(this.bank);
    const sb = Math.sin(this.bank);
    add(-ux * drag + (lx * cb - rx * sb) * lift, -uy * drag + (ly * cb - ry * sb) * lift, -uz * drag + (lz * cb - rz * sb) * lift);
    void dt;
  }

  private updateDirector() {
    if (this.phase === "entry") {
      const v = this.speed();
      const ref =
        v > 6500 ? 62000 + (v - 6500) * 6 : v > 3500 ? 47000 + (v - 3500) * 5 : v > 1200 ? 28000 + (v - 1200) * 8 : 8000 + v * 12;
      this.altErr = this.y - ref;
      const mag = clamp(this.altErr / 14000, -0.2, 1.05);
      const sign = Math.sin(this.get / 18) >= 0 ? 1 : -1;
      // Positive bank is left wing down. High means descend: bank more.
      this.fdBank = sign * Math.max(0, mag);
      this.fdPitch = this.gamma() + 0.62;
    } else if (this.phase === "taem") {
      const g = this.hacGuide();
      this.fdBank = clamp(g.err * 1.35 + g.radErr * 0.00035, -1.05, 1.05);
      const prog = clamp(g.prog, 0, 1);
      const yTarget = 3600 + (2000 - 3600) * prog;
      this.altErr = this.y - yTarget;
      const chase = clamp(-this.altErr * 0.0004, -0.14, 0.14);
      this.fdPitch = this.gamma() + 0.16 + chase;
    } else if (this.phase === "approach") {
      const range = -this.x;
      const tgt = Math.max(0, range) * Math.tan((10 * Math.PI) / 180);
      this.altErr = this.y - tgt;
      const intercept = clamp(-this.z * 0.0011 - this.vz * 0.015, -0.4, 0.4);
      const trackErr = wrapPi(intercept - Math.atan2(this.vz, this.vx));
      this.fdBank = clamp(trackErr * 1.5, -0.85, 0.85);
      const gamma = this.gamma();
      if (this.y < 70) {
        const sinkErr = -2.2 - this.vy;
        this.fdPitch = gamma + 0.22 + clamp(sinkErr, 0, 8) * 0.01;
      } else {
        const chase = clamp(-this.altErr * 0.00028, -0.1, 0.12);
        this.fdPitch = gamma + 0.18 + chase;
      }
    } else {
      this.fdBank = 0;
      this.fdPitch = this.pitch;
      this.altErr = 0;
    }
  }

  private events() {
    if (this.phase === "ascent") {
      const vh = this.horizSpeed();
      if (this.y > 110_000 && vh > 7_300 && this.get > 50) {
        this.enterOrbit(Math.max(160_000, Math.min(this.y, 280_000)), false);
        this.etSepAge = 0;
        this.shake = 1;
      } else if (this.get > 420 && this.y > 70_000 && vh > 4_000) {
        this.enterOrbit(Math.max(140_000, this.y), false);
      }
    } else if (this.phase === "orbit") {
      if (this.dvDeorbit > 95 && !this.doorsOpen) {
        this.say("Deorbit burn complete.");
        this.beginEntry();
      } else if (this.burning() && this.doorsOpen) {
        this.say("Close the payload bay before the burn.");
      }
    } else if (this.phase === "entry") {
      const v = this.speed();
      if (this.y < 18_000 && this.y > 3_000 && v < 1_400) {
        this.beginTaem();
      } else if (this.y < 5_500 && v > 780) {
        this.lose("Too fast for the heading alignment.");
      } else if (this.y < 1_200) {
        this.lose("Undershot the approach window.");
      }
    } else if (this.phase === "taem") {
      const g = this.hacGuide();
      if (this.z > -180 && this.vx > 70 && this.y > 500 && g.prog > 0.9) {
        this.phase = "approach";
        if (!this.rateLock) this.timeRate = 1;
        this.say("Centered on the runway. Outer glide slope.");
      } else if (this.y < 40) {
        this.lose("Short of the heading alignment.");
      } else if (g.radial > HAC.r + 1_800 && this.y < 1_600) {
        this.lose("Outside the heading alignment cylinder.");
      }
    } else if (this.phase === "approach") {
      if (this.auto && !this.gear && this.y < 380 && this.speed() < 190) {
        this.gear = true;
        this.say("Gear down and locked.");
      }
      if (this.y <= 1.6) {
        const aligned = Math.abs(wrapPi(this.yaw - -Math.PI / 2)) < 0.28;
        const onPave = Math.abs(this.z) < 72 && this.x > -400 && this.x < 3_600;
        const soft = this.vy > -6.5 && this.vy < 1.2;
        if (this.gear && aligned && onPave && soft) {
          this.phase = "rollout";
          this.y = 0.4;
          this.vy = 0;
          this.vz = 0;
          this.shake = 0.85;
          this.say("Touchdown.");
        } else if (!this.gear) {
          this.lose("Gear was still up.");
        } else if (!onPave) {
          this.lose("Missed the runway.");
        } else if (!soft) {
          this.lose("Hard landing.");
        } else {
          this.lose("Not aligned with the centerline.");
        }
      }
    } else if (this.phase === "rollout") {
      const v = this.horizSpeed();
      const brake = Math.exp(-0.55 * STEP);
      this.vx *= brake;
      this.vz *= 0.9;
      this.y = 0.4;
      this.vy = 0;
      if (v < 3) {
        this.phase = "landed";
        this.vx = 0;
        this.vz = 0;
        this.say("Wheel stop. Welcome home.");
        this.noteLanding();
        emit();
      }
    }
  }

  private noteLanding() {
    if (typeof localStorage === "undefined") return;
    try {
      const prev = JSON.parse(localStorage.getItem("shuttle-deck-stats") || "{}") as { landings?: number };
      localStorage.setItem(
        "shuttle-deck-stats",
        JSON.stringify({ landings: (prev.landings ?? 0) + 1 }),
      );
    } catch {
      /* ignore quota */
    }
  }

  checklist(): { id: ChecklistId; label: string; done: boolean }[] {
    const p = this.phase;
    const rows: { id: ChecklistId; label: string; done: boolean; show: boolean }[] = [
      { id: "cells", label: "Fuel cells online", done: this.fuelCell && this.busVolts > 24, show: true },
      { id: "apu", label: "APU running — hydraulics", done: this.apu, show: true },
      { id: "liftoff", label: "Liftoff", done: this.running && this.mode === "launch" && this.get > 1, show: this.mode === "launch" },
      { id: "srb", label: "SRB separation", done: !this.srbAttached && this.get > 20, show: this.mode === "launch" },
      { id: "meco", label: "MECO and tank sep", done: p !== "pad" && p !== "ascent", show: this.mode === "launch" || p === "orbit" },
      { id: "doors", label: "Payload bay doors closed", done: !this.doorsOpen, show: p === "orbit" || p === "entry" || p === "taem" },
      { id: "burn", label: "Deorbit burn 95 m/s", done: this.dvDeorbit >= 95 || p === "entry" || p === "taem" || p === "approach" || p === "rollout" || p === "landed", show: p === "orbit" || p === "entry" || p === "taem" || this.dvDeorbit > 0 },
      { id: "entry", label: "Entry interface", done: p === "entry" || p === "taem" || p === "approach" || p === "rollout" || p === "landed", show: p !== "pad" && p !== "ascent" },
      { id: "taem", label: "Heading alignment", done: p === "approach" || p === "rollout" || p === "landed", show: p === "entry" || p === "taem" || p === "approach" || p === "rollout" || p === "landed" },
      { id: "gear", label: "Gear down", done: this.gear, show: p === "approach" || p === "rollout" || p === "landed" },
      { id: "wheels", label: "Wheel stop", done: p === "landed", show: p === "approach" || p === "rollout" || p === "landed" },
    ];
    return rows.filter((r) => r.show);
  }

  snapshot(): ShuttleSnapshot {
    return {
      version: 1,
      mode: this.mode,
      phase: this.phase,
      get: this.get,
      x: this.x,
      y: this.y,
      z: this.z,
      vx: this.vx,
      vy: this.vy,
      vz: this.vz,
      yaw: this.yaw,
      pitch: this.pitch,
      bank: this.bank,
      mass: this.mass,
      srbProp: this.srbProp,
      omsProp: this.omsProp,
      rcsProp: this.rcsProp,
      fuelCell: this.fuelCell,
      apu: this.apu,
      doorsOpen: this.doorsOpen,
      gear: this.gear,
      heat: this.heat,
      auto: this.auto,
      timeRate: this.timeRate,
      rateLock: this.rateLock,
      srbAttached: this.srbAttached,
      etAttached: this.etAttached,
      dvDeorbit: this.dvDeorbit,
      fail: this.fail,
      callout: this.callout,
    };
  }

  restore(s: ShuttleSnapshot) {
    if (s.version !== 1) return;
    Object.assign(this, s);
    this.running = s.phase !== "pad";
    this.paused = false;
    this.inject = null;
    emit();
  }

  save() {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem("shuttle-deck-save", JSON.stringify(this.snapshot()));
    this.say("Checkpoint saved.");
    emit();
  }

  load() {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem("shuttle-deck-save");
    if (!raw) return false;
    try {
      this.restore(JSON.parse(raw) as ShuttleSnapshot);
      this.say("Checkpoint restored.");
      return true;
    } catch {
      return false;
    }
  }

  notify() {
    emit();
  }
}

export const sim = new ShuttleRuntime();

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getBank: () => number;
      setKeys: (codes: string[]) => void;
      setSteer: (v: number) => void;
      phase: () => string;
      tick: (steps: number) => void;
    };
  }
}

export function attachControlsProbe() {
  if (typeof window === "undefined") return;
  window.__controlsTest = {
    getYaw: () => sim.yaw,
    getSpeed: () => sim.speed(),
    getBank: () => sim.bank,
    setKeys: (codes) => sim.setKeys(codes),
    setSteer: (v) => {
      sim.steerOverride = v;
    },
    phase: () => sim.phase,
    tick: (steps: number) => {
      for (let i = 0; i < steps; i++) sim.step(0.05);
    },
  };
}

