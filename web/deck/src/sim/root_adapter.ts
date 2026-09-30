/**
 * RootAdapter — the root SimRuntime is the single vehicle truth for the
 * browser flight deck (FIDELITY.md P1).
 *
 * Responsibilities:
 * - own one root SimRuntime per scenario and advance its fixed-step clock
 *   (50 Hz, src/core/clock.ts FIXED_DT) from the browser frame loop;
 * - write deck UI control inputs into ctl.* bus channels through the
 *   controls registry (src/controls/registry.ts). The adapter only ever
 *   publishes command channels; system truth stays with the owners;
 * - expose a render view-model read from authoritative channels
 *   (dyn.*, aero.*, prop.*, elec.*, guid.*, mission.*, apu.*, mech.*,
 *   sys.*), converting the ECI/ECEF state into the deck's local ENU
 *   render frame (x = east, y = up, z = north, metres from a scenario anchor).
 *
 * The adapter keeps no vehicle state: doors, gear, APUs, smoke detection,
 * and the weight_on_wheels event are owned by the root systems and the
 * root mission sequencer (P4). It never flies the vehicle itself: no auto
 * deorbit burn, no auto gear, no auto ET separation, no rollout braking.
 *
 * Remaining honest deck-side duties (display/scene, not vehicle truth):
 * - entry/approach start states are constructed here from a scenario
 *   anchor; the root mission data has no entry-interface or final-approach
 *   initial conditions (P2 golden trajectory).
 * - the "lost" phase is never entered: failure modeling is P2/P3 work.
 *
 * Bundling: this imports the prebuilt root sim under ../gen (see
 * scripts/gen-root-sim.mjs). The prebuild compiles repo src/ to plain JS +
 * .d.ts so the root's explicit `.ts` import extensions and
 * `with { type: "json" }` import attributes never reach Vite, and the
 * deck's strict typecheck stays independent of root's pre-existing
 * strict-mode type errors. No root file is modified.
 */

import { SimRuntime } from "../gen/src/core/runtime.js";
import { bus } from "../gen/src/core/bus.js";
import { clock } from "../gen/src/core/clock.js";
import { Frames } from "../gen/src/core/frames.js";
import { v_rel } from "../gen/src/dynamics/aero.js";

export type DeckPhase =
  | "pad"
  | "ascent"
  | "orbit"
  | "entry"
  | "taem"
  | "approach"
  | "rollout"
  | "landed"
  | "lost";

export type AdapterStartMode = "launch" | "orbit" | "entry" | "approach";

export interface StepInput {
  roll: number;
  pitch: number;
  yaw: number;
  burnKey: boolean;
  timeRate: number;
}

/** Where the scene anchors the runway/HAC visuals in the local frame. */
export interface TerminalAnchor {
  x: number;
  z: number;
  /** Deck yaw (rad) of the vehicle when the anchor was recorded. */
  yaw: number;
}

export interface DeckView {
  phase: DeckPhase;
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
  speed: number;
  horizSpeed: number;
  mach: number;
  qbar: number;
  alpha: number;
  gLoad: number;
  plume: number;
  plasma: number;
  blackout: boolean;
  busVolts: number;
  fuelCell: boolean;
  mass: number;
  srbProp: number;
  omsProp: number;
  rcsProp: number;
  srbAttached: boolean;
  etAttached: boolean;
  srbSepAge: number;
  etSepAge: number;
  lat: number;
  lon: number;
  terminalAnchor: TerminalAnchor | null;
  burnActive: boolean;
  /** Flight-director steering from the root guidance owner (P3). */
  fdBank: number;
  fdPitch: number;
  altErr: number;
}

const ROOT_PHASE_TO_DECK: Record<string, DeckPhase> = {
  prelaunch: "pad",
  ascent: "ascent",
  insertion: "orbit",
  orbit: "orbit",
  deorbit: "orbit",
  entry: "entry",
  taem: "taem",
  approach: "approach",
  rollout: "rollout",
  wheel_stop: "landed",
};

/** P4: the root SimRuntime owns ALL vehicle state; the adapter keeps none. */
const SRB_QTY_KG = 1_000_000;
const OMS_QTY_KG = 8_000;
const RCS_QTY_KG = 1_100;
const EARTH_R = 6_378_137;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

type Vec3 = { x: number; y: number; z: number };
const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return scale(a, 1 / l);
};

type Enu = { east: Vec3; north: Vec3; up: Vec3 };

