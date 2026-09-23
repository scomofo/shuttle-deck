/**
 * DAP stand-in. Reads ctl.hand.* and publishes guid.bank_deg / torque.
 * ACE-equivalent for the orbiter: not the historical digital autopilot,
 * tagged [estimated], same bus shape as Gemini guidance/ACE.
 */

import { bus } from "../core/bus.ts";

export class Guidance {
  bank_deg = 0;
  auto = true;

  tick(dt: number): void {
    const locked = Boolean(bus.get_value("sys.controls_locked", false));
    const roll = locked ? 0 : Number(bus.get_value("ctl.hand.roll", 0));
    if (!this.auto || Math.abs(roll) > 0.05) {
      this.bank_deg = clamp(this.bank_deg + roll * 40 * dt, -70, 70);
    }
    const pitch = locked ? 0 : Number(bus.get_value("ctl.hand.pitch", 0));
    const yaw = locked ? 0 : Number(bus.get_value("ctl.hand.yaw", 0));
    bus.set_value("guid.bank_deg", this.bank_deg);
    bus.set_value("prop.torque_body_nm", [roll * 4e5, pitch * 6e5, yaw * 3e5]);
  }

  snapshot() {
    return { bank_deg: this.bank_deg, auto: this.auto };
  }

  restore(d: { bank_deg: number; auto: boolean }): void {
    this.bank_deg = d.bank_deg;
    this.auto = d.auto;
    this.tick(0);
  }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
