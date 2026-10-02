import assert from "node:assert/strict";
import { RootAdapter, type AdapterStartMode } from "../src/sim/root_adapter.ts";
import { bus } from "../src/gen/src/core/bus.js";
import { landingCoordinates, landingPoint, landingRotation, makeLandingAnchor } from "../src/game/landing-layout.ts";
import * as THREE from "three";

const step = { roll: 0, pitch: 0, yaw: 0, burnKey: false, timeRate: 8 };

function run(mode: AdapterStartMode, frames: number): RootAdapter {
  const a = new RootAdapter();
  a.start(mode);
  for (let i = 0; i < frames; i++) a.step(0.05, step);
  return a;
}

// Deck ALT is height above the sphere at the vehicle, not above a tangent
// plane fixed at the scenario anchor (which read -3.5e6 m on orbit).
{
  const a = run("orbit", 3000); // ~20 sim-minutes, thousands of km downrange
  const alt = bus.get_value("dyn.alt_m") as number;
  assert.ok(Math.abs(a.view().y - alt) < 1, `orbit y ${a.view().y} vs dyn.alt_m ${alt}`);
  assert.ok(a.view().y > 150_000, "orbit altitude stays positive");
  // Circular orbit: vertical speed is small against the local vertical.
  assert.ok(Math.abs(a.view().vy) < 50, `orbit vy ${a.view().vy}`);
}

// Local-frame attitude: the entry start is built wings level along the
// Earth-relative velocity, 3,840 km from its anchor.
{
  const a = new RootAdapter();
  a.start("entry");
  const v = a.view();
  assert.ok(Math.abs(v.y - 121_920) < 1, `entry y ${v.y}`);
  assert.ok(Math.abs(v.x + 3_840_000) < 1, `entry x round-trips ${v.x}`);
  assert.ok(Math.abs(v.bank) < 1e-3, `entry bank ${v.bank}`);
  assert.ok(Math.abs(v.pitch + Math.atan2(195, 7_447)) < 0.01, `entry pitch ${v.pitch}`);
}

// Near the runway the frame matches the scenario placement.
{
  const a = new RootAdapter();
  a.start("approach");
  const v = a.view();
  assert.ok(Math.abs(v.x + 11_000) < 1 && Math.abs(v.y - 1_980) < 1 && Math.abs(v.z) < 1, "approach placement");
  assert.ok(v.terminalAnchor, "approach supplies a fixed landing anchor");
  const local = landingCoordinates(v.terminalAnchor, v.x, v.z);
  assert.ok(Math.abs(local.x + 11_000) < 1 && Math.abs(local.z) < 1, "vehicle is on the approach centerline");
}

console.log("Root adapter reads altitude and attitude in the vehicle's local frame");

// A held OMS command cannot illuminate a plume after propellant exhaustion.
{
  const a = new RootAdapter();
  a.start("orbit");
  for (let i = 0; i < 1400; i++) a.step(0.05, { ...step, burnKey: true });
  assert.equal(bus.get_value("ctl.oms.burn"), true, "crew input remains held");
  assert.equal(bus.get_value("prop.oms.qty_kg"), 0, "consume the real model's tanks");
  assert.equal(a.view().burnActive, false, "an empty engine is not firing");
  assert.equal(a.view().plume, 0, "visual exhaust follows engine thrust");
}
console.log("OMS indication and plume reflect actual engine firing");

// The scene's actual THREE rotation must put +X along the entering nose.
// Previously only translation was used, so any non-eastward approach saw
// a crosswise runway. Test cardinal/oblique headings and a lateral HAC start.
{
  const position = { x: 300_000, z: -700_000 };
  for (const [yaw, noseX, noseZ] of [
    [-Math.PI/2,1,0], [0,0,-1], [Math.PI/2,-1,0], [Math.PI,0,1],
    [-Math.PI/4,Math.SQRT1_2,-Math.SQRT1_2],
  ]) {
    const anchor = makeLandingAnchor(position.x,position.z,yaw,11_000,5_000);
    const scene = new THREE.Object3D();
    scene.rotation.y = landingRotation(anchor.yaw);
    scene.position.set(anchor.x,0,anchor.z);
    scene.updateMatrixWorld();
    const vehicle = scene.localToWorld(new THREE.Vector3(-11_000,0,-5_000));
    assert.ok(Math.hypot(vehicle.x-position.x,vehicle.z-position.z)<1e-8,"anchor retains the vehicle's layout position");
    const forward = new THREE.Vector3(1,0,0).transformDirection(scene.matrixWorld);
    assert.ok(Math.hypot(forward.x-noseX,forward.z-noseZ)<1e-12,"rendered runway points down the entering heading");
    const threshold = landingPoint(anchor,-400,0);
    const local = landingCoordinates(anchor,threshold.x,threshold.z);
    assert.ok(Math.abs(local.x+400)<1e-8 && Math.abs(local.z)<1e-8,"guide glide slope reads runway-local coordinates");
  }
}
console.log("Landing geometry aligns with arbitrary approach headings");
