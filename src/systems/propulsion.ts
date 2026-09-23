/**
 * MPS / SRB / OMS / RCS command → body force.
 * Gemini splits this across OAMS + RCS + retro. Shuttle keeps one owner
 * for stack propulsion so Dynamics only reads prop.force_body_n.
 *
 * OMS thrust 53.4 kN and Isp 313 s are published AJ10-190 figures
 * (two engines). Ascent SRB/SSME flow rates remain [estimated].
 */

import { bus } from "../core/bus.ts";

const G0 = 9.80665;
const OMS_THRUST_N = 53_400;
const OMS_ISP_S = 313;

export class Propulsion {
  srb_kg = 1_000_000;
  et_kg = 700_000;
  oms_kg = 8_000;
  rcs_kg = 1_100;
  srb_attached = true;
  et_attached = true;

  tick(dt: number): void {
    const powered = Boolean(bus.get_value("elec.main_bus.powered", true));
    const phase = String(bus.get_value("mission.phase", "prelaunch"));
    let thrust = 0;

    if (this.srb_attached && phase === "ascent" && this.srb_kg > 0) {
      thrust += 14.7e6;
      this.srb_kg = Math.max(0, this.srb_kg - 8_000 * dt);
    }
    if (this.et_attached && phase === "ascent" && this.et_kg > 0) {
      thrust += 5.0e6;
      this.et_kg = Math.max(0, this.et_kg - 1_400 * dt);
    }
    if (powered && bus.get_value("ctl.oms.burn", false) && this.oms_kg > 0 && !this.et_attached) {
      thrust += OMS_THRUST_N;
      const mdot = OMS_THRUST_N / (OMS_ISP_S * G0);
      this.oms_kg = Math.max(0, this.oms_kg - mdot * dt);
    }
    if (bus.get_value("mission.event.srb_sep", false)) this.srb_attached = false;
    if (bus.get_value("mission.event.et_sep", false)) this.et_attached = false;

    bus.set_value("prop.force_body_n", [thrust, 0, 0]);
    bus.set_value("prop.thrust_n", thrust);
    bus.set_value("prop.oms.isp_s", OMS_ISP_S);
    bus.set_value("prop.srb.qty_kg", this.srb_kg);
    bus.set_value("prop.oms.qty_kg", this.oms_kg);
    bus.set_value("prop.rcs.qty_kg", this.rcs_kg);
    bus.set_value("prop.srb.attached", this.srb_attached);
    bus.set_value("prop.et.attached", this.et_attached);
  }

  snapshot() {
    return {
      srb_kg: this.srb_kg,
      et_kg: this.et_kg,
      oms_kg: this.oms_kg,
      rcs_kg: this.rcs_kg,
      srb_attached: this.srb_attached,
      et_attached: this.et_attached,
    };
  }

  restore(d: ReturnType<Propulsion["snapshot"]>): void {
    Object.assign(this, d);
    this.tick(0);
  }
}
