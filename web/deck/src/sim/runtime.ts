/**
 * ShuttleRuntime — the browser deck's sim facade (FIDELITY.md P1).
 *
 * The root SimRuntime, owned by RootAdapter, is the single vehicle truth:
 * ECI dynamics, propulsion, electrical, guidance, mission sequencing, and
 * the 50 Hz fixed-step clock all live there. This class keeps the deck's
 * presentation state (view mode, key input, mute, time rate, procedure
 * latches) and the React subscription plumbing, and exposes the public API
 * the game components already use.
 *
 * Removed in P1 (now owned by the root sim): applyAttitude, the physics
 * substep, applyAero, hand-steered HAC/final logic, hand-authored physical
 * phase transitions, the heat model, and the flight-director computation.
 * What remains here is input collection, view state, and thin delegation.
 * Doors, gear and APUs are root system truth; this facade reads their
 * indications and keeps only procedure verification history.
 */

import { buildProcedures, LATCHED_PROCEDURE_STEPS, type ProcedureAction, type ProcedureCard } from "./procedures.ts";
import { RootAdapter, isDeckFrame, type DeckFrame, type TerminalAnchor } from "./root_adapter.ts";

export type Phase =
  | "pad"
  | "ascent"
  | "orbit"
  | "entry"
  | "taem"
  | "approach"
  | "rollout"
  | "landed"
  | "lost";
export type StartMode = "launch" | "orbit" | "entry" | "approach";
export type ViewMode = "chase" | "cockpit" | "tower";
export type ChecklistId =
  | "cells"
  | "apu"
  | "liftoff"
  | "srb"
  | "meco"
  | "doors"
  | "burn"
  | "entry"
  | "taem"
  | "gear"
  | "wheels";

/** v3: root vehicle state plus deck view/frame and procedure history.
 *  v2 kept doors/gear/APU in the deck; P4 moved them to root truth. */
