/**
 * Owns vehicle truth. Never touches presentation nodes.
 * Port of gemini-capsule src/dynamics/dynamics.gd.
 *
 * Reads:  prop.*.force_body, seq.config, ctl.gear, ctl.hand.yaw,
 *         guid.eff.*_cmd, guid.brake_cmd
 * Writes: dyn.*, aero.*, guid.*, sys.coast_ok, prop.*.qty
 *
 * Entry/landing: aerodynamic moments feed the quaternion/omega
 * integrator through the same torque path as RCS. Control effectors
 * (elevons, rudder, speed brake, body flap) are integrated here with
 * position and rate limits toward guidance commands. Touchdown latches
 * dyn.landed (weight on wheels); the rollout then integrates runway
 * contact: rolling friction, brake friction, nose-wheel steering, and
 * aerodynamic drag until wheel stop.
 */

import { bus } from "../core/bus.ts";
import { clock } from "../core/clock.ts";
import { add, cross, dot, EARTH_ROTATION_RATE, Frames, len, mul, norm, sub, type Vec3, v3 } from "../core/frames.ts";
import mass_table from "../../assets/data/spacecraft/mass_properties.json" with { type: "json" };
import brake_cfg from "../../assets/data/spacecraft/entry_guidance.json" with { type: "json" };
import { Aero, EFFECTOR_NEUTRAL, type AeroSample, type EffectorDeflection } from "./aero.ts";
import { Attitude, type Quat } from "./attitude.ts";
import { Orbit } from "./orbit.ts";

export type ConfigName = "stack" | "orbit" | "entry";

const MASS: Record<ConfigName, number> = {
  stack: mass_table.configurations.stack.mass_kg,
  orbit: mass_table.configurations.orbit.mass_kg,
  entry: mass_table.configurations.entry.mass_kg,
};

const RE_M = 6_378_137;

