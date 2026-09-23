/**
 * DAP stand-in. Reads ctl.hand.* / ctl.dap.mode and publishes
 * guid.bank_deg, guid.q_cmd, guid.att_hold, and RCS torque.
 * Not the historical digital autopilot. Tagged [estimated].
 */

import { bus } from "../core/bus.ts";
import { len, mul, type Vec3 } from "../core/frames.ts";
import { q_body_x_along, type Quat } from "../dynamics/attitude.ts";

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
    bus.set_value("prop.torque_body_nm", [roll * 4e5, pitch * 6e5, yaw * 3e5]);
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
