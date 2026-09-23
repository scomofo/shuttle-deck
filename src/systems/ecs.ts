/**
 * Environmental control owner. Simplified cabin loop.
 * Only writer of ecs.*. Same lifecycle as Gemini environmental_control.gd.
 */

import { bus } from "../core/bus.ts";

export class Ecs {
  cabin_kpa = 101.3;
  leak_kpa_s = 0;

  tick(dt: number): void {
    if (dt > 0 && this.leak_kpa_s !== 0) {
      this.cabin_kpa = Math.max(0, this.cabin_kpa - this.leak_kpa_s * dt);
    }
    this.publish_state();
  }

  publish_state(): void {
    bus.set_value("ecs.cabin.kpa", this.cabin_kpa);
    bus.set_value("ecs.cabin.ok", this.cabin_kpa > 55);
  }

  snapshot() {
    return { cabin_kpa: this.cabin_kpa, leak_kpa_s: this.leak_kpa_s };
  }

  restore(d: ReturnType<Ecs["snapshot"]>): void {
    this.cabin_kpa = d.cabin_kpa;
    this.leak_kpa_s = d.leak_kpa_s;
    this.publish_state();
  }
}
