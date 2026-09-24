/**
 * DAP stand-in. Reads ctl.hand.* / ctl.dap.mode and publishes
 * guid.bank_deg, guid.q_cmd, guid.att_hold, and RCS torque.
 * Not the historical digital autopilot. Tagged [estimated].
 */

import { bus } from "../core/bus.ts";
import { len, mul, type Vec3, v3 } from "../core/frames.ts";
import { ORBITER_INERTIA, q_body_x_along, qconj, qmul, type Quat } from "../dynamics/attitude.ts";

export type DapMode = "manual" | "lvlh" | "retrograde" | "entry";

export class Guidance {
  bank_deg = 0;
  auto = true;
  mode: DapMode = "manual";
  q_cmd: Quat = { x: 0, y: 0, z: 0, w: 1 };
  att_hold = false;

  tick(dt: number): void {
    const locked = Boolean(bus.get_value("sys.controls_locked", false));
    const requested = String(bus.get_value("ctl.dap.mode", this.mode));
    if (requested === "manual" || requested === "lvlh" || requested === "retrograde" || requested === "entry") {
      this.mode = requested;
    }
    if (bus.get_value("ctl.oms.burn", false) && this.mode === "manual") this.mode = "retrograde";

    const roll = locked ? 0 : Number(bus.get_value("ctl.hand.roll", 0));
    if (!this.auto || Math.abs(roll) > 0.05) {
      this.bank_deg = clamp(this.bank_deg + roll * 40 * dt, -70, 70);
    }
    const pitch = locked ? 0 : Number(bus.get_value("ctl.hand.pitch", 0));
    const yaw = locked ? 0 : Number(bus.get_value("ctl.hand.yaw", 0));

    this.att_hold = false;
    const v = bus.get_value("dyn.v_eci_mps") as number[] | null;
    if (this.mode === "retrograde" && v && v.length === 3) {
      const vel: Vec3 = { x: v[0], y: v[1], z: v[2] };
      const n = len(vel) || 1;
      this.q_cmd = q_body_x_along(mul(vel, -1 / n));
      this.att_hold = true;
    }

    bus.set_value("guid.mode", this.mode);
    bus.set_value("guid.att_hold", this.att_hold);
    bus.set_value("guid.q_cmd", [this.q_cmd.x, this.q_cmd.y, this.q_cmd.z, this.q_cmd.w]);
    bus.set_value("guid.bank_deg", this.bank_deg);
    const torque = this.att_hold ? this.hold_torque() : { x: roll * 4e5, y: pitch * 6e5, z: yaw * 3e5 };
    bus.set_value("prop.torque_body_nm", [torque.x, torque.y, torque.z]);
  }

  /**
   * PD servo toward guid.q_cmd. When the DAP owns attitude the hand
   * controller is ignored. Gains are [estimated]; the DAP is a stand-in,
   * not the historical phase plane.
   */
  private hold_torque(): Vec3 {
    const qv = bus.get_value("dyn.q_body_from_eci") as number[] | null;
    if (!qv || qv.length !== 4) return v3();
    const q = { x: qv[0], y: qv[1], z: qv[2], w: qv[3] };
    // Error rotation from the current body frame to the commanded one,
    // expressed in body axes: q_err = q^-1 * q_cmd.
    let qe = qmul(qconj(q), this.q_cmd);
    if (qe.w < 0) qe = { x: -qe.x, y: -qe.y, z: -qe.z, w: -qe.w };
    const w = Math.min(1, Math.max(-1, qe.w));
    const angle = 2 * Math.acos(w);
    const s = Math.sqrt(Math.max(0, 1 - w * w));
    const axis = s > 1e-6 ? { x: qe.x / s, y: qe.y / s, z: qe.z / s } : { x: 0, y: 0, z: 0 };
    const om = {
      x: (Number(bus.get_value("guid.rate.roll", 0)) * Math.PI) / 180,
      y: (Number(bus.get_value("guid.rate.pitch", 0)) * Math.PI) / 180,
      z: (Number(bus.get_value("guid.rate.yaw", 0)) * Math.PI) / 180,
    };
    const KP = 0.05;
    const KD = 0.45;
    const TMAX = 8e5;
    return {
      x: clamp(ORBITER_INERTIA.x * (KP * angle * axis.x - KD * om.x), -TMAX, TMAX),
      y: clamp(ORBITER_INERTIA.y * (KP * angle * axis.y - KD * om.y), -TMAX, TMAX),
      z: clamp(ORBITER_INERTIA.z * (KP * angle * axis.z - KD * om.z), -TMAX, TMAX),
    };
  }

  snapshot() {
    return { bank_deg: this.bank_deg, auto: this.auto, mode: this.mode };
  }

  restore(d: { bank_deg: number; auto: boolean; mode?: DapMode }): void {
    this.bank_deg = d.bank_deg;
    this.auto = d.auto;
    if (d.mode) this.mode = d.mode;
    this.tick(0);
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
