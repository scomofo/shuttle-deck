/**
 * Architecture gates that Gemini Capsule actually enforces:
 * tick stage order, bus ownership, scripted-ascent handoff, snapshot restore.
 */

import { bus } from "../src/core/bus.ts";
import { clock, Stage } from "../src/core/clock.ts";
import { Dynamics } from "../src/dynamics/dynamics.ts";
import { Orbit } from "../src/dynamics/orbit.ts";
import { Mission, type MissionData } from "../src/mission/mission.ts";
import { MissionSequencer } from "../src/mission/sequencer.ts";
import { SimRuntime } from "../src/core/runtime.ts";
import sts from "../assets/data/missions/sts_template/mission.json" with { type: "json" };

function reset() {
  clock.reset(0);
  bus.reset();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, tol: number, msg: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg}: ${a} vs ${b} tol ${tol}`);
}

function test_tick_stages_run_in_order() {
  reset();
  const order: string[] = [];
  clock.add_ticker(() => order.push("dyn"), Stage.DYNAMICS);
  clock.add_ticker(() => order.push("mis"), Stage.MISSION);
  clock.add_ticker(() => order.push("sys"), Stage.SYSTEMS);
  clock.add_ticker(() => order.push("in"), Stage.INPUT);
  clock.add_ticker(() => order.push("pg"), Stage.POWER_GUIDANCE);
  clock.add_ticker(() => order.push("dep"), Stage.DEPENDENT);
  clock.advance(0.02);
  assert(order.join(",") === "in,mis,pg,sys,dyn,dep", `stage order ${order}`);
}

function test_ctl_bumps_command_epoch() {
  reset();
  const e0 = bus.command_epoch;
  bus.set_value("dyn.alt_m", 100);
  assert(bus.command_epoch === e0, "dyn write must not bump command_epoch");
  bus.set_value("ctl.hand.roll", 1);
  assert(bus.command_epoch === e0 + 1, "ctl write must bump command_epoch");
}

function test_two_body_orbit_holds() {
  const o = new Orbit();
  o.use_j2 = false;
  o.set_circular(250_000);
  const r0 = Math.hypot(o.r.x, o.r.y, o.r.z);
  const period = 2 * Math.PI * Math.sqrt((r0 * r0 * r0) / 3.986004418e14);
  let t = 0;
  while (t < period) {
    o.step(1.0);
    t += 1;
  }
  const r1 = Math.hypot(o.r.x, o.r.y, o.r.z);
  almost(r1, r0, 5, "two-body radius after 1 orbit");
}

function test_ascent_is_driven_then_handoff_releases_propagator() {
  reset();
  const mission = new Mission(sts as MissionData);
  const dyn = new Dynamics();
  const seq = new MissionSequencer(mission, dyn);
  clock.add_ticker((dt) => seq.tick(dt), Stage.MISSION);
  clock.add_ticker((dt) => dyn.tick(dt), Stage.DYNAMICS);
  seq.start("prelaunch", 0);
  seq.inject_event("liftoff");
  assert(dyn.driven, "ascent must drive dynamics");
  assert(seq.phase === "ascent", `expected ascent, got ${seq.phase}`);
  clock.advance(125);
  assert(seq.fired.srb_sep !== undefined, "SRB sep is a latched one-shot on GET");
  const r_before = [...(bus.get_value("dyn.r_eci_m", [0, 0, 0]) as number[])];
  clock.advance(400);
  assert(seq.phase === "insertion" || seq.phase === "ascent", `phase ${seq.phase}`);
  if (seq.phase === "insertion") {
    assert(dyn.driven === false, "MECO/insertion must release the propagator");
  }
  const r_after = bus.get_value("dyn.r_eci_m", [0, 0, 0]) as number[];
  const moved = Math.hypot(r_after[0] - r_before[0], r_after[1] - r_before[1], r_after[2] - r_before[2]);
  assert(moved > 1000, `state must advance in ECI, moved ${moved}`);
}

function test_snapshot_restore_does_not_refire_srb_sep() {
  reset();
  const rt = new SimRuntime(sts as MissionData);
  rt.start("prelaunch");
  rt.sequencer.inject_event("liftoff");
  clock.advance(130);
  assert(rt.sequencer.fired.srb_sep !== undefined, "sep fired");
  const snap = rt.snapshot();
  const get = clock.get_seconds;
  const r = [...(bus.get_value("dyn.r_eci_m", [0, 0, 0]) as number[])];
  clock.advance(20);
  assert(rt.restore(snap), rt.last_checkpoint_error);
  almost(clock.get_seconds, get, 1e-9, "GET after restore");
  const r2 = bus.get_value("dyn.r_eci_m", [0, 0, 0]) as number[];
  almost(r2[0], r[0], 1e-6, "r_eci.x");
  const fired_at = rt.sequencer.fired.srb_sep;
  clock.advance(1);
  assert(rt.sequencer.fired.srb_sep === fired_at, "restore must not duplicate SRB sep");
}

function test_bus_is_not_the_save_store() {
  reset();
  const elec_channel = "elec.main_bus.volts";
  bus.set_value(elec_channel, 99);
  const rt = new SimRuntime(sts as MissionData);
  rt.start("prelaunch");
  const v = Number(bus.get_value(elec_channel, 0));
  assert(v !== 99, "owner must republish its truth, not keep a stale bus write");
  assert(v > 18, `fuel cells should power the bus, got ${v}`);
}

const tests = [
  test_tick_stages_run_in_order,
  test_ctl_bumps_command_epoch,
  test_two_body_orbit_holds,
  test_ascent_is_driven_then_handoff_releases_propagator,
  test_snapshot_restore_does_not_refire_srb_sep,
  test_bus_is_not_the_save_store,
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
