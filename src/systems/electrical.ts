/**
 * Fuel-cell / bus electrical owner. Same lifecycle as Gemini electrical.gd:
 * initialize, tick, snapshot, restore, publish_state.
 * Topology is simplified (three fuel cells → main bus → loads) but the
 * ownership rule is not: this module is the only writer of elec.*.
 */

import { bus } from "../core/bus.ts";

export class Electrical {
  cells = [true, true, true];
  main_volts = 28.0;
  loads_a = 42;

  tick(dt: number): void {
    const online = this.cells.filter((c, i) => c && bus.get_value(`ctl.elec.fuel_cell_${i + 1}`, true)).length;
    const sag = this.loads_a * 0.02;
    this.main_volts = online === 0 ? 0 : 28.4 - sag / online - (online < 2 ? 1.2 : 0);
    if (dt === 0) {
      /* publish-only restore tick — no extra drain */
    }
    this.publish_state();
  }

  publish_state(): void {
    bus.set_value("elec.main_bus.volts", this.main_volts);
    bus.set_value("elec.main_bus.powered", this.main_volts > 18);
    this.cells.forEach((on, i) => bus.set_value(`elec.source.fuel_cell_${i + 1}.on`, on));
  }

  snapshot() {
    return { cells: [...this.cells], main_volts: this.main_volts };
  }

  restore(d: { cells: boolean[]; main_volts: number }): void {
    this.cells = [...d.cells];
    this.main_volts = d.main_volts;
    this.publish_state();
  }
}
