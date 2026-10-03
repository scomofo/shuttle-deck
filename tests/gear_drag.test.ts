/** Gear drag consumes the mechanism, including paused legacy recovery. */
import assert from "node:assert/strict";
import { bus } from "../src/core/bus.ts";
import { clock } from "../src/core/clock.ts";
import { SimRuntime } from "../src/core/runtime.ts";
import fixture from "../web/deck/review/cabin-fixture.json" with { type: "json" };

clock.reset(0); bus.reset();
const rt = new SimRuntime();
assert.equal(rt.restore(fixture.approach.root as unknown as ReturnType<SimRuntime["snapshot"]>), true);
rt.systems.mechanisms.reset();
const dyn = rt.dynamics;
const sample = (p: number) => dyn.aero.accelerations(dyn.orbit.r, dyn.orbit.v, dyn.mass,
  dyn.attitude.q, dyn.attitude.omega, dyn.eff, p);
const verifyDrag = () => {
  dyn.tick(0); // sample current owners without advancing pose, heat or time
  const p = Number(bus.get_value("mech.gear.position"));
  assert.ok(Math.abs(dyn.last_aero.cd - sample(p).cd) < 1e-12);
  assert.equal(dyn.gear_down, p === 1);
  return p;
};

rt.controls.set("Gear", true);
clock.advance(0.1);
assert.equal(verifyDrag(), 0, "unarmed DN cannot create gear drag");
assert.equal(dyn.last_aero.cd, sample(0).cd);
rt.controls.press("GearArm");
clock.advance(4);
const p = verifyDrag();
assert.ok(p > 0.4 && p < 0.6, "sample a real partial transit");
const clean = sample(0).cd, full = sample(1).cd;
assert.ok(dyn.last_aero.cd > clean && dyn.last_aero.cd < full);
assert.ok(Math.abs((dyn.last_aero.cd - clean) / (full - clean) - p) < 1e-12);

clock.paused = true;
const saved = rt.snapshot();
rt.start("prelaunch");
assert.equal(rt.restore(saved), true);
assert.deepEqual(dyn.last_aero, saved.dynamics.telemetry!.aero, "warm recovery retains the completed sample");
const legacy = rt.snapshot(); delete legacy.dynamics.telemetry;
rt.systems.mechanisms.restore({ ...legacy.systems.mechanisms, gear_state: "down_locked", gear_t: 8 });
assert.equal(rt.restore(legacy), true);
assert.equal(clock.get_seconds, saved.clock.get_s);
assert.equal(bus.get_value("mech.gear.position"), p);
assert.deepEqual(dyn.last_aero, sample(p), "legacy recovery recomputes from the restored partial mechanism");
const restored = dyn.snapshot(); delete restored.telemetry;
assert.deepEqual(restored, legacy.dynamics, "no pose, effector, heat or timer integration during recovery");

clock.reset(0); bus.reset();
const cold = new SimRuntime();
assert.equal(cold.restore(legacy), true);
assert.deepEqual(cold.dynamics.last_aero, dyn.last_aero, "cold partial drag equals warm partial drag");
clock.paused = false;
clock.advance(10);
assert.equal(bus.get_value("mech.gear.position"), 1);
assert.equal(cold.dynamics.gear_down, true);
cold.controls.set("Gear", false);
clock.advance(0.1);
assert.equal(bus.get_value("mech.gear.position"), 1, "released command cannot retract down-locked gear");
assert.equal(cold.dynamics.gear_down, true);
console.log("Gear drag: unarmed DN, partial extension, down-lock, sticky deployment, warm/cold and legacy recovery passed.");
