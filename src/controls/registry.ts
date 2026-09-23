/**
 * Named crew controls. Gemini keeps these as cockpit nodes in
 * SimRuntime.controls. Shuttle Deck has no Godot cabin yet, so the
 * registry is the public API the procedure runner and a future cabin
 * both write through. It only publishes command channels.
 */

import { bus, type BusValue } from "../core/bus.ts";
import catalog from "../../assets/data/cockpit/controls.json" with { type: "json" };

export type ControlKind = "switch" | "button" | "hand";

export type ControlDef = {
  id: string;
  channel: string;
  kind: ControlKind;
  on?: BusValue;
  off?: BusValue;
};

export class Controls {
  by_id = new Map<string, ControlDef>();

  constructor(defs: ControlDef[] = catalog.controls as ControlDef[]) {
    for (const d of defs) this.by_id.set(d.id, d);
  }

  has(id: string): boolean {
    return this.by_id.has(id);
  }

  get(id: string): ControlDef | undefined {
    return this.by_id.get(id);
  }

  set(id: string, value: BusValue): void {
    const c = this.by_id.get(id);
    if (!c) throw new Error(`unknown control ${id}`);
    if (c.kind === "switch") {
      if (value === "ON" || value === "on" || value === true || value === 1) value = (c.on ?? true) as BusValue;
      if (value === "OFF" || value === "off" || value === false || value === 0) value = (c.off ?? false) as BusValue;
    }
    bus.set_value(c.channel, value);
  }

  press(id: string): void {
    const c = this.by_id.get(id);
    if (!c) throw new Error(`unknown control ${id}`);
    bus.set_value(c.channel, (c.on ?? true) as BusValue);
  }

  release(id: string): void {
    const c = this.by_id.get(id);
    if (!c) throw new Error(`unknown control ${id}`);
    if (c.kind === "button") bus.set_value(c.channel, (c.off ?? false) as BusValue);
  }

  set_hand(pitch: number, yaw: number, roll: number): void {
    bus.set_value("ctl.hand.pitch", pitch);
    bus.set_value("ctl.hand.yaw", yaw);
    bus.set_value("ctl.hand.roll", roll);
  }
}
