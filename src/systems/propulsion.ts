/**
 * MPS / SRB / OMS / RCS command → body force.
 * Gemini splits this across OAMS + RCS + retro. Shuttle keeps one owner
 * for stack propulsion so Dynamics only reads prop.force_body_n.
 *
 * OMS thrust 53.4 kN and Isp 313 s are published AJ10-190 figures
 * (two engines, 26.7 kN each). Ascent SRB/SSME flow rates remain [estimated].
 *
 * P4: the two OMS engines are independent truth (per-engine thrust, per-pod
 * propellant) behind the single cockpit BURN command, and RCS propellant is
 * consumed by actual RCS usage: whenever a non-zero torque is commanded
 * outside the stack config (the aero laws command zero torque, so entry
 * aerosurface flight costs nothing; the DAP hold and hand flying do).
 * Thruster moment arm and RCS Isp are [estimated].
 *
 * Known gap: when RCS depletes, guidance (untouchable in P4) keeps
 * publishing torque. prop.rcs.available is the honest talkback; gating the
 * torque source waits for the DAP model's next touch.
 */

import { bus } from "../core/bus.ts";

const G0 = 9.80665;
const OMS_THRUST_N = 53_400;
const OMS_ENG_THRUST_N = 26_700;
const OMS_ISP_S = 313;
/** RCS thruster moment arm and specific impulse [estimated]. */
const RCS_ARM_M = 5;
const RCS_ISP_S = 280;

export class Propulsion {
  srb_kg = 1_000_000;
  et_kg = 700_000;
  oms_l_kg = 4_000;
  oms_r_kg = 4_000;
  rcs_kg = 1_100;
  srb_attached = true;
  et_attached = true;

  tick(dt: number): void {
    const powered = Boolean(bus.get_value("elec.main_bus.powered", true));
    const phase = String(bus.get_value("mission.phase", "prelaunch"));
    const config = String(bus.get_value("seq.config", "stack"));
    let thrust = 0;
    let eng_l = 0;
    let eng_r = 0;

    if (this.srb_attached && phase === "ascent" && this.srb_kg > 0) {
      thrust += 14.7e6;
      this.srb_kg = Math.max(0, this.srb_kg - 8_000 * dt);
    }
    if (this.et_attached && phase === "ascent" && this.et_kg > 0) {
      thrust += 5.0e6;
      this.et_kg = Math.max(0, this.et_kg - 1_400 * dt);
    }
    if (powered && bus.get_value("ctl.oms.burn", false) && !this.et_attached) {
      const mdot = OMS_ENG_THRUST_N / (OMS_ISP_S * G0);
      if (this.oms_l_kg > 0) {
        eng_l = OMS_ENG_THRUST_N;
        this.oms_l_kg = Math.max(0, this.oms_l_kg - mdot * dt);
      }
      if (this.oms_r_kg > 0) {
        eng_r = OMS_ENG_THRUST_N;
        this.oms_r_kg = Math.max(0, this.oms_r_kg - mdot * dt);
      }
      thrust += eng_l + eng_r;
    }
    if (bus.get_value("mission.event.srb_sep", false)) this.srb_attached = false;
    if (bus.get_value("mission.event.et_sep", false)) this.et_attached = false;

    this.consume_rcs(dt, config);

    bus.set_value("prop.force_body_n", [thrust, 0, 0]);
    bus.set_value("prop.thrust_n", thrust);
    bus.set_value("prop.oms.isp_s", OMS_ISP_S);
    bus.set_value("prop.oms.eng_l.thrust_n", eng_l);
    bus.set_value("prop.oms.eng_r.thrust_n", eng_r);
    bus.set_value("prop.oms.pod_l_kg", this.oms_l_kg);
    bus.set_value("prop.oms.pod_r_kg", this.oms_r_kg);
    bus.set_value("prop.oms.qty_kg", this.oms_l_kg + this.oms_r_kg);
    bus.set_value("prop.srb.qty_kg", this.srb_kg);
    bus.set_value("prop.rcs.qty_kg", this.rcs_kg);
    bus.set_value("prop.rcs.available", this.rcs_kg > 0);
    bus.set_value("prop.srb.attached", this.srb_attached);
    bus.set_value("prop.et.attached", this.et_attached);
  }

  /**
   * RCS propellant follows commanded torque outside the stack config.
   * The aero laws publish zero torque, so aerosurface flight is free;
   * the DAP hold and hand-controller flying draw from the RCS budget.
   */
  private consume_rcs(dt: number, config: string): void {
    if (dt <= 0 || this.rcs_kg <= 0) return;
    if (config !== "orbit" && config !== "entry") return;
    const tq = bus.get_value("prop.torque_body_nm") as number[] | null;
    if (!tq || tq.length !== 3) return;
    const mag = Math.hypot(tq[0], tq[1], tq[2]);
    if (mag <= 0) return;
    const mdot = mag / (RCS_ARM_M * RCS_ISP_S * G0);
    this.rcs_kg = Math.max(0, this.rcs_kg - mdot * dt);
  }

  snapshot() {
    return {
      srb_kg: this.srb_kg,
      et_kg: this.et_kg,
      oms_l_kg: this.oms_l_kg,
      oms_r_kg: this.oms_r_kg,
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
