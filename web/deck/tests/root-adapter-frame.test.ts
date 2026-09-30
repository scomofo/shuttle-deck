import assert from "node:assert/strict";
import { RootAdapter, type AdapterStartMode } from "../src/sim/root_adapter.ts";
import { bus } from "../src/gen/src/core/bus.js";

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
}

console.log("Root adapter reads altitude and attitude in the vehicle's local frame");