/** Local east/north/up unit vectors in ECEF at a spherical lat/lon (radians). */
function enuBasis(lat: number, lon: number): Enu {
  return {
    east: { x: -Math.sin(lon), y: Math.cos(lon), z: 0 },
    north: {
      x: -Math.sin(lat) * Math.cos(lon),
      y: -Math.sin(lat) * Math.sin(lon),
      z: Math.cos(lat),
    },
    up: {
      x: Math.cos(lat) * Math.cos(lon),
      y: Math.cos(lat) * Math.sin(lon),
      z: Math.sin(lat),
    },
  };
}

/** ECEF vector → deck components (x = east, y = up, z = north) in a local basis. */
function toEnu(e: Vec3, b: Enu): Vec3 {
  return {
    x: e.x * b.east.x + e.y * b.east.y + e.z * b.east.z,
    y: e.x * b.up.x + e.y * b.up.y + e.z * b.up.z,
    z: e.x * b.north.x + e.y * b.north.y + e.z * b.north.z,
  };
}

/** Wings-level body basis in ECI: nose along the Earth-relative velocity. */
function levelBasis(r: Vec3, v: Vec3): { xb: Vec3; yb: Vec3; zb: Vec3 } {
  const up = norm(r);
  const xb = norm(v_rel(r, v));
  const yb = norm(cross(xb, up));
  const zb = cross(xb, yb);
  return { xb, yb, zb };
}

type Quat = { x: number; y: number; z: number; w: number };

/** Rotation matrix (columns = body axes in ECI) → quaternion. */
function matToQuat(xb: Vec3, yb: Vec3, zb: Vec3): Quat {
  const r00 = xb.x, r10 = xb.y, r20 = xb.z;
  const r01 = yb.x, r11 = yb.y, r21 = yb.z;
  const r02 = zb.x, r12 = zb.y, r22 = zb.z;
  const tr = r00 + r11 + r22;
  let x = 0, y = 0, z = 0, w = 1;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = s / 4; x = (r21 - r12) / s; y = (r02 - r20) / s; z = (r10 - r01) / s;
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
    x = s / 4; y = (r01 + r10) / s; z = (r02 + r20) / s; w = (r21 - r12) / s;
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    y = s / 4; x = (r01 + r10) / s; z = (r12 + r21) / s; w = (r02 - r20) / s;
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    z = s / 4; x = (r02 + r20) / s; y = (r12 + r21) / s; w = (r10 - r01) / s;
  }
  return { x, y, z, w };
}

/** Body +X (nose) in ECI from the bus quaternion [x, y, z, w]. */
function noseEci(q: number[]): Vec3 {
  const [x, y, z, w] = q;
  return {
    x: 1 - 2 * (y * y + z * z),
    y: 2 * (x * y + w * z),
    z: 2 * (x * z - w * y),
  };
}

/** Body +Y (right wing) in ECI from the bus quaternion [x, y, z, w]. */
function rightEci(q: number[]): Vec3 {
  const [x, y, z, w] = q;
  return {
    x: 2 * (x * y - w * z),
    y: 1 - 2 * (x * x + z * z),
    z: 2 * (y * z + w * x),
  };
}

export class RootAdapter {
  /**
   * Rebuilt on every start(): the root SimRuntime owns ALL vehicle state,
   * so a new scenario begins from pristine owner truth. The adapter keeps
   * no vehicle state of its own — it is a view-model plus a ctl.* writer.
   */
  runtime = new SimRuntime();

  running = false;
  paused = false;

  // View-only deck state (callouts, shake, failure banner): not vehicle truth.
  callout = "";
  calloutT = 0;
  shake = 0;
  fail = "";

  private vm: DeckView = RootAdapter.emptyView();
  private seenEvents = new Set<string>();
  private terminalAnchor: TerminalAnchor | null = null;
  private lastRootPhase = "";

  // Scenario anchor (geodetic origin of the deck's x/z grid).
  private anchorLat = 0;
  private anchorLon = 0;
  /** Unwrapped longitude offset from the anchor, so x stays continuous across orbits. */
  private prevDlon = 0;
  private prevYaw = -Math.PI / 2;
  private prevBank = 0;