type DynamicsTelemetry = { aero: AeroSample; accel_g: number };
const EMPTY_AERO: AeroSample = {
  a_eci: v3(), torque_body: v3(), q_dyn: 0, heating: 0, rho: 0,
  alpha_deg: 0, beta_deg: 0, bank_deg: 0, lift_to_drag: 0, mach: 0,
  cl: 0, cd: 0, cm: 0, blackout: false, plasma: 0,
};
function copyAero(sample: AeroSample): AeroSample {
  return { ...sample, a_eci: { ...sample.a_eci }, torque_body: { ...sample.torque_body } };
}
function validTelemetry(value: DynamicsTelemetry): boolean {
  const sample = value?.aero;
  return Number.isFinite(value?.accel_g) && !!sample && typeof sample.blackout === "boolean" &&
    ["q_dyn", "heating", "rho", "alpha_deg", "beta_deg", "bank_deg", "lift_to_drag", "mach", "cl", "cd", "cm", "plasma"]
      .every(key => Number.isFinite(sample[key as keyof AeroSample])) &&
    [sample.a_eci, sample.torque_body].every(v => !!v && [v.x, v.y, v.z].every(Number.isFinite));
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

export class Dynamics {
  orbit = new Orbit();
  attitude = new Attitude();
  aero = new Aero();
  config: ConfigName = "stack";
  mass = MASS.stack;
  driven = false;
  landed = false;
  /** Rolling on the runway after touchdown, before wheel stop. */
  stopped = true;
  accel_g = 0;
  gear_down = false;
  eff: EffectorDeflection = { ...EFFECTOR_NEUTRAL };
  heat_load_jm2 = 0;
  last_aero: AeroSample = copyAero(EMPTY_AERO);
  last_force_body: Vec3 = v3();

  set_configuration(name: ConfigName): void {
    this.config = name;
    this.mass = MASS[name];
  }

  set_state_eci(r: Vec3, v: Vec3, q: Quat, omega: Vec3 = v3()): void {
    this.orbit.r = r;
    this.orbit.v = v;
    this.attitude.q = q;
    this.attitude.omega = omega;
  }

  has_state(): boolean {
    return len(this.orbit.r) > 1;
  }

  tick(_dt: number): void {
    if (!this.has_state()) return;
    const cfg = String(bus.get_value("seq.config", this.config));
    if ((cfg === "stack" || cfg === "orbit" || cfg === "entry") && cfg !== this.config) {
      this.set_configuration(cfg);
    }

    const ext = bus.get_value("prop.force_body_n") as number[] | null;
    let f_body = v3();
    if (ext && ext.length === 3) f_body = { x: ext[0], y: ext[1], z: ext[2] };
    this.last_force_body = f_body;

    // Frozen only at wheel stop; the rollout keeps integrating.
    if (this.landed && this.stopped) {
      this.publish();
      return;
    }

    if (!this.driven) {
      const q = this.attitude.q;
      const nose = {
        x: 1 - 2 * (q.y * q.y + q.z * q.z),
        y: 2 * (q.x * q.y + q.w * q.z),
        z: 2 * (q.x * q.z - q.w * q.y),
      };
      let a_eci = mul(nose, len(f_body) / this.mass);
      this.step_effectors(_dt);
      this.gear_down = Boolean(bus.get_value("ctl.gear", this.gear_down));
      if (this.config === "entry" && this.orbit.altitude() < this.aero.atmosphere_top_m) {
        const sample = this.aero.accelerations(
          this.orbit.r,
          this.orbit.v,
          this.mass,
          this.attitude.q,
          this.attitude.omega,
          this.eff,
          this.gear_down,
        );
        this.last_aero = sample;
        a_eci = add(a_eci, sample.a_eci);
        this.accel_g = len(sample.a_eci) / 9.80665;
        this.heat_load_jm2 += sample.heating * _dt;
        const tq = bus.get_value("prop.torque_body_nm") as number[] | null;
        const prop_torque = tq && tq.length === 3 ? { x: tq[0], y: tq[1], z: tq[2] } : v3();
        this.attitude.step(
          _dt,
          add(prop_torque, sample.torque_body),
        );
        this.orbit.step(_dt, a_eci);
        if (!this.landed && this.orbit.altitude() <= 0 && this.sinking()) {
          this.touchdown();
        }
        if (this.landed && !this.stopped) {
          this.ground_step(_dt);
        }
      } else {
        this.accel_g = len(a_eci) / 9.80665;
        const torque = bus.get_value("prop.torque_body_nm") as number[] | null;
        this.attitude.step(_dt, torque ? { x: torque[0], y: torque[1], z: torque[2] } : v3());
        this.orbit.step(_dt, a_eci);
        if (this.orbit.altitude() <= 0) {
          this.landed = true;
          this.stopped = true;
        }
      }
    }
    this.publish();
  }

  /** Rate- and position-limited actuator integration toward guid commands. */
  private step_effectors(dt: number): void {
    const cfg = this.aero.eff_cfg as unknown as Record<
      string,
      { min_deg: number; max_deg: number; rate_deg_s: number }
    >;
    const pairs: Array<[keyof EffectorDeflection, string, string]> = [
      ["elevon_l_deg", "elevon", "guid.eff.elevon_l_cmd"],
      ["elevon_r_deg", "elevon", "guid.eff.elevon_r_cmd"],
      ["rudder_deg", "rudder", "guid.eff.rudder_cmd"],
      ["speedbrake_deg", "speedbrake", "guid.eff.speedbrake_cmd"],
      ["bodyflap_deg", "bodyflap", "guid.eff.bodyflap_cmd"],
    ];
    for (const [field, surface, channel] of pairs) {
      const lim = cfg[surface];
      const cmd = clamp(Number(bus.get_value(channel, 0)), lim.min_deg, lim.max_deg);
      const cur = this.eff[field];
      const max_step = lim.rate_deg_s * dt;
      this.eff[field] = clamp(cmd, cur - max_step, cur + max_step);
    }
  }

  private sinking(): boolean {
    const r = this.orbit.r;
    const rn = len(r) || 1;
    return dot(this.orbit.v, { x: r.x / rn, y: r.y / rn, z: r.z / rn }) < 0;
  }

  private touchdown(): void {
    this.landed = true;
    this.stopped = false;
    // Kill the sink rate; the rollout keeps the horizontal velocity.
    const r = this.orbit.r;
    const rn = len(r) || 1;
    const rhat = { x: r.x / rn, y: r.y / rn, z: r.z / rn };
    const vr = dot(this.orbit.v, rhat);
    if (vr < 0) this.orbit.v = sub(this.orbit.v, mul(rhat, vr));
  }

  /**
   * Runway contact: the gear holds the vehicle on the surface while
   * rolling friction, brake friction and nose-wheel steering act on the
   * horizontal velocity. Friction numbers [estimated] for a dry runway.
   */
  private ground_step(dt: number): void {
    const r = this.orbit.r;
    const rn = len(r) || 1;
    const rhat = { x: r.x / rn, y: r.y / rn, z: r.z / rn };
    if (rn < RE_M) this.orbit.r = mul(rhat, RE_M);
    // Work in Earth-relative velocity: the runway corotates, so rolling
    // friction and brakes oppose vrel, not the inertial tangent velocity.
    const wvec = { x: 0, y: 0, z: EARTH_ROTATION_RATE };
    const corot = cross(wvec, this.orbit.r);
    let vrel = sub(this.orbit.v, corot);
    const vr = dot(vrel, rhat);
    if (vr < 0) vrel = sub(vrel, mul(rhat, vr));
    // Horizontal Earth-relative velocity in the local tangent plane.
    let vh = sub(vrel, mul(rhat, dot(vrel, rhat)));
    const spd_h = len(vh);
    if (spd_h > 1e-3) {
      // Nose-wheel steering rotates the heading at the commanded rate.
      const yaw_cmd = clamp(Number(bus.get_value("ctl.hand.yaw", 0)), -1, 1);
      const steer = yaw_cmd * (brake_cfg.brakes.steer_rate_rad_s as number) * dt;
      if (steer !== 0) {
        const c = Math.cos(steer);
        const s = Math.sin(steer);
        // Rodrigues rotation of vh about rhat.
        const cross_rh_vh = {
          x: rhat.y * vh.z - rhat.z * vh.y,
          y: rhat.z * vh.x - rhat.x * vh.z,
          z: rhat.x * vh.y - rhat.y * vh.x,
        };
        vh = add(add(mul(vh, c), mul(cross_rh_vh, s)), mul(rhat, dot(rhat, vh) * (1 - c)));
      }
      // Rolling + brake friction opposes Earth-relative motion.
      const brake = clamp(Number(bus.get_value("guid.brake_cmd", 0)), 0, 1);
      const mu =
        (brake_cfg.brakes.mu_rolling as number) + (brake_cfg.brakes.mu_brake as number) * brake;
      const dv = Math.min(mu * 9.80665 * dt, len(vh));
      vh = mul(norm(vh), len(vh) - dv);
    }
    this.orbit.v = add(vh, corot);
    // Struts damp the rates; the attitude stays where the rollout leaves it.
    const damp = Math.exp(-2 * dt);
    this.attitude.omega = mul(this.attitude.omega, damp);
    if (len(vh) < 0.8) {
      this.orbit.v = corot; // parked: corotating with the runway
      this.stopped = true;
    }
  }

  coast_ok(): boolean {
    if (this.driven || this.landed) return false;
    if (Number(bus.get_value("prop.thrust_n", 0)) > 0) return false;
    if (this.config === "entry" && this.orbit.altitude() < this.aero.atmosphere_top_m) return false;
    return true;
  }

  snapshot() {
    const r = this.orbit.r;
    const v = this.orbit.v;
    const q = this.attitude.q;
    const w = this.attitude.omega;
    // Preserve the last completed sample, which precedes integration within
    // a tick. Recomputing it would subtly change a paused saved instrument.
    // Optional for older schema-2 checkpoints, which did not store telemetry.
    const telemetry: { telemetry?: DynamicsTelemetry } = {
      telemetry: { aero: copyAero(this.last_aero), accel_g: this.accel_g },
    };
    return {
      r_eci: [r.x, r.y, r.z],
      v_eci: [v.x, v.y, v.z],
      q: [q.x, q.y, q.z, q.w],
      omega_body: [w.x, w.y, w.z],
      config: this.config,
      driven: this.driven,
      landed: this.landed,
      stopped: this.stopped,
      gear_down: this.gear_down,
      eff: { ...this.eff },
      heat_load_jm2: this.heat_load_jm2,
      use_j2: this.orbit.use_j2,
      mass: this.mass,
      ...telemetry,
    };
  }

  restore(d: ReturnType<Dynamics["snapshot"]>): void {
    if (d.telemetry !== undefined && !validTelemetry(d.telemetry)) throw new Error("Invalid dynamics telemetry");
    this.orbit.r = { x: d.r_eci[0], y: d.r_eci[1], z: d.r_eci[2] };
    this.orbit.v = { x: d.v_eci[0], y: d.v_eci[1], z: d.v_eci[2] };
    this.orbit.use_j2 = Boolean(d.use_j2);
    this.attitude.q = { x: d.q[0], y: d.q[1], z: d.q[2], w: d.q[3] };
    this.attitude.omega = { x: d.omega_body[0], y: d.omega_body[1], z: d.omega_body[2] };
    this.set_configuration(d.config as ConfigName);
    this.driven = Boolean(d.driven);
    this.landed = Boolean(d.landed);
    this.stopped = d.stopped !== false;
    this.gear_down = Boolean(d.gear_down);
    if (d.eff) this.eff = { ...EFFECTOR_NEUTRAL, ...d.eff };
    this.heat_load_jm2 = Number(d.heat_load_jm2) || 0;
    this.mass = d.mass;
    if (d.telemetry) {
      this.last_aero = copyAero(d.telemetry.aero);
      this.accel_g = d.telemetry.accel_g;
    } else {
      // Old saves recover a coherent sample from saved owner state, without
      // stepping time, moving effectors or integrating heat/trajectory.
      this.last_aero = this.config === "entry" && this.orbit.altitude() < this.aero.atmosphere_top_m
        ? this.aero.accelerations(this.orbit.r, this.orbit.v, this.mass, this.attitude.q, this.attitude.omega, this.eff, this.gear_down)
        : copyAero(EMPTY_AERO);
      this.accel_g = len(this.last_aero.a_eci) / 9.80665;
    }
    this.publish();
  }

  publish(): void {
    const r = this.orbit.r;
    const v = this.orbit.v;
    const q = this.attitude.q;
    bus.set_value("dyn.r_eci_m", [r.x, r.y, r.z]);
    bus.set_value("dyn.v_eci_mps", [v.x, v.y, v.z]);
    bus.set_value("dyn.q_body_from_eci", [q.x, q.y, q.z, q.w]);
    bus.set_value("dyn.alt_m", this.orbit.altitude());
    bus.set_value("dyn.speed_mps", len(v));
    // Earth-relative (ground) speed: dyn.speed_mps is inertial and never
    // drops below corotation on the runway, so the rollout→wheel_stop
    // transition keys off this channel instead.
    bus.set_value(
      "dyn.ground_speed_mps",
      len(sub(v, cross({ x: 0, y: 0, z: EARTH_ROTATION_RATE }, r))),
    );
    bus.set_value("dyn.mass_kg", this.mass);
    bus.set_value("dyn.accel_g", this.accel_g);
    bus.set_value("dyn.landed", this.landed);
    bus.set_value("dyn.gear_down", this.gear_down);
    if (this.has_state()) {
      const rp = this.orbit.periapsis_alt_m();
      if (Number.isFinite(rp)) bus.set_value("dyn.periapsis_alt_m", rp);
    }
    bus.set_value("sys.coast_ok", this.coast_ok());
    bus.set_value("aero.q_dyn_pa", this.last_aero.q_dyn);
    bus.set_value("aero.heating_proxy", this.last_aero.heating);
    bus.set_value("aero.heat_load_jm2", this.heat_load_jm2);
    bus.set_value("aero.alpha_deg", this.last_aero.alpha_deg);
    bus.set_value("aero.beta_deg", this.last_aero.beta_deg);
    bus.set_value("aero.bank_deg", this.last_aero.bank_deg);
    bus.set_value("aero.mach", this.last_aero.mach);
    bus.set_value("aero.cm", this.last_aero.cm);
    bus.set_value("aero.lift_to_drag", this.last_aero.lift_to_drag);
    bus.set_value("aero.blackout", this.last_aero.blackout);
    bus.set_value("aero.plasma", this.last_aero.plasma);
    bus.set_value("aero.gear_down", this.gear_down);
    bus.set_value("aero.eff.elevon_l_deg", this.eff.elevon_l_deg);
    bus.set_value("aero.eff.elevon_r_deg", this.eff.elevon_r_deg);
    bus.set_value("aero.eff.rudder_deg", this.eff.rudder_deg);
    bus.set_value("aero.eff.speedbrake_deg", this.eff.speedbrake_deg);
    bus.set_value("aero.eff.bodyflap_deg", this.eff.bodyflap_deg);
    const ecef = Frames.eci_to_ecef(r, clock.julian_date());
    const geo = Frames.ecef_to_geodetic(ecef);
    bus.set_value("dyn.lat_deg", (geo.lat * 180) / Math.PI);
    bus.set_value("dyn.lon_deg", (geo.lon * 180) / Math.PI);
    bus.set_value("guid.rate.roll", (this.attitude.omega.x * 180) / Math.PI);
    bus.set_value("guid.rate.pitch", (this.attitude.omega.y * 180) / Math.PI);
    bus.set_value("guid.rate.yaw", (this.attitude.omega.z * 180) / Math.PI);
  }
}
