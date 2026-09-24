import assert from "node:assert/strict";
import { exhaustLevels } from "../src/game/exhaust-state.ts";
const state = { running: true, phase: "ascent", plume: 1, etAttached: true, srbAttached: true, doorsOpen: false, omsProp: 1 };
assert.deepEqual(exhaustLevels(state), { main: 1, booster: 1, oms: 0 });
assert.deepEqual(exhaustLevels({ ...state, srbAttached: false }), { main: 1, booster: 0, oms: 0 });
assert.deepEqual(exhaustLevels({ ...state, phase: "orbit", etAttached: false, srbAttached: false, plume: 0.45 }), { main: 0, booster: 0, oms: 0.45 });
for (const phase of ["entry", "taem", "approach", "rollout", "landed", "lost"]) {
  assert.deepEqual(exhaustLevels({ ...state, phase }), { main: 0, booster: 0, oms: 0 }, phase);
}
assert.equal(exhaustLevels({ ...state, phase: "orbit", doorsOpen: true }).oms, 0);
assert.equal(exhaustLevels({ ...state, phase: "orbit", omsProp: 0.02 }).oms, 0);
assert.deepEqual(exhaustLevels({ ...state, running: false }), { main: 0, booster: 0, oms: 0 });
assert.deepEqual(exhaustLevels({ ...state, plume: NaN }), { main: 0, booster: 0, oms: 0 });
console.log("Exhaust routing: launch, staging, OMS, blocked burn, inactive and unpowered phases pass");