  private static emptyView(): DeckView {
    return {
      phase: "pad", get: 0,
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
      yaw: -Math.PI / 2, pitch: 0, bank: 0,
      speed: 0, horizSpeed: 0, mach: 0,
      qbar: 0, alpha: 0, gLoad: 1,
      plume: 0, plasma: 0, blackout: false,
      busVolts: 28, fuelCell: true,
      mass: 0, srbProp: 1, omsProp: 1, rcsProp: 1,
      srbAttached: true, etAttached: true,
      srbSepAge: 0, etSepAge: 0,
      lat: 0, lon: 0, terminalAnchor: null, burnActive: false,
      fdBank: 0, fdPitch: 0, altErr: 0,
    };
  }

  view(): DeckView {
    return this.vm;
  }

  // ---------------------------------------------------------------- start

  start(mode: AdapterStartMode): void {
    // Fresh root truth every scenario: clock.reset clears the old tickers
    // so the new SimRuntime binds exactly one set. No owner fields are
    // poked — initial conditions come from the owners themselves.
    clock.reset(0);
    this.runtime = new SimRuntime();
    this.running = true;
    this.paused = false;
    clock.paused = false;
    this.callout = "";
    this.calloutT = 0;
    this.shake = 0;
    this.fail = "";
    this.seenEvents.clear();
    this.terminalAnchor = null;
    this.lastRootPhase = "";
    this.prevYaw = -Math.PI / 2;
    this.prevBank = 0;

    const rootPhase = mode === "launch" ? "ascent" : mode;
    if (mode === "launch" || mode === "orbit") {
      // Pad anchor: KSC 39A area, matches the root ascent profile row 0.
      this.setAnchor(28.6, -80.6);
      this.runtime.start(rootPhase);
    } else if (mode === "entry") {
      this.setAnchor(25.0, -60.0);
      this.runtime.start("entry");
      this.placeEntryInterface();
    } else {
      this.setAnchor(28.6, -80.6);
      this.runtime.start("approach");
      this.placeApproach();
    }
    // start_in_orbit (used for the orbit/entry/approach starts) pre-fires the
    // ascent events; mark them seen so pollEvents doesn't announce them as
    // if they just happened.
    for (const id of ["liftoff", "srb_sep", "meco", "et_sep"]) {
      if (this.bool(`mission.event.${id}`, false)) this.seenEvents.add(id);
    }
    // Manual DAP; the guidance auto-engages retrograde while the OMS burns.
    this.runtime.controls.set("DapRetro", false);
    this.refresh();
    this.say(
      mode === "launch"
        ? "Main engines at throttle. Tower cleared when you are."
        : mode === "orbit"
          ? "On orbit. Hold B for the deorbit burn."
          : mode === "entry"
            ? "Entry interface. Hold the corridor with bank."
            : "Final. Gear below 160 meters per second.",
    );
    this.lastRootPhase = this.rootPhase();
  }

  /** Scenario anchor from a geodetic origin (spherical Earth, display only). */
  private setAnchor(latDeg: number, lonDeg: number): void {
    this.anchorLat = latDeg;
    this.anchorLon = lonDeg;
    this.prevDlon = 0;
  }

  /**
   * Build an ECI state from a local-ENU position/velocity (display-frame
   * scenario setup; the root mission data has no entry/approach starts).
   */
  private eciFromLocal(x: number, y: number, z: number, ve: number, vn: number, vu: number): { r: Vec3; v: Vec3 } {
    const lat0 = (this.anchorLat * Math.PI) / 180;
    const lon0 = (this.anchorLon * Math.PI) / 180;
    const lat = lat0 + z / EARTH_R;
    const lon = lon0 + x / (EARTH_R * Math.cos(lat0));
    const rad = EARTH_R + y;
    const rEcef: Vec3 = {
      x: rad * Math.cos(lat) * Math.cos(lon),
      y: rad * Math.cos(lat) * Math.sin(lon),
      z: rad * Math.sin(lat),
    };
    const { east, north, up } = enuBasis(lat, lon);
    const vEcef = add(add(scale(east, ve), scale(north, vn)), scale(up, vu));
    const jd = clock.julian_date();
    const r = Frames.ecef_to_eci(rEcef, jd);
    const vRot = Frames.ecef_to_eci(vEcef, jd);
    const w = 7.292115e-5;
    return { r, v: { x: vRot.x - w * r.y, y: vRot.y + w * r.x, z: vRot.z } };
  }

