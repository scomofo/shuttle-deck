/**
 * Owns vehicle truth. Never touches presentation nodes.
 * Port of gemini-capsule src/dynamics/dynamics.gd.
 *
 * Reads:  prop.*.force_body, seq.config, recovery / gear as later systems
 * Writes: dyn.*, aero.*, guid.*, sys.coast_ok, prop.*.qty
 */

import { bus } from "../core/bus.ts";
import { clock } from "../core/clock.ts";
import { add, Frames, len, mul, type Vec3, v3 } from "../core/frames.ts";
import mass_table from "../../assets/data/spacecraft/mass_properties.json" with { type: "json" };
import { Aero } from "./aero.ts";
import { Attitude, type Quat } from "./attitude.ts";
import { Orbit } from "./orbit.ts";

export type ConfigName = "stack" | "orbit" | "entry";

const MASS: Record<ConfigName, number> = {
  stack: mass_table.configurations.stack.mass_kg,
  orbit: mass_table.configurations.orbit.mass_kg,
  entry: mass_table.configurations.entry.mass_kg,
};

export class Dynamics {
  orbit = new Orbit();
  attitude = new Attitude();
  aero = new Aero();
  config: ConfigName = "stack";
  mass = MASS.stack;
  driven = false;
  landed = false;
  accel_g = 0;
  last_aero = {
    q_dyn: 0,
    heating: 0,
    rho: 0,
    alpha_deg: 0,
    lift_to_drag: 0,
  };
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

    if (this.landed) {
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
      if (this.config === "entry" && this.orbit.altitude() < this.aero.atmosphere_top_m) {
        const bank = (Number(bus.get_value("guid.bank_deg", 0)) * Math.PI) / 180;
        const sample = this.aero.accelerations(this.orbit.r, this.orbit.v, this.mass, nose, bank);
        this.last_aero = sample;
        a_eci = add(a_eci, sample.a_eci);
        this.accel_g = len(sample.a_eci) / 9.80665;
      } else {
        this.accel_g = len(a_eci) / 9.80665;
      }
      const torque = bus.get_value("prop.torque_body_nm") as number[] | null;
      this.attitude.step(_dt, torque ? { x: torque[0], y: torque[1], z: torque[2] } : v3());
      this.orbit.step(_dt, a_eci);
      if (this.orbit.altitude() <= 0) {
        this.landed = true;
      }
    }
    this.publish();
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
    return {
      r_eci: [r.x, r.y, r.z],
      v_eci: [v.x, v.y, v.z],
      q: [q.x, q.y, q.z, q.w],
      omega_body: [w.x, w.y, w.z],
      config: this.config,
      driven: this.driven,
      landed: this.landed,
      use_j2: this.orbit.use_j2,
      mass: this.mass,
    };
  }

  restore(d: ReturnType<Dynamics["snapshot"]>): void {
    this.orbit.r = { x: d.r_eci[0], y: d.r_eci[1], z: d.r_eci[2] };
    this.orbit.v = { x: d.v_eci[0], y: d.v_eci[1], z: d.v_eci[2] };
    this.orbit.use_j2 = Boolean(d.use_j2);
    this.attitude.q = { x: d.q[0], y: d.q[1], z: d.q[2], w: d.q[3] };
    this.attitude.omega = { x: d.omega_body[0], y: d.omega_body[1], z: d.omega_body[2] };
    this.set_configuration(d.config as ConfigName);
    this.driven = Boolean(d.driven);
    this.landed = Boolean(d.landed);
    this.mass = d.mass;
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
    bus.set_value("dyn.mass_kg", this.mass);
    bus.set_value("dyn.accel_g", this.accel_g);
    bus.set_value("dyn.landed", this.landed);
    if (this.has_state()) {
      const rp = this.orbit.periapsis_alt_m();
      if (Number.isFinite(rp)) bus.set_value("dyn.periapsis_alt_m", rp);
    }
    bus.set_value("sys.coast_ok", this.coast_ok());
    bus.set_value("aero.q_dyn_pa", this.last_aero.q_dyn);
    bus.set_value("aero.heating_proxy", this.last_aero.heating);
    bus.set_value("aero.alpha_deg", this.last_aero.alpha_deg);
    bus.set_value("aero.lift_to_drag", this.last_aero.lift_to_drag);
    bus.set_value("aero.blackout", this.last_aero.heating > this.aero.blackout_heating);
    bus.set_value(
      "aero.plasma",
      Math.min(3, this.last_aero.heating / this.aero.plasma_heating),
    );
    const ecef = Frames.eci_to_ecef(r, clock.julian_date());
    const geo = Frames.ecef_to_geodetic(ecef);
    bus.set_value("dyn.lat_deg", (geo.lat * 180) / Math.PI);
    bus.set_value("dyn.lon_deg", (geo.lon * 180) / Math.PI);
    bus.set_value("guid.rate.roll", (this.attitude.omega.x * 180) / Math.PI);
    bus.set_value("guid.rate.pitch", (this.attitude.omega.y * 180) / Math.PI);
    bus.set_value("guid.rate.yaw", (this.attitude.omega.z * 180) / Math.PI);
  }
}