export interface ShuttleSnapshot {
  version: 3;
  mode: StartMode;
  view: ViewMode;
  auto: boolean;
  muted: boolean;
  timeRate: number;
  rateLock: boolean;
  deck: { callout: string; frame?: DeckFrame; procedureLatch?: string[] };
  root: ReturnType<RootAdapter["snapshotRoot"]>;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function hypot3(x: number, y: number, z: number): number {
  return Math.hypot(x, Math.hypot(y, z));
}

/** Deck body basis: nose/right/dorsal from deck yaw/pitch/bank (radians). */
export function bodyBasis(yaw: number, pitch: number, bank: number): {
  nx: number; ny: number; nz: number;
  rx: number; ry: number; rz: number;
  dx: number; dy: number; dz: number;
} {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cb = Math.cos(bank), sb = Math.sin(bank);
  // Level-flight reference vectors.
  const nx0 = -sy, ny0 = 0, nz0 = -cy;
  const rx0 = cy, ry0 = 0, rz0 = -sy;
  const dx0 = 0, dy0 = 1, dz0 = 0;
  // Pitch about the right axis.
  const nx = nx0 * cp, ny = sp, nz = nz0 * cp;
  const dx = -nx0 * sp, dy = cp, dz = -nz0 * sp;
  // Bank about the nose axis.
  return {
    nx, ny, nz,
    rx: rx0 * cb + dx * sb, ry: ry0 * cb + dy * sb, rz: rz0 * cb + dz * sb,
    dx: dx * cb - rx0 * sb, dy: dy * cb - ry0 * sb, dz: dz * cb - rz0 * sb,
  };
}

/** Heading-alignment cylinder (historic deck layout; the scene anchors it). */
export const HAC = {
  cx: -11_000,
  cz: -2_500,
  r: 2_500,
};

let version = 0;
const listeners = new Set<() => void>();
function emit(): void {
  version++;
  for (const l of listeners) l();
}
export function subscribeSim(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
export function getSimVersion(): number {
  return version;
}

export class ShuttleRuntime {
  readonly adapter = new RootAdapter();

  mode: StartMode = "launch";
  view: ViewMode = "chase";
  auto = true;
  muted = false;
  timeRate = 1;
  rateLock = false;
  checkpointMessage = "";
  checkpointError = false;
  recoveryRevision = 0;
  analog = { roll: 0, pitch: 0 };

  private physical = new Set<string>();
  private inject: string[] | null = null;
  private procedureLatch = new Set<string>();
  private hudAcc = 0;

  // ------------------------------------------------ vehicle truth (root)

  get phase(): Phase {
    return this.adapter.view().phase;
  }
  get running(): boolean {
    return this.adapter.running;
  }
  get paused(): boolean {
    return this.adapter.paused;
  }
  /** Mission elapsed time, seconds (root clock). */
  get get(): number {
    return this.adapter.view().get;
  }
  get x(): number {
    return this.adapter.view().x;
  }
  get y(): number {
    return this.adapter.view().y;
  }
  get z(): number {
    return this.adapter.view().z;
  }
  get vx(): number {
    return this.adapter.view().vx;
  }
  get vy(): number {
    return this.adapter.view().vy;
  }
  get vz(): number {
    return this.adapter.view().vz;
  }
  get yaw(): number {
    return this.adapter.view().yaw;
  }
  get pitch(): number {
    return this.adapter.view().pitch;
  }
  get bank(): number {
    return this.adapter.view().bank;
  }
  /** Earth-relative speed, m/s (the old deck's flat frame was Earth-relative). */
  speed(): number {
    return this.adapter.view().speed;
  }
  get horizSpeed(): number {
    return this.adapter.view().horizSpeed;
  }
  get mach(): number {
    return this.adapter.view().mach;
  }
  get qbar(): number {
    return this.adapter.view().qbar;
  }
  get alpha(): number {
    return this.adapter.view().alpha;
  }
  get gLoad(): number {
    return this.adapter.view().gLoad;
  }
  get plume(): number {
    return this.adapter.view().plume;
  }
  get plasma(): number {
    return this.adapter.view().plasma;
  }
  get blackout(): boolean {
    return this.adapter.view().blackout;
  }
  get busVolts(): number {
    return this.adapter.view().busVolts;
  }
  get fuelCell(): boolean {
    return this.adapter.view().fuelCell;
  }
  set fuelCell(v: boolean) {
    const c = this.adapter.runtime.controls;
    c.set("FuelCell1", v);
    c.set("FuelCell2", v);
    c.set("FuelCell3", v);
    this.adapter.say(v ? "Fuel cells online." : "Fuel cells shut down.");
  }
  get srbProp(): number {
    return this.adapter.view().srbProp;
  }
  get omsProp(): number {
    return this.adapter.view().omsProp;
  }
  get rcsProp(): number {
    return this.adapter.view().rcsProp;
  }
  get srbAttached(): boolean {
    return this.adapter.view().srbAttached;
  }
  get etAttached(): boolean {
    return this.adapter.view().etAttached;
  }
  get srbSepAge(): number {
    return this.adapter.view().srbSepAge;
  }
  get etSepAge(): number {
    return this.adapter.view().etSepAge;
  }
  get burnActive(): boolean {
    return this.adapter.view().burnActive;
  }
  get burnCommand(): boolean {
    return this.adapter.readBool("ctl.oms.burn");
  }
  get periapsisAlt(): number {
    return this.adapter.readNum("dyn.periapsis_alt_m", Infinity);
  }
  get deorbitCommitted(): boolean {
    return this.adapter.readText("mission.phase", "") === "deorbit";
  }
  get terminalAnchor(): TerminalAnchor | null {
    return this.adapter.view().terminalAnchor;
  }
  get callout(): string {
    return this.adapter.callout;
  }
  get calloutT(): number {
    return this.adapter.calloutT;
  }
  get fail(): string {
    return this.adapter.fail;
  }
  get shake(): number {
    return this.adapter.shake;
  }

  // P4: doors, gear, APUs, and smoke detection are root system truth.
  // The facade reads; the adapter's ctl.* writers command.
  get doorsOpen(): boolean {
    return this.adapter.readBool("mech.plbd.open");
  }
  get doorsLatched(): boolean {
    return this.adapter.readBool("mech.plbd.latched");
  }
  get doorTalkback(): string {
    return this.adapter.readText("mech.plbd.talkback", "CL");
  }
  get gear(): boolean {
    return this.adapter.readBool("mech.gear.down_locked");
  }
  get gearCommand(): boolean {
    return this.adapter.readBool("ctl.gear");
  }
  get gearArmed(): boolean {
    return this.adapter.readBool("mech.gear.armed");
  }
  get gearTalkback(): string {
    return this.adapter.readText("mech.gear.talkback", "UP");
  }
  get apuCount(): number {
    return this.adapter.readNum("apu.running_count");
  }
  get apu(): boolean {
    return this.apuCount > 0;
  }
  get apuStarting(): boolean {
    return [1, 2, 3].some((unit) => this.adapter.readText(`apu.${unit}.state`, "off") === "starting");
  }
  set apu(v: boolean) {
    // One representative switch drives all three units (cf. fuelCell).
    const a = this.adapter;
    a.setApu(1, v);
    a.setApu(2, v);
    a.setApu(3, v);
  }
  /** STS-1 pre-deorbit pair: APUs 2+3. APU 1 follows the pitch-around. */
  startPredeorbitApus(): void {
    const a = this.adapter;
    a.setApu(2, true);
    a.setApu(3, true);
    a.say("APUs 2 and 3 starting. Wait for RUN.");
  }
  get smokeAlarm(): boolean {
    return this.adapter.readBool("sys.fire.smoke_flt_dk");
  }
  get rcsAvailable(): boolean {
    return this.adapter.readBool("prop.rcs.available", true);
  }
  get rcsFiring(): boolean {
    return this.adapter.rcsFiring();
  }

  // P3: the root sim publishes the Sutton-Graves heating proxy and the
  // guidance flight director; the facade reads them instead of zeroes.
  get heat(): number {
    return this.adapter.view().plasma;
  }
  get fdBank(): number {
    return this.adapter.view().fdBank;
  }
  get fdPitch(): number {
    return this.adapter.view().fdPitch;
  }
  get altErr(): number {
    return this.adapter.view().altErr;
  }

  burning(): boolean {
    return this.down("KeyB") || this.adapter.view().burnActive;
  }

  say(text: string): void {
    this.adapter.say(text);
  }

  // ---------------------------------------------------------------- input

  onKey(code: string, pressed: boolean): void {
    if (this.inject) return;
    if (pressed) this.physical.add(code);
    else this.physical.delete(code);
  }

  blur(): void {
    this.physical.clear();
    this.analog.roll = 0;
    this.analog.pitch = 0;
  }

  /** Test/replay hook: drive the key set directly. */
  setKeys(codes: string[]): void {
    this.inject = codes;
  }

  private down(code: string): boolean {
    if (this.inject) return this.inject.includes(code);
    return this.physical.has(code);
  }

  private rollInput(): number {
    let r = this.analog.roll;
    if (this.down("KeyA") || this.down("ArrowLeft")) r += 1;
    if (this.down("KeyD") || this.down("ArrowRight")) r -= 1;
    return clamp(r, -1, 1);
  }

  private pitchInput(): number {
    let p = this.analog.pitch;
    if (this.down("KeyW") || this.down("ArrowUp")) p += 1;
    if (this.down("KeyS") || this.down("ArrowDown")) p -= 1;
    return clamp(p, -1, 1);
  }

  private yawInput(): number {
    let y = 0;
    if (this.down("KeyQ")) y += 1;
    if (this.down("KeyE")) y -= 1;
    return clamp(y, -1, 1);
  }

  private readGamepad(): void {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const pad of pads) {
        if (!pad || !pad.connected) continue;
        const ax = pad.axes;
        if (ax.length >= 2) {
          if (Math.abs(ax[0]) > 0.12) this.analog.roll = clamp(ax[0], -1, 1);
          if (Math.abs(ax[1]) > 0.12) this.analog.pitch = clamp(-ax[1], -1, 1);
        }
        break;
      }
    } catch {
      /* gamepad unavailable */
    }
  }