  private placeWithVelocity(x: number, y: number, z: number, ve: number, vn: number, vu: number): void {
    // Reset the clock BEFORE building the ECI state: julian_date() (hence the
    // ECI↔ECEF rotation) depends on get_seconds, so the state must be built
    // at the epoch refresh() will read it back at.
    clock.get_seconds = 0;
    const { r, v } = this.eciFromLocal(x, y, z, ve, vn, vu);
    // Wings-level basis: nose along the Earth-relative velocity.
    // (q_body_x_along alone leaves roll about the nose arbitrary.)
    const { xb, yb, zb } = levelBasis(r, v);
    const q = matToQuat(xb, yb, zb);
    this.runtime.dynamics.set_state_eci(r, v, q);
    this.runtime.dynamics.driven = false;
    this.runtime.dynamics.landed = false;
    this.runtime.dynamics.publish();
  }

  /** Entry interface: 121.92 km, ~7.45 km/s east, slight negative flight-path angle. */
  private placeEntryInterface(): void {
    this.placeWithVelocity(-3_840_000, 121_920, 0, 7_447, 0, -195);
    this.shake = Math.max(this.shake, 0.3);
  }

  /** Short final: 11 km out, 1980 m, 148 m/s toward +x. */
  private placeApproach(): void {
    this.placeWithVelocity(-11_000, 1_980, 0, 148, 0, -26);
    this.refresh();
    this.recordTerminalAnchor(11_000, 0);
  }

  // ---------------------------------------------------------------- step

  setPaused(paused: boolean): void {
    this.paused = paused;
    clock.paused = paused;
  }

  say(text: string): void {
    this.callout = text;
    this.calloutT = 0;
  }

  /** Crew gear command → ctl.* only; the mechanisms owner sequences ARM/DN. */
  setGear(down: boolean): void {
    this.runtime.controls.set("Gear", down);
  }

  /** Crew APU command → ctl.* only; the APU owner handles spool and hydraulics. */
  setApu(n: 1 | 2 | 3, on: boolean): void {
    this.runtime.controls.set(`Apu${n}`, on);
  }

  /** Crew payload-bay-door command → ctl.* only; the mechanisms owner sequences latches. */
  setDoors(open: boolean): void {
    this.runtime.controls.set("Plbd", open);
  }

  /** Read a root truth channel for the view-model (never a command echo). */
  readBool(channel: string, fallback = false): boolean {
    return this.bool(channel, fallback);
  }

  readNum(channel: string, fallback = 0): number {
    return this.num(channel, fallback);
  }

  readText(channel: string, fallback = ""): string {
    const v = bus.get_value(channel, null);
    return typeof v === "string" ? v : fallback;
  }

  /**
   * RCS firing truth: the guidance aero laws publish zero torque (moments
   * come from the aerosurfaces), so a non-zero torque in an RCS-effector
   * config with propellant aboard means the RCS is actually firing.
   */
  rcsFiring(): boolean {
    const tq = this.arr("prop.torque_body_nm", 3);
    if (Math.hypot(tq[0], tq[1], tq[2]) <= 0) return false;
    const config = String(bus.get_value("seq.config", "stack"));
    return (config === "orbit" || config === "entry") && this.bool("prop.rcs.available", false);
  }

  /** Advance the root fixed-step clock and refresh the view model. */
  step(wallDt: number, input: StepInput): void {
    if (!this.running || this.paused) return;
    const wall = Math.min(Math.max(wallDt, 0), 0.05);
    const c = this.runtime.controls;

    // INPUT: crew commands → ctl.* only (bus ownership rules). The adapter
    // never flies the vehicle itself: no auto deorbit burn, no auto gear,
    // no auto ET separation — those are crew actions or root mission events.
    c.set_hand(input.pitch, input.yaw, input.roll);
    c.set("OmsBurn", input.burnKey);

    const simDt = wall * input.timeRate;
    clock.frame(simDt);
    // Refresh first so phase-enter duties (terminal anchor) read the
    // post-step view, not the stale pre-step one.
    this.refresh();

    // Post-step deck duties that the root mission data does not cover.
    const now = this.rootPhase();
    if (now !== this.lastRootPhase) this.onPhaseEnter(now);

    this.pollEvents();
    this.shake = Math.max(0, this.shake - wall * 0.8);
    this.calloutT += wall;
  }

  private onPhaseEnter(phase: string): void {
    if (phase === "taem") this.recordTerminalAnchor(11_000, 5_000);
    else if (phase === "approach" && !this.terminalAnchor) this.recordTerminalAnchor(11_000, 0);
    if (phase === "wheel_stop") this.noteLanding();
    this.lastRootPhase = phase;
  }

