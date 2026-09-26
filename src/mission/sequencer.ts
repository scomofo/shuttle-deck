/**
 * Phase state machine. Port of gemini-capsule src/mission/mission_sequencer.gd.
 * Phases and transitions come from mission.json. Each transition is a
 * transaction. One-shots are latched so a restore cannot duplicate SRB sep.
 */

import { bus } from "../core/bus.ts";
import { clock } from "../core/clock.ts";
import type { Dynamics } from "../dynamics/dynamics.ts";
import type { Mission, PhaseSpec } from "./mission.ts";

export class MissionSequencer {
  mission: Mission;
  dynamics: Dynamics;
  phase = "prelaunch";
  phase_entry_get = 0;
  fired: Record<string, number> = {};

  constructor(mission: Mission, dynamics: Dynamics) {
    this.mission = mission;
    this.dynamics = dynamics;
  }

  start(start_phase = "prelaunch", hold_s = 10): void {
    for (const id of Object.keys(this.fired)) {
      bus.set_value(`mission.event.${id}`, false);
    }
    this.fired = {};
    if (start_phase === "prelaunch" || start_phase === "ascent") {
      this.mission.start_on_pad(this.dynamics, start_phase === "ascent" ? 0 : hold_s);
    } else {
      this.mission.start_in_orbit(this.dynamics);
      for (const e of ["liftoff", "srb_sep", "meco", "et_sep"]) this.fired[e] = 0;
    }
    for (const [id, at] of Object.entries(this.fired)) {
      bus.set_value(`mission.event.${id}`, true);
      bus.set_value(`mission.event_get.${id}`, at);
    }
    if (start_phase === "ascent") {
      this.fired.liftoff = 0;
      bus.set_value("mission.event.liftoff", true);
      this._enter("ascent");
    } else {
      this._enter(start_phase);
    }
    this.publish();
  }

  inject_event(id: string): void {
    if (id === "liftoff" && this.phase === "prelaunch") {
      clock.get_seconds = 0;
      this._fire("liftoff");
      this._enter("ascent");
    } else {
      this._fire(id);
    }
  }

  tick(_dt: number): void {
    const spec = this.mission.phases()[this.phase] ?? {};
    const t = clock.get_seconds;
    if (this.phase === "ascent" && this.dynamics) {
      const s = this.mission.ascent_state(Math.max(0, t));
      this.dynamics.set_state_eci(s.r, s.v, s.q);
      this.dynamics.accel_g = s.accel_g;
    } else if (this.dynamics && this.phase !== "ascent" && this.dynamics.accel_g !== 0 && this.dynamics.driven) {
      this.dynamics.accel_g = 0;
    }
    this._timed_events(spec, t);
    for (const [id, channel] of Object.entries(spec.events_on_control ?? {})) {
      if (Number(bus.get_value(channel, 0)) === 1) this._fire(id);
    }
    // P4: the dynamics owns runway contact (dyn.landed, P3); the mission
    // truth fires weight_on_wheels from it. The deck adapter used to inject
    // this event; it no longer does.
    if (this.phase === "approach" && this.dynamics.landed && this.fired["weight_on_wheels"] === undefined) {
      this._fire("weight_on_wheels");
    }
    for (const [id, cfg] of Object.entries(spec.event_config ?? {})) {
      if (this.fired[id] !== undefined && this.dynamics.config !== cfg) {
        bus.set_value("seq.config", cfg);
      }
    }
    let destination = "";
    let transition_events: string[] = [];
    for (const branch of spec.branches ?? []) {
      if (branch.next && this._condition_met(branch.on, t)) {
        destination = branch.next;
        transition_events = branch.one_shot ?? [];
        break;
      }
    }
    if (!destination && spec.on && spec.next) {
      if (this._condition_met(spec.on, t)) destination = spec.next;
    }
    if (destination) {
      for (const id of transition_events) this._fire(id);
      this._enter(destination);
    }
    this.publish();
  }

  private _enter(p: string): void {
    this.phase = p;
    this.phase_entry_get = clock.get_seconds;
    const spec = this.mission.phases()[p] ?? {};
    if (spec.config) {
      bus.set_value("seq.config", spec.config);
      if (spec.config === "stack" || spec.config === "orbit" || spec.config === "entry") {
        this.dynamics.set_configuration(spec.config);
      }
    }
    if (p === "orbit" || p === "insertion") this.dynamics.driven = false;
    for (const id of spec.one_shot ?? []) this._fire(id);
    this.publish();
  }

  private _fire(id: string): void {
    if (this.fired[id] !== undefined) return;
    this.fired[id] = clock.get_seconds;
    bus.set_value(`mission.event.${id}`, true);
    bus.set_value(`mission.event_get.${id}`, clock.get_seconds);
  }

  private _timed_events(spec: PhaseSpec, t: number): void {
    for (const [id, at] of Object.entries(spec.events ?? {})) {
      const due = this.phase === "ascent" ? t >= at : t - this.phase_entry_get >= at;
      if (due) this._fire(id);
    }
  }

  private _condition_met(on: Record<string, unknown>, t: number): boolean {
    if (on.any) {
      return (on.any as Record<string, unknown>[]).some((c) => this._condition_met(c, t));
    }
    if (on.all) {
      return (on.all as Record<string, unknown>[]).every((c) => this._condition_met(c, t));
    }
    if (on.event) return this.fired[String(on.event)] !== undefined;
    if (on.get_s !== undefined) return t >= Number(on.get_s);
    if (on.after_s !== undefined) return t - this.phase_entry_get >= Number(on.after_s);
    if (on.control) return Number(bus.get_value(String(on.control), 0)) === Number(on.equals ?? 1);
    if (on.channel) {
      const v = Number(bus.get_value(String(on.channel), 0));
      if (on.lt !== undefined) return v < Number(on.lt);
      if (on.gt !== undefined) return v > Number(on.gt);
    }
    return false;
  }

  next_scheduled_get(): number {
    const spec = this.mission.phases()[this.phase] ?? {};
    let soonest = -1;
    for (const [id, at] of Object.entries(spec.events ?? {})) {
      if (this.fired[id] !== undefined) continue;
      const get_at = this.phase === "ascent" ? at : this.phase_entry_get + at;
      soonest = soonest < 0 ? get_at : Math.min(soonest, get_at);
    }
    if (spec.on && spec.on.get_s !== undefined) {
      const g = Number(spec.on.get_s);
      soonest = soonest < 0 ? g : Math.min(soonest, g);
    }
    return soonest;
  }

  publish(): void {
    bus.set_value("mission.phase", this.phase);
    bus.set_value("mission.phase_get_s", this.phase_entry_get);
    bus.set_value("seq.next_event_get_s", this.next_scheduled_get());
  }

  snapshot() {
    return { phase: this.phase, phase_entry_get: this.phase_entry_get, fired: { ...this.fired } };
  }

  restore(d: { phase: string; phase_entry_get: number; fired: Record<string, number> }): void {
    this.phase = d.phase;
    this.phase_entry_get = d.phase_entry_get;
    this.fired = { ...d.fired };
    for (const [id, at] of Object.entries(this.fired)) {
      bus.set_value(`mission.event.${id}`, true);
      bus.set_value(`mission.event_get.${id}`, at);
    }
    const spec = this.mission.phases()[this.phase] ?? {};
    if (spec.config) bus.set_value("seq.config", spec.config);
    this.publish();
  }
}