  // ---------------------------------------------------------------- control

  start(mode: StartMode): void {
    this.mode = mode;
    this.adapter.start(mode);
    this.inject = null;
    this.physical.clear();
    this.analog.roll = 0;
    this.analog.pitch = 0;
    this.procedureLatch.clear();
    this.checkpointMessage = "";
    this.rateLock = false;
    this.timeRate = mode === "launch" ? 4 : mode === "orbit" ? 8 : mode === "entry" ? 16 : 1;
    emit();
  }

  step(wallDt: number): void {
    if (!this.adapter.running || this.adapter.paused) return;
    this.readGamepad();
    this.adapter.step(wallDt, {
      roll: this.rollInput(),
      pitch: this.pitchInput(),
      yaw: this.yawInput(),
      burnKey: this.down("KeyB"),
      timeRate: this.timeRate,
    });
    this.hudAcc += Math.min(Math.max(wallDt, 0), 0.05);
    if (this.hudAcc > 0.08) {
      this.hudAcc = 0;
      emit();
    }
  }

  togglePause(): void {
    if (!this.adapter.running || this.adapter.fail || this.phase === "landed") return;
    this.adapter.setPaused(!this.adapter.paused);
    emit();
  }

  setRate(rate: number): void {
    this.timeRate = rate;
    this.rateLock = true;
    emit();
  }