  /**
   * Record where the scene anchors the runway/HAC visuals: the group keeps
   * the old fixed layout, shifted so the layout's historic vehicle
   * position lands on the vehicle. (dx, dz) is that historic position.
   */
  private recordTerminalAnchor(dx: number, dz: number): void {
    this.terminalAnchor = { x: this.vm.x + dx, z: this.vm.z + dz, yaw: this.vm.yaw };
  }

  private pollEvents(): void {
    for (const [id, text, shake] of [
      ["srb_sep", "Solid rockets have separated.", 1],
      ["meco", "Main engine cutoff.", 0.4],
      ["et_sep", "External tank clear. You are in orbit.", 1],
      ["entry_interface", "Entry interface.", 0.3],
      ["weight_on_wheels", "Touchdown.", 0.85],
      ["wheel_stop", "Wheel stop. Welcome home.", 0],
    ] as Array<[string, string, number]>) {
      if (this.seenEvents.has(id)) continue;
      if (this.bool(`mission.event.${id}`, false)) {
        this.seenEvents.add(id);
        this.say(text);
        this.shake = Math.max(this.shake, shake);
      }
    }
  }

  private noteLanding(): void {
    if (typeof localStorage === "undefined") return;
    try {
      const prev = JSON.parse(localStorage.getItem("shuttle-deck-stats") || "{}") as { landings?: number };
      localStorage.setItem("shuttle-deck-stats", JSON.stringify({ landings: (prev.landings ?? 0) + 1 }));
    } catch {
      /* ignore quota */
    }
  }

  snapshotRoot(): ReturnType<SimRuntime["snapshot"]> {
    return this.runtime.snapshot();
  }

  restoreRoot(d: ReturnType<SimRuntime["snapshot"]>): boolean {
    const ok = this.runtime.restore(d);
    if (ok) {
      this.lastRootPhase = this.rootPhase();
      this.refresh();
    }
    return ok;
  }

  // ---------------------------------------------------------------- view

  private rootPhase(): string {
    return String(bus.get_value("mission.phase", "prelaunch"));
  }

  private num(channel: string, fallback: number): number {
    const v = bus.get_value(channel, null);
    return typeof v === "number" ? v : fallback;
  }

  private bool(channel: string, fallback: boolean): boolean {
    const v = bus.get_value(channel, null);
    return typeof v === "boolean" ? v : fallback;
  }

  private arr(channel: string, n: number): number[] {
    const v: unknown = bus.get_value(channel, null);
    if (Array.isArray(v) && v.length === n && v.every((e) => typeof e === "number")) return v as number[];
    return new Array(n).fill(0);
  }

