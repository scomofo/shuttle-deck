/**
 * Named crew controls. Gemini keeps these as cockpit nodes in
 * SimRuntime.controls. Shuttle Deck has no Godot cabin yet, so the
 * registry is the public API the procedure runner and a future cabin
 * both write through. It only publishes command channels.
 *
 * A momentary switch (panel R1 FC/MAIN BUS, MN BUS TIE) publishes ON or
 * OFF only while held, then CENTER. It does not own the contactor.
 * A breaker latches. Pull opens it, push closes it, and that position
 * is control truth the electrical owner only reads.
 */

import { bus, type BusValue } from "../core/bus.ts";
import catalog from "../../assets/data/cockpit/controls.json" with { type: "json" };

export type ControlKind = "switch" | "button" | "hand" | "momentary" | "breaker";

export type ControlDef = {
  id: string;
  channel: string;
  kind: ControlKind;
  on?: BusValue;
  off?: BusValue;
  center?: BusValue;
  panel?: string;
};

export class Controls {
  by_id = new Map<string, ControlDef>();
  private breaker_closed = new Map<string, boolean>();

  constructor(defs: ControlDef[] = catalog.controls as ControlDef[]) {
    for (const d of defs) {
      this.by_id.set(d.id, d);
      if (d.kind === "breaker") this.breaker_closed.set(d.id, true);
    }
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
    if (c.kind === "momentary") {
      throw new Error(`momentary ${id} is held with press_control, not set_control`);
    }
    if (c.kind === "breaker") {
      throw new Error(`breaker ${id} is pull_breaker / push_breaker, not set_control`);
    }
    if (c.kind === "switch") {
      if (value === "ON" || value === "on" || value === true || value === 1) value = (c.on ?? true) as BusValue;
      if (value === "OFF" || value === "off" || value === false || value === 0) value = (c.off ?? false) as BusValue;
    }
    bus.set_value(c.channel, value);
  }

  press(id: string, value?: BusValue): void {
    const c = this.by_id.get(id);
    if (!c) throw new Error(`unknown control ${id}`);
    if (c.kind === "momentary") {
      bus.set_value(c.channel, this.momentary_command(c, value));
      return;
    }
    bus.set_value(c.channel, (c.on ?? true) as BusValue);
  }

  release(id: string): void {
    const c = this.by_id.get(id);
    if (!c) throw new Error(`unknown control ${id}`);
    if (c.kind === "momentary") bus.set_value(c.channel, (c.center ?? "CENTER") as BusValue);
    if (c.kind === "button") bus.set_value(c.channel, (c.off ?? false) as BusValue);
  }

  set_hand(pitch: number, yaw: number, roll: number): void {
    bus.set_value("ctl.hand.pitch", pitch);
    bus.set_value("ctl.hand.yaw", yaw);
    bus.set_value("ctl.hand.roll", roll);
  }

  reset_latched(): void {
    for (const id of this.breaker_closed.keys()) this.push_breaker(id);
  }

  pull_breaker(id: string): void {
    this.set_breaker(id, false);
  }

  push_breaker(id: string): void {
    this.set_breaker(id, true);
  }

  snapshot() {
    return { breakers: Object.fromEntries(this.breaker_closed) };
  }

  restore(d: { breakers?: Record<string, boolean> }): void {
    for (const [id, closed] of Object.entries(d.breakers ?? {})) {
      if (this.breaker_closed.has(id)) this.set_breaker(id, closed);
    }
  }

  private set_breaker(id: string, closed: boolean): void {
    const c = this.by_id.get(id);
    if (!c || c.kind !== "breaker") throw new Error(`not a breaker: ${id}`);
    this.breaker_closed.set(id, closed);
    bus.set_value(c.channel, closed);
  }

  private momentary_command(c: ControlDef, value: BusValue | undefined): BusValue {
    const raw = value ?? c.on ?? "ON";
    if (raw === "ON" || raw === "on" || raw === true || raw === 1) return (c.on ?? "ON") as BusValue;
    if (raw === "OFF" || raw === "off" || raw === false || raw === 0) return (c.off ?? "OFF") as BusValue;
    throw new Error(`momentary ${c.id} accepts ON or OFF`);
  }
}