  cycleView(): void {
    this.view = this.view === "chase" ? "cockpit" : this.view === "cockpit" ? "tower" : "chase";
    emit();
  }

  setView(v: ViewMode): void {
    this.view = v;
    emit();
  }

  toggleAuto(): void {
    this.auto = !this.auto;
    emit();
  }

  setAuto(v: boolean): void {
    this.auto = v;
    emit();
  }

  toggleMute(): void {
    this.muted = !this.muted;
    emit();
  }

  setMuted(v: boolean): void {
    this.muted = v;
    emit();
  }

  toggleDoors(): void {
    const a = this.adapter;
    if (this.phase !== "orbit") {
      a.say("Bay doors only on orbit.");
      emit();
      return;
    }
    const open = !a.readBool("ctl.plbd.open");
    a.setDoors(open);
    a.say(open ? "Payload bay doors opening." : "Payload bay doors closing.");
    emit();
  }

  toggleGear(): void {
    const a = this.adapter;
    if (this.phase !== "approach" && this.phase !== "rollout") return;
    if (!this.gearArmed) {
      a.say("Arm the gear on F6 first.");
      emit();
      return;
    }
    if (!this.gear && this.speed() > 190) {
      a.say("Too fast for gear.");
      emit();
      return;
    }
    if (this.gearCommand) return;
    a.setGear(true);
    a.say("Gear extending.");
    emit();
  }

  armGear(): void {
    const a = this.adapter;
    a.runtime.controls.press("GearArm");
    a.say("Landing gear armed.");
    emit();
  }

  perform(action: ProcedureAction): void {
    const a = this.adapter;
    if (action === "fuel-cells") {
      this.fuelCell = true;
    } else if (action === "apu") {
      this.startPredeorbitApus();
    } else if (action === "doors-open") {
      if (this.phase !== "orbit") a.say("Bay doors only on orbit.");
      else {
        a.setDoors(true);
        a.say("Payload bay doors opening.");
      }
    } else if (action === "doors-close") {
      a.setDoors(false);
      a.say("Payload bay doors closing.");
    } else if (action === "gear-arm") {
      this.armGear();
      return;
    } else if (action === "gear") {
      this.toggleGear();
      return;
    } else if (action === "deorbit") {
      if (this.phase !== "orbit" || this.periapsisAlt >= 110_000 || !this.doorsLatched || this.burnCommand) return;
      a.runtime.controls.press("Deorbit");
      a.say("Deorbit sequence selected. Coast to entry interface with the burn off.");
    }
    emit();
  }

  procedures(): ProcedureCard[] {
    return buildProcedures(this, this.procedureLatch);
  }

  checklist(): { id: ChecklistId; label: string; done: boolean }[] {
    const p = this.phase;
    const rows: { id: ChecklistId; label: string; done: boolean; show: boolean }[] = [
      { id: "cells", label: "Fuel cells online", done: this.fuelCell && this.busVolts > 24, show: true },
      { id: "apu", label: "APU running — hydraulics", done: this.apu, show: true },
      { id: "liftoff", label: "Liftoff", done: this.running && this.mode === "launch" && this.get > 1, show: this.mode === "launch" },
      { id: "srb", label: "SRB separation", done: !this.srbAttached && this.get > 20, show: this.mode === "launch" },
      { id: "meco", label: "MECO and tank sep", done: p !== "pad" && p !== "ascent", show: this.mode === "launch" || p === "orbit" },
      { id: "doors", label: "Payload bay doors closed", done: this.doorsLatched, show: p === "orbit" || p === "entry" || p === "taem" },
      { id: "burn", label: "Deorbit burn", done: p === "entry" || p === "taem" || p === "approach" || p === "rollout" || p === "landed", show: p === "orbit" || p === "entry" || p === "taem" },
      { id: "entry", label: "Entry interface", done: p === "entry" || p === "taem" || p === "approach" || p === "rollout" || p === "landed", show: p !== "pad" && p !== "ascent" },
      { id: "taem", label: "Heading alignment", done: p === "approach" || p === "rollout" || p === "landed", show: p === "entry" || p === "taem" || p === "approach" || p === "rollout" || p === "landed" },
      { id: "gear", label: "Gear down", done: this.gear, show: p === "approach" || p === "rollout" || p === "landed" },
      { id: "wheels", label: "Wheel stop", done: p === "landed", show: p === "approach" || p === "rollout" || p === "landed" },
    ];
    return rows.filter((r) => r.show);
  }

