import assert from "node:assert/strict";
import { ShuttleRuntime } from "../src/sim/runtime.ts";
import { clock } from "../src/gen/src/core/clock.js";
import { bus } from "../src/gen/src/core/bus.js";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
} });
const sim = new ShuttleRuntime();
const tick = (count: number) => { for (let i=0; i<count; i++) sim.step(0.05); };
const pose = (s: ShuttleRuntime) => [s.x,s.y,s.z,s.yaw,s.pitch,s.bank];
const step = (id: string) => sim.procedures().flatMap(card => card.steps).find(s => s.id === `plbd:${id}`)!;

// Save an actual flight with crew commands, not an assigned synthetic state.
sim.start("approach");
sim.setView("cockpit");
sim.startPredeorbitApus();
tick(400);
const savedPose = pose(sim);
const saved = sim.snapshot();
assert.equal(sim.apuStarting, true);
sim.start("entry");
sim.onKey("KeyB", true);
sim.onKey("KeyA", true);
sim.analog.pitch = 1;
assert.equal(sim.restore(saved), true);
assert.deepEqual(pose(sim), savedPose, "cross-scenario restore retains the local cockpit frame");
assert.deepEqual(sim.terminalAnchor, saved.deck.frame!.terminalAnchor);
assert.equal(sim.mode, "approach");
assert.equal(sim.view, "cockpit");
assert.equal(sim.running, true);
assert.equal(sim.paused, true);
assert.equal(clock.paused, true);
assert.deepEqual(sim.analog, { roll:0, pitch:0 });
assert.equal(sim.burning(), false, "old physical burn input is released");
assert.equal(bus.get_value("ctl.hand.roll"), 0);
sim.togglePause();
tick(600);
assert.equal(sim.apuCount, 2, "saved APU switches continue the restored spool instead of switching off");
assert.equal(sim.burnCommand, false);
assert.equal(bus.get_value("ctl.hand.roll"), 0, "steering must not replay after Resume");

// Emulate a fresh page: the old owner/clock bindings no longer exist.
clock.reset(0);
const cold = new ShuttleRuntime();
assert.equal(cold.running, false);
assert.equal(cold.restore(saved), true);
assert.equal(cold.running, true, "recovery leaves the preflight menu");
assert.equal(cold.paused, true);
assert.deepEqual(pose(cold), savedPose, "cold restore uses the saved geodetic origin");
assert.deepEqual(cold.terminalAnchor, saved.deck.frame!.terminalAnchor);

// Rewinding must remove later checklist latches, then restore older verified
// history even after the corresponding indication has changed (OP -> CL).
sim.start("orbit");
sim.setRate(16);
sim.perform("doors-open");
tick(20);
assert.equal(sim.doorTalkback, "TRANSIT");
const early = sim.snapshot();
tick(100);
assert.equal(sim.doorsOpen, true);
sim.procedures();
sim.perform("doors-close");
tick(110);
assert.equal(sim.doorsLatched, true);
const closed = sim.snapshot();
assert.ok(closed.deck.procedureLatch!.includes("plbd:open"));
assert.ok(closed.deck.procedureLatch!.includes("plbd:close"));
assert.equal(sim.restore(early), true);
assert.equal(step("open").done, false, "future OPEN verification cannot leak into an earlier checkpoint");
assert.equal(step("close").done, false);
sim.togglePause();
tick(100);
assert.equal(sim.doorsOpen, true, "saved opening command continues in its original direction");
assert.equal(sim.restore(closed), true);
assert.equal(step("open").done, true, "saved historical OPEN verification remains valid after closure");
assert.equal(step("close").done, true);

// Invalid envelope/owner data must not report success or replace view/prefs.
const before = sim.snapshot();
const beforePose = pose(sim);
for (const value of [null, { ...before,version:2 }, { ...before,timeRate:NaN },
  { ...before,view:"bad" }, { ...before,deck:{ ...before.deck,procedureLatch:["fabricated:step"] } },
  { ...before,root:{ ...before.root,mission_id:"gemini_4" } },
  { ...before,root:{ ...before.root,clock:{ ...before.root.clock,get_s:null } } },
  { ...before,root:{ ...before.root,dynamics:{ ...before.root.dynamics,r_eci:[1] } } },
  { ...before,root:{ ...before.root,systems:null } }]) {
  assert.equal(sim.restore(value), false);
  assert.deepEqual(pose(sim), beforePose);
  assert.equal(sim.view, before.view);
  assert.equal(sim.paused, true);
}
sim.togglePause();
assert.equal(sim.restore({ ...before,root:{ ...before.root,systems:null } }), false);
assert.equal(sim.paused, false, "rollback retains the pre-load pause state");
assert.equal(clock.paused, false);

// Old v3 saves omitted the frame/history/commands. Accept them paused with a
// warning, recover the known scenario frame, and never claim exact continuity.
const legacy = structuredClone(saved);
delete legacy.deck.frame;
delete legacy.deck.procedureLatch;
delete (legacy.root.controls as { switches?: unknown }).switches;
store.set("shuttle-deck-save", JSON.stringify(legacy));
assert.equal(sim.load(), true);
assert.match(sim.checkpointMessage, /Older checkpoint.*paused/);
assert.ok(Math.abs(sim.x-savedPose[0]) < 1e-7);
assert.ok(sim.terminalAnchor);
assert.equal(sim.paused, true);

store.clear();
assert.equal(sim.load(), false);
assert.match(sim.checkpointMessage, /No checkpoint saved/);
store.set("shuttle-deck-save", "{broken");
assert.equal(sim.load(), false);
assert.equal(store.get("shuttle-deck-save"), "{broken", "failed reads retain the data");
assert.equal(sim.save(), true);
assert.equal(sim.load(), true);
assert.match(sim.checkpointMessage, /^Checkpoint restored/);
Object.defineProperty(globalThis, "localStorage", { configurable:true, get: () => { throw new Error("denied"); } });
assert.equal(sim.save(), false);
assert.match(sim.checkpointMessage, /Could not save/);
assert.equal(sim.load(), false);
assert.match(sim.checkpointMessage, /Could not read/);
console.log("Checkpoint frame, cold recovery, input release, switch continuity, checklist history and failure handling pass");
