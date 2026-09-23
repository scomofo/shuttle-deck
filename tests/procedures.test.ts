/**
 * Procedure runner gates (Gemini MISSION_PROCEDURE_TESTING.md §8, §11).
 */

import { bus } from "../src/core/bus.ts";
import { clock } from "../src/core/clock.ts";
import { SimRuntime } from "../src/core/runtime.ts";
import { ProcedureRunner, type Procedure } from "../src/mission/procedures.ts";
import launch from "../assets/data/missions/sts_template/procedures/launch_insertion.json" with { type: "json" };
import fuel from "../assets/data/missions/sts_template/procedures/fuel_cell_protect.json" with { type: "json" };
import invalid from "../assets/data/missions/sts_template/procedures/invalid_set_channel.json" with { type: "json" };

function reset() {
  clock.reset(0);
  bus.reset();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function test_set_channel_cannot_write_dynamics() {
  reset();
  const rt = new SimRuntime();
  const runner = new ProcedureRunner(rt);
  const errs = runner.validate(invalid as Procedure);
  assert(
    errs.some((e) => e.includes("set_channel is only allowed in synthetic")),
    `expected synthetic-only rule, got ${errs}`,
  );
  assert(
    errs.some((e) => e.includes("ctl.*")),
    `expected ctl.* rule, got ${errs}`,
  );
}

function test_fuel_cell_protect() {
  reset();
  const rt = new SimRuntime();
  const runner = new ProcedureRunner(rt);
  assert(runner.run(fuel as Procedure), runner.failures.join("\n"));
}

function test_launch_insertion() {
  reset();
  const rt = new SimRuntime();
  const runner = new ProcedureRunner(rt);
  assert(runner.run(launch as Procedure), runner.failures.join("\n"));
  assert(rt.sequencer.phase === "orbit", `phase ${rt.sequencer.phase}`);
  assert(rt.dynamics.driven === false, "insertion must have released the propagator");
  assert(rt.sequencer.fired.srb_sep !== undefined, "SRB sep latched");
  assert(rt.sequencer.fired.et_sep !== undefined, "ET sep latched");
}

function test_wrong_mission_rejected() {
  reset();
  const rt = new SimRuntime();
  const runner = new ProcedureRunner(rt);
  const bad = { ...(fuel as Procedure), mission: "gemini_4" };
  const errs = runner.validate(bad);
  assert(errs.some((e) => e.includes("gemini_4")), `got ${errs}`);
}

const tests = [
  test_set_channel_cannot_write_dynamics,
  test_fuel_cell_protect,
  test_launch_insertion,
  test_wrong_mission_rejected,
];

let failed = 0;
for (const t of tests) {
  try {
    t();
    console.log("ok ", t.name);
  } catch (err) {
    failed += 1;
    console.error("FAIL", t.name, err);
  }
}
if (failed) {
  console.error(failed, "failed");
  process.exit(1);
}
console.log(tests.length, "passed");
