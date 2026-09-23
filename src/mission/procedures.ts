/**
 * Data-driven procedure runner.
 * Port of gemini-capsule src/mission/procedure_runner.gd
 * (MISSION_PROCEDURE_TESTING.md §3–§8).
 *
 * Actions go through public control / sequencer / clock APIs.
 * Time advances only through SimClock. set_channel is synthetic + ctl.* only.
 */

import { bus, type BusValue } from "../core/bus.ts";
import { clock, FIXED_DT } from "../core/clock.ts";
import type { SimRuntime } from "../core/runtime.ts";

export const ACTIONS = [
  "set_control",
  "press_control",
  "pull_control",
  "set_hand_controller",
  "advance_time",
  "wait_until",
  "inject_mission_event",
  "set_channel",
] as const;

export const FIDELITY = ["structural", "functional", "timing", "dynamic", "historical", "synthetic"] as const;

export type Procedure = {
  id: string;
  mission: string;
  phase: string;
  start?: string;
  fidelity: (typeof FIDELITY)[number];
  sources: Array<{ id?: string; locator?: string }>;
  preconditions?: Record<string, unknown>[];
  steps: Record<string, unknown>[];
};

export class ProcedureRunner {
  runtime: SimRuntime;
  failures: string[] = [];
  log: string[] = [];

  constructor(runtime: SimRuntime) {
    this.runtime = runtime;
  }

  validate(proc: Procedure): string[] {
    const errs: string[] = [];
    for (const k of ["id", "mission", "phase", "fidelity", "sources", "steps"] as const) {
      if (proc[k] === undefined) errs.push(`missing field ${k}`);
    }
    if (proc.mission !== this.runtime.mission.id()) {
      errs.push(`procedure is for mission '${proc.mission}', runtime is '${this.runtime.mission.id()}'`);
    }
    if (!FIDELITY.includes(proc.fidelity)) errs.push(`fidelity must be one of ${FIDELITY.join(",")}`);
    if (["functional", "timing", "dynamic", "historical"].includes(proc.fidelity)) {
      if (!proc.sources?.length) errs.push(`a ${proc.fidelity}-fidelity procedure needs at least one source`);
      for (const src of proc.sources ?? []) {
        const loc = String(src.locator ?? "");
        if (!loc || loc.includes("TODO")) errs.push(`a ${proc.fidelity}-fidelity procedure needs a source locator`);
      }
    }
    let i = 0;
    for (const step of proc.steps ?? []) {
      i += 1;
      if (step.action) {
        if (!ACTIONS.includes(step.action as (typeof ACTIONS)[number])) {
          errs.push(`step ${i}: unknown action ${step.action}`);
        }
        if (["set_control", "press_control", "pull_control"].includes(String(step.action))) {
          if (!this.runtime.controls.has(String(step.target ?? ""))) {
            errs.push(`step ${i}: unknown control id '${step.target}'`);
          }
        }
        if (["press_control", "pull_control"].includes(String(step.action))) {
          const hold = Number(step.hold_s ?? 0.25);
          if (!Number.isFinite(hold) || hold < FIXED_DT) {
            errs.push(`step ${i}: hold_s must be a finite number at least ${FIXED_DT} seconds`);
          }
        }
        if (step.action === "set_channel") {
          if (proc.fidelity !== "synthetic") {
            errs.push(`step ${i}: set_channel is only allowed in synthetic procedures`);
          }
          if (!String(step.target ?? "").startsWith("ctl.")) {
            errs.push(`step ${i}: set_channel may only write ctl.* command channels`);
          }
        }
      } else if (step.expect) {
        if (step.expect !== "channel" && step.expect !== "phase") {
          errs.push(`step ${i}: unknown expectation ${step.expect}`);
        }
      } else {
        errs.push(`step ${i}: neither action nor expect`);
      }
    }
    return errs;
  }

  run(proc: Procedure): boolean {
    this.failures = [];
    this.log = [];
    const errs = this.validate(proc);
    if (errs.length) {
      for (const e of errs) this.failures.push("schema: " + e);
      return false;
    }
    this.runtime.start(proc.start ?? proc.phase);
    for (const pre of proc.preconditions ?? []) {
      if (!this._check(pre, "precondition")) return false;
    }
    let i = 0;
    for (const step of proc.steps) {
      i += 1;
      const where = `step ${i} @GET ${clock.get_seconds.toFixed(2)}`;
      if (step.action) this._do(step, where);
      else this._check(step, where);
    }
    return this.failures.length === 0;
  }

  private _do(step: Record<string, unknown>, where: string): void {
    switch (step.action) {
      case "set_control":
        this.runtime.controls.set(String(step.target), step.value as BusValue);
        break;
      case "press_control":
      case "pull_control":
        this.runtime.controls.press(String(step.target));
        clock.advance(Number(step.hold_s ?? 0.25));
        this.runtime.controls.release(String(step.target));
        break;
      case "set_hand_controller":
        this.runtime.controls.set_hand(Number(step.pitch ?? 0), Number(step.yaw ?? 0), Number(step.roll ?? 0));
        if (step.for_s !== undefined) {
          clock.advance(Number(step.for_s));
          this.runtime.controls.set_hand(0, 0, 0);
        }
        break;
      case "set_channel":
        bus.set_value(String(step.target), step.value as BusValue);
        break;
      case "advance_time":
        clock.advance(Number(step.seconds));
        break;
      case "wait_until": {
        const timeout = Number(step.timeout_s ?? 60);
        const t0 = clock.get_seconds;
        while (!this._holds(step) && clock.get_seconds - t0 < timeout) {
          clock.advance(FIXED_DT);
        }
        if (!this._holds(step)) {
          this.failures.push(`${where}: wait_until ${step.target ?? "?"} timed out after ${timeout} s`);
        }
        break;
      }
      case "inject_mission_event":
        this.runtime.sequencer.inject_event(String(step.event));
        break;
    }
    this.log.push(
      `${where}: ${step.action} -> GET ${clock.get_seconds.toFixed(1)} phase ${bus.get_value("mission.phase", "?")} alt ${Number(bus.get_value("dyn.alt_m", 0)).toFixed(0)}`,
    );
  }

  private _value(step: Record<string, unknown>): BusValue {
    if (step.expect === "phase" || step.target === "mission.phase") return bus.get_value("mission.phase");
    return bus.get_value(String(step.target));
  }

  private _holds(step: Record<string, unknown>): boolean {
    const v = this._value(step);
    if (step.equals !== undefined) return v === step.equals || (typeof v === "number" && Math.abs(v - Number(step.equals)) < 1e-9);
    if (step.approx !== undefined) return v != null && Math.abs(Number(v) - Number(step.approx)) <= Number(step.tolerance ?? 1e-6);
    if (step.gt !== undefined) return v != null && Number(v) > Number(step.gt);
    if (step.lt !== undefined) return v != null && Number(v) < Number(step.lt);
    if (step.between) {
      const b = step.between as number[];
      return v != null && Number(v) >= b[0] && Number(v) <= b[1];
    }
    if (step.is_true !== undefined) return truthy(v) === truthy(step.is_true);
    return false;
  }

  private _check(step: Record<string, unknown>, where: string): boolean {
    const window = Number(step.within_s ?? 0);
    const t0 = clock.get_seconds;
    while (!this._holds(step) && clock.get_seconds - t0 < window) clock.advance(FIXED_DT);
    if (this._holds(step)) return true;
    this.failures.push(`${where}: expected ${step.target ?? step.expect} ${JSON.stringify(step)}, got ${JSON.stringify(this._value(step))}`);
    return false;
  }
}

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  return true;
}
