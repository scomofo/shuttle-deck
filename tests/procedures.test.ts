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
import fcBus from "../assets/data/missions/sts_template/procedures/fc_main_bus.json" with { type: "json" };
import smoke from "../assets/data/missions/sts_template/procedures/smoke_breaker.json" with { type: "json" };
import deorbit from "../assets/data/missions/sts_template/procedures/orbit_deorbit.json" with { type: "json" };

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

function test_fc_main_bus_chain() {
  reset();
  const rt = new SimRuntime();
  const runner = new ProcedureRunner(rt);
  assert(runner.run(fcBus as Procedure), runner.failures.join("\n"));
  assert(bus.get_value("elec.talkback.fc1_mn_a") === "ON", "talkback stays the contactor, not the dead bus");
  assert(bus.get_value("elec.bus.mn_a.powered") === false, "opening the only tie drops MN A");
  assert(bus.get_value("ctl.elec.fc1_mn_a") === "CENTER", "switch must have sprung back");
}

function test_contactor_latch_survives_restore() {
  reset();
  const rt = new SimRuntime();
  rt.start("prelaunch");
  rt.controls.press("Fc1MnA", "OFF");
  clock.advance(0.06);
  rt.controls.release("Fc1MnA");
  assert(bus.get_value("elec.talkback.fc1_mn_a") === "OFF", "held OFF opens the contactor");
  assert(bus.get_value("ctl.elec.fc1_mn_a") === "CENTER", "release is not the contactor");
  const snap = rt.snapshot();
  rt.controls.press("Fc1MnA", "ON");
  clock.advance(0.06);
  rt.controls.release("Fc1MnA");
  assert(bus.get_value("elec.talkback.fc1_mn_a") === "ON", "held ON recloses");
  assert(rt.restore(snap), rt.last_checkpoint_error);
  assert(bus.get_value("elec.talkback.fc1_mn_a") === "OFF", "restore returns the latch, not the later switch");
  clock.advance(0.06);
  assert(bus.get_value("elec.talkback.fc1_mn_a") === "OFF", "a sprung-back switch must not reclose after restore");
}

function test_smoke_breaker_kills_the_load_not_the_bus() {
  reset();
  const rt = new SimRuntime();
  const runner = new ProcedureRunner(rt);
  assert(runner.run(smoke as Procedure), runner.failures.join("\n"));
  assert(bus.get_value("elec.bus.mn_a.powered") === true, "tied MN A is back");
  assert(bus.get_value("elec.load.smoke_detn_flt_dk.powered") === true, "closed breaker on a live bus powers the load");
}

function test_pulled_breaker_survives_restore() {
  reset();
  const rt = new SimRuntime();
  rt.start("prelaunch");
  assert(bus.get_value("elec.load.smoke_detn_flt_dk.powered") === true, "load starts powered");
  rt.controls.pull_breaker("CbMnaSmokeDetnFltDk");
  clock.advance(0.06);
  assert(bus.get_value("elec.load.smoke_detn_flt_dk.powered") === false, "pulled breaker drops the load");
  assert(bus.get_value("elec.bus.mn_a.powered") === true, "MN A stays up");
  assert(bus.get_value("elec.load.annun_fwd_aca_1.powered") === true, "the other O14 load stays up");
  const snap = rt.snapshot();
  rt.controls.push_breaker("CbMnaSmokeDetnFltDk");
  clock.advance(0.06);
  assert(bus.get_value("elec.load.smoke_detn_flt_dk.powered") === true, "pushed breaker restores the load");
  assert(rt.restore(snap), rt.last_checkpoint_error);
  assert(bus.get_value("ctl.elec.cb.mna_smoke_detn_flt_dk") === false, "restore returns the pulled breaker");
  assert(bus.get_value("elec.load.smoke_detn_flt_dk.powered") === false, "the load stays dead across restore");
  clock.advance(0.06);
  assert(bus.get_value("elec.load.smoke_detn_flt_dk.powered") === false, "a restored open breaker must not reclose itself");
}

