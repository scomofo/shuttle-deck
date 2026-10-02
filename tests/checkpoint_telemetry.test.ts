import assert from "node:assert/strict";
import { bus } from "../src/core/bus.ts";
import { clock } from "../src/core/clock.ts";
import { SimRuntime } from "../src/core/runtime.ts";
import fixture from "../web/deck/review/cabin-fixture.json" with { type: "json" };

const channels = ["aero.alpha_deg", "aero.beta_deg", "aero.q_dyn_pa", "aero.heating_proxy", "aero.mach", "aero.blackout", "aero.plasma", "dyn.accel_g"];
const readings = () => channels.map(channel => bus.get_value(channel));
clock.reset(0); bus.reset();
const rt = new SimRuntime();
// Actual GUI-saved approach fixture; the root's generic "entry" start seeds
// orbit and does not place the browser's atmospheric training scenario.
assert.equal(rt.restore(fixture.approach.root as unknown as ReturnType<SimRuntime["snapshot"]>), true);
clock.advance(0.5);
clock.paused = true;
const saved = rt.snapshot(), expected = readings();
assert.ok(Math.abs(Number(bus.get_value("aero.alpha_deg"))) > 0.01, "Use an actual atmospheric approach with nonzero alpha");
assert.ok(Number(bus.get_value("aero.q_dyn_pa")) > 0);

rt.start("prelaunch");
assert.equal(rt.restore(saved), true);
assert.deepEqual(readings(), expected, "Warm recovery must preserve completed instrument samples");
assert.deepEqual(rt.snapshot().dynamics, saved.dynamics);

clock.reset(0); bus.reset_values_only();
const cold = new SimRuntime();
assert.equal(cold.restore(saved), true);
assert.deepEqual(readings(), expected, "Fresh-page recovery must not publish zero alpha/thermal/g telemetry");
assert.deepEqual(cold.snapshot().dynamics, saved.dynamics);
assert.equal(clock.get_seconds, saved.clock.get_s);

// Saved samples cannot alias mutable owner memory, in either direction.
const savedForce = saved.dynamics.telemetry!.aero.a_eci.x;
cold.dynamics.last_aero.a_eci.x += 10;
assert.equal(saved.dynamics.telemetry!.aero.a_eci.x, savedForce);
assert.equal(cold.restore(saved), true);
saved.dynamics.telemetry!.aero.torque_body.x += 100;
assert.notEqual(cold.dynamics.last_aero.torque_body.x, saved.dynamics.telemetry!.aero.torque_body.x);

const legacy = cold.snapshot(); delete legacy.dynamics.telemetry;
assert.equal(cold.restore(legacy), true);
assert.ok(Math.abs(Number(bus.get_value("aero.alpha_deg"))) > 0.01, "Old atmospheric saves recompute coherent telemetry while paused");
const recovered = cold.snapshot().dynamics; delete recovered.telemetry;
assert.deepEqual(recovered, legacy.dynamics, "Legacy recovery must not advance pose, effectors or heat load");
assert.equal(clock.get_seconds, legacy.clock.get_s);

// An old orbital save cannot retain the preceding entry's heating/blackout.
rt.start("orbit");
const orbit = rt.snapshot(); delete orbit.dynamics.telemetry;
assert.equal(cold.restore(legacy), true);
assert.equal(cold.restore(orbit), true);
assert.equal(bus.get_value("aero.alpha_deg"), 0);
assert.equal(bus.get_value("aero.heating_proxy"), 0);
assert.equal(bus.get_value("aero.plasma"), 0);
assert.equal(bus.get_value("aero.blackout"), false);

assert.throws(() => cold.dynamics.restore({ ...orbit.dynamics, telemetry: { ...saved.dynamics.telemetry!, accel_g: NaN } }), /Invalid dynamics telemetry/);
assert.throws(() => cold.dynamics.restore({ ...orbit.dynamics, telemetry: { ...saved.dynamics.telemetry!, aero: { ...saved.dynamics.telemetry!.aero, alpha_deg: Infinity } } }), /Invalid dynamics telemetry/);
console.log("Checkpoint telemetry: exact warm/cold readings, legacy recomputation, unchanged time/pose/heat, isolated samples and stale-entry clearing passed.");