  // ------------------------------------------------------------ persistence

  snapshot(): ShuttleSnapshot {
    const a = this.adapter;
    this.procedures(); // Observe completed steps before saving their history.
    return {
      version: 3,
      mode: this.mode,
      view: this.view,
      auto: this.auto,
      muted: this.muted,
      timeRate: this.timeRate,
      rateLock: this.rateLock,
      deck: {
        callout: a.callout,
        frame: a.snapshotFrame(),
        procedureLatch: [...this.procedureLatch],
      },
      root: a.snapshotRoot(),
    };
  }

  restore(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const s = value as ShuttleSnapshot;
    if (s.version !== 3 || !["launch", "orbit", "entry", "approach"].includes(s.mode) ||
        !["chase", "cockpit", "tower"].includes(s.view) ||
        typeof s.auto !== "boolean" || typeof s.muted !== "boolean" || typeof s.rateLock !== "boolean" ||
        !Number.isFinite(s.timeRate) || s.timeRate < 1 || s.timeRate > 16 ||
        !s.deck || typeof s.deck.callout !== "string" || !s.root || typeof s.root !== "object" ||
        (s.deck.frame !== undefined && !isDeckFrame(s.deck.frame)) ||
        (s.deck.procedureLatch !== undefined && (!Array.isArray(s.deck.procedureLatch) ||
          !s.deck.procedureLatch.every(id => LATCHED_PROCEDURE_STEPS.has(id))))) return false;
    if (!this.adapter.restoreRoot(s.root, s.deck.frame, s.mode)) return false;
    this.mode = s.mode;
    this.view = s.view;
    this.auto = s.auto;
    this.muted = s.muted;
    this.timeRate = s.timeRate;
    this.rateLock = s.rateLock;
    this.inject = null;
    this.blur();
    this.hudAcc = 0;
    this.procedureLatch = new Set(s.deck.procedureLatch ?? []);
    this.recoveryRevision++;
    this.adapter.say(s.deck.callout);
    emit();
    return true;
  }

  private checkpointFeedback(message: string, error = false): boolean {
    this.checkpointMessage = message;
    this.checkpointError = error;
    emit();
    return !error;
  }

  dismissCheckpointMessage(): void {
    this.checkpointMessage = "";
    emit();
  }

  save(): boolean {
    if (!this.running) return this.checkpointFeedback("Start a flight before saving a checkpoint.", true);
    try {
      localStorage.setItem("shuttle-deck-save", JSON.stringify(this.snapshot()));
      return this.checkpointFeedback("Checkpoint saved.");
    } catch {
      return this.checkpointFeedback("Could not save checkpoint. Allow site storage and try again.", true);
    }
  }

  load(): boolean {
    let raw: string | null;
    try { raw = localStorage.getItem("shuttle-deck-save"); }
    catch { return this.checkpointFeedback("Could not read checkpoint. Allow site storage and try again.", true); }
    if (!raw) return this.checkpointFeedback("No checkpoint saved. Save during a flight first.", true);
    try {
      const saved = JSON.parse(raw) as ShuttleSnapshot;
      if (this.restore(saved)) return this.checkpointFeedback(saved.deck.frame && saved.deck.procedureLatch && saved.root.controls.switches
        ? "Checkpoint restored · paused. Resume when ready."
        : "Older checkpoint restored · paused. Verify the checklist before resuming.");
    } catch {
      // Keep the saved data and the current flight when a save is unreadable.
    }
    return this.checkpointFeedback("This checkpoint is incompatible or incomplete. Start a new flight to save another.", true);
  }

  notify(): void {
    emit();
  }
}

export const sim = new ShuttleRuntime();

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      getBank: () => number;
      setKeys: (codes: string[]) => void;
      setSteer: (v: number) => void;
      phase: () => string;
      tick: (steps: number) => void;
    };
  }
}

export function attachControlsProbe(): void {
  if (typeof window === "undefined") return;
  window.__controlsTest = {
    getYaw: () => sim.yaw,
    getSpeed: () => sim.speed(),
    getBank: () => sim.bank,
    setKeys: (codes) => sim.setKeys(codes),
    setSteer: (v) => {
      sim.analog.roll = v;
    },
    phase: () => sim.phase,
    tick: (steps: number) => {
      for (let i = 0; i < steps; i++) sim.step(0.05);
    },
  };
}
