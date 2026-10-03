import assert from "node:assert/strict";
import * as THREE from "three";
import { bodyBasis, ShuttleRuntime } from "../src/sim/runtime.ts";
import { clock } from "../src/gen/src/core/clock.js";
import { CABIN } from "../src/game/cabin-layout.ts";
import { createPayloadGeometry, PAYLOAD_BAY, payloadDoorAngle, SEATED_BAY_ORIGIN } from "../src/game/payload-layout.ts";
import { orbiterModelBasis } from "../src/game/orbiter-frame.ts";

const geometry = createPayloadGeometry();
const all = [geometry.liner, geometry.aft, geometry.fore, ...geometry.doors, ...geometry.radiators.flat()];
for (const g of all) {
  const p = g.getAttribute("position");
  assert.ok(Array.from(p.array).every(Number.isFinite));
  g.computeBoundingBox();
  assert.ok(g.boundingBox!.min.z + SEATED_BAY_ORIGIN[2] > CABIN.aft, "Bay must remain behind the pressure wall");
}
// The closed halves meet at the crown and hinge along both full-length sills.
for (const [i, side] of [-1, 1].entries()) {
  const p = geometry.doors[i].getAttribute("position");
  for (let row = 0; row <= 4; row++) {
    assert.ok(Math.abs(p.getX(row * 25)) < 1e-6);
    assert.ok(Math.abs(p.getY(row * 25)) < 1e-6);
    assert.ok(Math.abs(p.getX(row * 25 + 24) + side * PAYLOAD_BAY.halfWidth) < 1e-6);
    assert.ok(Math.abs(p.getY(row * 25 + 24) - PAYLOAD_BAY.rise) < 1e-6);
  }
}
// The bulkhead closes the lower trough and upper crown, rather than cutting
// across or leaving the far end open. Check actual triangulated intersections.
const aft = new THREE.Mesh(geometry.aft, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
aft.updateMatrixWorld();
for (const y of [-1.7, -0.5, 0, 0.9]) {
  const ray = new THREE.Raycaster(new THREE.Vector3(0, y, 1), new THREE.Vector3(0, 0, 1));
  assert.ok(ray.intersectObject(aft).length, `Aft closure at y=${y}`);
}
const fore = new THREE.Mesh(geometry.fore, aft.material);
fore.updateMatrixWorld();
for (const y of [-1.7, -0.5, 0, 0.9]) {
  const ray = new THREE.Raycaster(new THREE.Vector3(0, y, 1), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(fore).length, `Exterior fore closure at y=${y}`);
}
assert.equal(payloadDoorAngle(NaN), 0);
assert.equal(payloadDoorAngle(-1), 0);
assert.equal(payloadDoorAngle(2), PAYLOAD_BAY.openAngle);

// A +Z-nose orbiter needs a proper rotation: R/D/N alone is a reflection.
for (const yaw of [0, 0.8, -2.7]) for (const pitch of [-0.4, 0, 0.7]) for (const bank of [-1, 0, 1.3]) {
  const b = bodyBasis(yaw, pitch, bank);
  const nose = new THREE.Vector3(b.nx, b.ny, b.nz), dorsal = new THREE.Vector3(b.dx, b.dy, b.dz);
  const m = orbiterModelBasis(new THREE.Vector3(b.rx, b.ry, b.rz), dorsal, nose);
  assert.ok(Math.abs(m.determinant() - 1) < 1e-12);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(q).distanceTo(nose) < 1e-12);
  assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(q).distanceTo(dorsal) < 1e-12);
}

// Exercise the real owner with crew commands, then cold/cross-scenario
// recovery. No bus/physics assignment or second animation state is used.
const sim = new ShuttleRuntime();
const tick = (count: number, s = sim) => { for (let i = 0; i < count; i++) s.step(0.05); };
sim.start("orbit"); sim.setRate(1); sim.perform("doors-open"); tick(650);
assert.equal(sim.doorTalkback, "TRANSIT");
assert.equal(sim.doorsOpen, false);
assert.ok(sim.doorPosition > 0.4 && sim.doorPosition < 0.6);
assert.ok(payloadDoorAngle(sim.doorPosition) > 0.6, "Geometry moves before the OPEN talkback");
sim.togglePause();
const saved = sim.snapshot(), position = sim.doorPosition;
tick(200);
assert.equal(sim.doorPosition, position, "Paused root position must freeze the renderer");
sim.start("approach");
assert.equal(sim.restore(saved), true);
assert.equal(sim.doorPosition, position);
clock.reset(0);
const cold = new ShuttleRuntime();
assert.equal(cold.restore(saved), true);
assert.equal(cold.doorPosition, position);
assert.equal(cold.paused, true);
cold.togglePause(); cold.perform("doors-close"); tick(100, cold);
assert.ok(cold.doorPosition < position, "A reversal must immediately reverse displayed travel");
tick(1000, cold); assert.equal(cold.doorsLatched, true); assert.equal(cold.doorPosition, 0);
cold.perform("doors-open"); tick(1400, cold);
assert.equal(cold.doorPosition, 1); assert.equal(cold.doorsOpen, true);
all.forEach(g => g.dispose()); (aft.material as THREE.Material).dispose();
console.log("Payload bay: finite joined surfaces, aft closure, proper airframe rotation, real partial travel, pause, reversal and cold recovery pass.");
