/**
 * Fuel-cell / main-bus owner.
 *
 * Panel R1 FC/MAIN BUS and MN BUS TIE switches are momentary. They publish
 * ctl.* only while held. This module owns the contactor latch and the
 * talkback. A talkback is contactor position, not bus voltage.
 *
 * Source (described, not a measured transit time):
 * USA005437 Rev. A §4.6.1.1 — hold FC/MAIN BUS to ON until the talkback
 * indicates ON; that closes the power contactor. MN BUS TIE works the
 * same way onto the tie bus. Dedicated pairing is FC1–MN A, FC2–MN B,
 * FC3–MN C. USA007587 Rev. A §2.8 — both tie switches must be ON before
 * two main buses are connected.
 *
 * Not in this slice: the other six FC-to-bus paths, contactor transit,
 * and barberpole. Talkback steps ON/OFF in the same fixed step. That is
 * functional causality, not timing fidelity.
 */

import { bus } from "../core/bus.ts";

type BusId = "a" | "b" | "c";

export class Electrical {
  cells = [true, true, true];
  contactors = { fc1_mna: true, fc2_mnb: true, fc3_mnc: true };
  ties = { a: false, b: false, c: false };
  main_volts = 28;
  bus_powered: Record<BusId, boolean> = { a: true, b: true, c: true };
  loads_a = 42;

  constructor() {
    this.recompute();
  }

  tick(dt: number): void {
    if (dt !== 0) this.apply_commands();
    this.recompute();
    this.publish_state();
  }

  publish_state(): void {
    bus.set_value("elec.main_bus.volts", this.main_volts);
    bus.set_value("elec.main_bus.powered", this.main_volts > 18);
    this.cells.forEach((on, i) => bus.set_value(`elec.source.fuel_cell_${i + 1}.on`, on && this.fc_commanded(i)));
    bus.set_value("elec.talkback.fc1_mn_a", this.contactors.fc1_mna ? "ON" : "OFF");
    bus.set_value("elec.talkback.fc2_mn_b", this.contactors.fc2_mnb ? "ON" : "OFF");
    bus.set_value("elec.talkback.fc3_mn_c", this.contactors.fc3_mnc ? "ON" : "OFF");
    bus.set_value("elec.talkback.mn_bus_tie_a", this.ties.a ? "ON" : "OFF");
    bus.set_value("elec.talkback.mn_bus_tie_b", this.ties.b ? "ON" : "OFF");
    bus.set_value("elec.talkback.mn_bus_tie_c", this.ties.c ? "ON" : "OFF");
    for (const id of ["a", "b", "c"] as const) {
      bus.set_value(`elec.bus.mn_${id}.powered`, this.bus_powered[id]);
      bus.set_value(`elec.bus.mn_${id}.volts`, this.bus_powered[id] ? this.main_volts : 0);
    }
  }

  snapshot() {
    return {
      cells: [...this.cells],
      main_volts: this.main_volts,
      contactors: { ...this.contactors },
      ties: { ...this.ties },
    };
  }

  restore(d: {
    cells: boolean[];
    main_volts: number;
    contactors?: Electrical["contactors"];
    ties?: Electrical["ties"];
  }): void {
    this.cells = [...d.cells];
    this.main_volts = d.main_volts;
    if (d.contactors) this.contactors = { ...d.contactors };
    if (d.ties) this.ties = { ...d.ties };
    this.recompute();
    this.publish_state();
  }

  private apply_commands(): void {
    this.latch("ctl.elec.fc1_mn_a", (on) => {
      this.contactors.fc1_mna = on;
    });
    this.latch("ctl.elec.fc2_mn_b", (on) => {
      this.contactors.fc2_mnb = on;
    });
    this.latch("ctl.elec.fc3_mn_c", (on) => {
      this.contactors.fc3_mnc = on;
    });
    this.latch("ctl.elec.mn_bus_tie_a", (on) => {
      this.ties.a = on;
    });
    this.latch("ctl.elec.mn_bus_tie_b", (on) => {
      this.ties.b = on;
    });
    this.latch("ctl.elec.mn_bus_tie_c", (on) => {
      this.ties.c = on;
    });
  }

  private latch(channel: string, set: (on: boolean) => void): void {
    const cmd = bus.get_value(channel, "CENTER");
    if (cmd === "ON") set(true);
    else if (cmd === "OFF") set(false);
  }

  private fc_commanded(i: number): boolean {
    const v = bus.get_value(`ctl.elec.fuel_cell_${i + 1}`, true);
    return v !== false && v !== 0 && v !== "OFF";
  }

  private fc_online(i: number): boolean {
    return this.cells[i] && this.fc_commanded(i);
  }

  private recompute(): void {
    const source: Record<BusId, boolean> = {
      a: this.fc_online(0) && this.contactors.fc1_mna,
      b: this.fc_online(1) && this.contactors.fc2_mnb,
      c: this.fc_online(2) && this.contactors.fc3_mnc,
    };
    const tied = (["a", "b", "c"] as const).filter((id) => this.ties[id]);
    const tie_hot = tied.some((id) => source[id]);
    for (const id of ["a", "b", "c"] as const) {
      this.bus_powered[id] = source[id] || (this.ties[id] && tie_hot);
    }
    const online = [0, 1, 2].filter((i) => this.fc_online(i)).length;
    const any = this.bus_powered.a || this.bus_powered.b || this.bus_powered.c;
    if (!any || online === 0) this.main_volts = 0;
    else {
      const sag = this.loads_a * 0.02;
      this.main_volts = 28.4 - sag / online - (online < 2 ? 1.2 : 0);
    }
  }
}