function test_breaker_rejects_set_control() {
  reset();
  const rt = new SimRuntime();
  const runner = new ProcedureRunner(rt);
  const bad = {
    ...(smoke as Procedure),
    id: "STS-SYNTH-BREAKER",
    fidelity: "synthetic" as const,
    steps: [{ action: "set_control", target: "CbMnaSmokeDetnFltDk", value: false }],
  };
  const errs = runner.validate(bad);
  assert(errs.some((e) => e.includes("pull_breaker")), `got ${errs}`);
}

function test_checkpoint_retains_switches_and_releases_held_commands() {
  reset();
  const rt = new SimRuntime();
  rt.start("orbit");
  rt.controls.set("Apu2", true);
  rt.controls.set("Plbd", true);
  clock.advance(20);
  assert(bus.get_value("apu.2.state") === "starting", "APU is still spooling");
  assert(bus.get_value("mech.plbd.talkback") === "TRANSIT", "doors are in transit");
  rt.controls.set("OmsBurn", true);
  rt.controls.set_hand(1, -1, 1);
  rt.controls.press("Fc1MnA", "OFF");
  rt.controls.press("Deorbit");
  const snap = rt.snapshot();
  rt.controls.set("Apu2", false);
  rt.controls.set("Plbd", false);
  assert(rt.restore(snap), rt.last_checkpoint_error);
  assert(bus.get_value("ctl.apu.2.start") === true, "crew APU switch returns to START/RUN");
  assert(bus.get_value("ctl.plbd.open") === true, "door switch retains its direction");
  assert(bus.get_value("ctl.oms.burn") === false, "held burn is released");
  assert(bus.get_value("ctl.hand.pitch") === 0 && bus.get_value("ctl.hand.roll") === 0, "hand inputs are neutral");
  assert(bus.get_value("ctl.elec.fc1_mn_a") === "CENTER", "momentary switch springs back");
  assert(bus.get_value("seq.cmd.deorbit") === false, "button cannot replay on the next tick");
  clock.advance(45);
  assert(bus.get_value("apu.2.state") === "running", "restored APU finishes its spool");
  assert(bus.get_value("mech.plbd.open") === true, "restored doors finish opening");
}

function test_momentary_rejects_set_control() {
  reset();
  const rt = new SimRuntime();
  const runner = new ProcedureRunner(rt);
  const bad = {
    ...(fuel as Procedure),
    id: "STS-SYNTH-MOMENTARY",
    fidelity: "synthetic" as const,
    steps: [{ action: "set_control", target: "Fc1MnA", value: "OFF" }],
  };
  const errs = runner.validate(bad);
  assert(errs.some((e) => e.includes("press_control")), `got ${errs}`);
}

function test_wrong_mission_rejected() {
  reset();
  const rt = new SimRuntime();
  const runner = new ProcedureRunner(rt);
  const bad = { ...(fuel as Procedure), mission: "gemini_4" };
  const errs = runner.validate(bad);
  assert(errs.some((e) => e.includes("gemini_4")), `got ${errs}`);
}

function test_orbit_deorbit_procedure() {
  reset();
  const rt = new SimRuntime();
  const runner = new ProcedureRunner(rt);
  assert(runner.run(deorbit as Procedure), runner.failures.join("\n"));
  assert(rt.sequencer.phase === "deorbit", `phase ${rt.sequencer.phase}`);
  assert(Number(bus.get_value("dyn.periapsis_alt_m", 0)) < 110_000, "OMS burn dropped periapsis");
}

const tests = [
  test_set_channel_cannot_write_dynamics,
  test_fuel_cell_protect,
  test_launch_insertion,
  test_fc_main_bus_chain,
  test_contactor_latch_survives_restore,
  test_smoke_breaker_kills_the_load_not_the_bus,
  test_pulled_breaker_survives_restore,
  test_checkpoint_retains_switches_and_releases_held_commands,
  test_breaker_rejects_set_control,
  test_momentary_rejects_set_control,
  test_wrong_mission_rejected,
  test_orbit_deorbit_procedure,
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
