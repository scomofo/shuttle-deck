import assert from "node:assert/strict";
import * as THREE from "three";
import { ShuttleRuntime } from "../src/sim/runtime.ts";
import { clock } from "../src/gen/src/core/clock.js";
import { GEAR_LAYOUT, GEAR_PIVOT_Y, gearFoldAngle } from "../src/game/gear-layout.ts";

const sim = new ShuttleRuntime();
const tick = (n: number, s = sim) => { for (let i = 0; i < n; i++) s.step(0.05); };
sim.start("approach"); sim.setRate(1);
assert.equal(sim.gearPosition, 0);
sim.perform("gear"); tick(2);
assert.equal(sim.gearPosition, 0, "DN without ARM cannot animate gear");
sim.perform("apu"); tick(1000);
sim.perform("gear-arm"); tick(2);
assert.equal(sim.gearTalkback, "ARM");
assert.equal(sim.gearPosition, 0, "ARM keeps the fitted hardware stowed");
for (let i = 0; i < 200 && sim.speed() > 190; i++) tick(20);
sim.perform("gear"); tick(80);
assert.equal(sim.gearTalkback, "TRANSIT");
assert.equal(sim.gear, false);
assert.ok(sim.gearPosition > 0.4 && sim.gearPosition < 0.6);
assert.ok(gearFoldAngle(sim.gearPosition) < -0.4, "Transit is visibly distinct from down-lock");
assert.equal(sim.procedures().flatMap(c => c.steps).find(s => s.id === "gear:down")?.done, false);
sim.togglePause();
const saved = sim.snapshot(), position = sim.gearPosition;
tick(200); assert.equal(sim.gearPosition, position, "Pause freezes owner and fitted pose");
sim.start("orbit"); assert.equal(sim.gearPosition, 0, "New flight clears travel");
assert.equal(sim.restore(saved), true); assert.equal(sim.gearPosition, position);
clock.reset(0);
const cold = new ShuttleRuntime();
assert.equal(cold.restore(saved), true);
assert.equal(cold.paused, true); assert.equal(cold.gearPosition, position);
cold.togglePause(); tick(100, cold);
assert.equal(cold.gearPosition, 1); assert.equal(cold.gearTalkback, "DN");
cold.perform("gear"); tick(10, cold); assert.equal(cold.gearPosition, 1, "One-way gear cannot retract");

// Six unchanged down-lock centers, and a continuous finite rigid transform.
for (const g of GEAR_LAYOUT) {
  const end = new THREE.Vector3(0, -2.4 + g.radius - GEAR_PIVOT_Y, 0);
  const deployed = end.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), gearFoldAngle(1, g.id));
  assert.ok(Math.abs(deployed.y + GEAR_PIVOT_Y - g.radius + 2.4) < 1e-12);
  assert.equal(deployed.z, 0);
  let last = end.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), gearFoldAngle(0, g.id));
  for (let i = 1; i <= 100; i++) {
    const p = end.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), gearFoldAngle(i / 100, g.id));
    assert.ok(p.toArray().every(Number.isFinite));
    assert.ok(p.distanceTo(last) < 0.04, "No down-lock geometry jump"); last = p;
  }
}
assert.equal(gearFoldAngle(NaN), gearFoldAngle(0));
assert.equal(gearFoldAngle(-1), gearFoldAngle(0));
assert.equal(gearFoldAngle(2), 0);
console.log("Gear: command guards, real partial travel, pause, cold/cross-scenario recovery, one-way lock and continuous contact-plane-preserving fit pass.");