  /** Re-read every instrument from its authoritative bus channel. */
  refresh(): void {
    const r = this.arr("dyn.r_eci_m", 3);
    const v = this.arr("dyn.v_eci_mps", 3);
    const q = this.arr("dyn.q_body_from_eci", 4);
    const jd = clock.julian_date();
    const rEcef = Frames.eci_to_ecef({ x: r[0], y: r[1], z: r[2] }, jd);
    // Position: the inverse of eciFromLocal (spherical Earth). y is height
    // above the sphere and x/z are arc lengths from the anchor, so the deck
    // stays meaningful thousands of km downrange. A tangent plane fixed at
    // the anchor drops below the vehicle as the Earth curves away: on orbit
    // it read ALT as millions of metres negative and tilted the attitude.
    const rad = Math.hypot(rEcef.x, rEcef.y, rEcef.z);
    const lat = rad > 1 ? Math.asin(clamp(rEcef.z / rad, -1, 1)) : 0;
    const lon = Math.atan2(rEcef.y, rEcef.x);
    const lat0 = (this.anchorLat * Math.PI) / 180;
    const lon0 = (this.anchorLon * Math.PI) / 180;
    let dlon = lon - lon0;
    dlon += 2 * Math.PI * Math.round((this.prevDlon - dlon) / (2 * Math.PI));
    this.prevDlon = dlon;
    const p = { x: dlon * EARTH_R * Math.cos(lat0), y: rad - EARTH_R, z: (lat - lat0) * EARTH_R };
    // Velocity and attitude are read against the local vertical at the vehicle.
    const local = enuBasis(lat, lon);
    // Deck instruments read Earth-relative velocity (the old deck's flat
    // frame was Earth-relative; the root publishes inertial dyn.speed_mps).
    const rV = { x: r[0], y: r[1], z: r[2] };
    const vI = { x: v[0], y: v[1], z: v[2] };
    const vr = v_rel(rV, vI);
    const vEcef = Frames.eci_to_ecef(vr, jd);
    const vv = toEnu(vEcef, local);
    const relSpeed = Math.hypot(vr.x, vr.y, vr.z);

    const nEcef = Frames.eci_to_ecef(noseEci(q), jd);
    const wEcef = Frames.eci_to_ecef(rightEci(q), jd);
    const n = toEnu(nEcef, local);
    const rw = toEnu(wEcef, local);
    let { yaw, bank } = { yaw: this.prevYaw, bank: this.prevBank };
    const nh = Math.hypot(n.x, n.z);
    if (nh > 1e-3) {
      yaw = Math.atan2(-n.x, -n.z);
      // Zero-bank right wing r0 = up × n (deck convention: right × up = nose).
      const r0x = n.z / nh;
      const r0z = -n.x / nh;
      // d0 = n × r0.
      const d0x = n.y * r0z - n.z * 0;
      const d0y = n.z * r0x - n.x * r0z;
      const d0z = n.x * 0 - n.y * r0x;
      bank = Math.atan2(rw.x * d0x + rw.y * d0y + rw.z * d0z, rw.x * r0x + rw.z * r0z);
      this.prevYaw = yaw;
      this.prevBank = bank;
    }
    const pitch = Math.asin(clamp(n.y, -1, 1));

    const rootPhase = this.rootPhase();
    const phase: DeckPhase = ROOT_PHASE_TO_DECK[rootPhase] ?? "pad";
    const get = clock.get_seconds;
    const speed = relSpeed;
    const thrust = this.num("prop.thrust_n", 0);
    const burnSwitch = this.bool("ctl.oms.burn", false);
    const fuelCell =
      this.bool("elec.source.fuel_cell_1.on", false) ||
      this.bool("elec.source.fuel_cell_2.on", false) ||
      this.bool("elec.source.fuel_cell_3.on", false);
    const srbSepGet = this.num("mission.event_get.srb_sep", -1);
    const etSepGet = this.num("mission.event_get.et_sep", -1);

    this.vm = {
      phase,
      get,
      x: p.x, y: p.y, z: p.z,
      vx: vv.x, vy: vv.y, vz: vv.z,
      yaw, pitch, bank,
      speed,
      horizSpeed: Math.hypot(vv.x, vv.z),
      mach: speed / 295,
      qbar: this.num("aero.q_dyn_pa", 0),
      alpha: (this.num("aero.alpha_deg", 0) * Math.PI) / 180,
      gLoad: this.num("dyn.accel_g", 1),
      plume: phase === "ascent" ? clamp(thrust / 24e6, 0, 1) : burnSwitch && phase === "orbit" ? 0.45 : 0,
      plasma: clamp(this.num("aero.plasma", 0) / 3, 0, 1),
      blackout: this.bool("aero.blackout", false),
      busVolts: this.num("elec.main_bus.volts", 0),
      fuelCell,
      mass: this.num("dyn.mass_kg", 0),
      srbProp: clamp(this.num("prop.srb.qty_kg", 0) / SRB_QTY_KG, 0, 1),
      omsProp: clamp(this.num("prop.oms.qty_kg", 0) / OMS_QTY_KG, 0, 1),
      rcsProp: clamp(this.num("prop.rcs.qty_kg", 0) / RCS_QTY_KG, 0, 1),
      srbAttached: this.bool("prop.srb.attached", false),
      etAttached: this.bool("prop.et.attached", false),
      srbSepAge: srbSepGet >= 0 ? Math.max(0, get - srbSepGet) : 0,
      etSepAge: etSepGet >= 0 ? Math.max(0, get - etSepGet) : 0,
      lat: this.num("dyn.lat_deg", 0),
      lon: this.num("dyn.lon_deg", 0),
      terminalAnchor: this.terminalAnchor,
      burnActive: burnSwitch,
      fdBank: (this.num("guid.fd.bank_deg", 0) * Math.PI) / 180,
      fdPitch: (this.num("guid.fd.pitch_deg", 0) * Math.PI) / 180,
      altErr: this.num("guid.fd.alt_err_m", 0),
    };
  }
}
