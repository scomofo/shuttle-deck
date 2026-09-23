import { bus } from "../src/core/bus.ts";
import { clock } from "../src/core/clock.ts";
import { SimRuntime } from "../src/core/runtime.ts";
import { Presenter } from "../src/presentation/presenter.ts";

function reset() {
  clock.reset(0);
  bus.reset();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function test_presenter_inverts_world_from_bus() {
  reset();
  bus.set_value("dyn.r_eci_m", [1000, 2000, 3000]);
  bus.set_value("mission.phase", "orbit");
  bus.set_value("time.get_s", 12);
  const p = new Presenter();
  const v = p.sync();
  assert(v.world_r_cabin_m[0] === -1000, "cabin-fixed invert x");
  assert(v.world_r_cabin_m[1] === -2000, "cabin-fixed invert y");
  assert(v.earth_distance_m > 3000, `range ${v.earth_distance_m}`);
}

function test_presenter_cannot_feed_dynamics() {
  reset();
  const rt = new SimRuntime();
  rt.start("prelaunch");
  const r0 = [...(bus.get_value("dyn.r_eci_m", [0, 0, 0]) as number[])];
  rt.presenter.last.world_r_cabin_m = [9, 9, 9];
  bus.set_value("present.world_r_cabin_m", [9, 9, 9]);
  const r1 = bus.get_value("dyn.r_eci_m", [0, 0, 0]) as number[];
  assert(r1[0] === r0[0] && r1[1] === r0[1] && r1[2] === r0[2], "present.* must not mutate dyn.*");
}

function test_present_write_does_not_bump_command_epoch() {
  reset();
  const e0 = bus.command_epoch;
  bus.set_value("present.earth_distance_m", 1);
  assert(bus.command_epoch === e0, "present.* is not a command");
}

const tests = [
  test_presenter_inverts_world_from_bus,
  test_presenter_cannot_feed_dynamics,
  test_present_write_does_not_bump_command_epoch,
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
