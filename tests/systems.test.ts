/**
 * P4 systems depth: APU/hydraulics, payload bay doors, landing gear,
 * fire/smoke detection, fuel-cell reactant consumption, OMS engine
 * independence, RCS consumption, and the root-owned weight_on_wheels
 * event. These are the mission-system behaviors behind the deck's
 * F6 gear, R13 doors, R2 APU, R1 fuel-cell, and smoke C&W controls.
 *
 * Run with: npm test (root test list includes tests/systems.test.ts).
 */
import { bus } from "../src/core/bus.ts";
import { clock } from "../src/core/clock.ts";
import { SimRuntime } from "../src/core/runtime.ts";

let failures = 0;
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    failures += 1;
    console.error(`FAIL systems: ${msg}`);
  } else {
    console.log(`ok systems: ${msg}`);
  }
}

function reset() {
  clock.reset(0);
  bus.reset();
}

/** All three fuel cells off -> every main bus dark. */
function kill_buses(rt: SimRuntime): void {
  rt.controls.set("FuelCell1", false);
  rt.controls.set("FuelCell2", false);
  rt.controls.set("FuelCell3", false);
  clock.advance(0.1);
}

// --- APU / hydraulics ---

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  kill_buses(rt);
  assert(!bus.get_value("elec.bus.mn_a.powered", true), "buses dark with all cells off");
  rt.controls.set("Apu1", true);
  clock.advance(60);
  assert(bus.get_value("apu.1.state", "?") === "off", "APU does not spool without electrical power");
  assert(Number(bus.get_value("apu.running_count", 1)) === 0, "running_count stays zero");
}

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  rt.controls.set("Apu1", true);
  clock.advance(1);
  assert(bus.get_value("apu.1.state", "?") === "starting", "APU enters spool-up when commanded");
  clock.advance(60);
  assert(bus.get_value("apu.1.state", "?") === "running", "APU running after spool");
  const press = Number(bus.get_value("apu.1.hyd_press_pa", 0));
  assert(Math.abs(press - 20.68e6) < 20.68e6 * 0.05, `hyd pressure near 3000 psi (${press} Pa)`);
  assert(Number(bus.get_value("apu.running_count", 0)) === 1, "running_count tracks running units");
  assert(bus.get_value("hyd.servo_ok", false) === true, "servo power available once pressurized");
  assert(Number(bus.get_value("hyd.pressurized_count", 0)) === 1, "one system pressurized");
  rt.controls.set("Apu1", false);
  clock.advance(15);
  assert(bus.get_value("apu.1.state", "?") === "off", "shutdown returns APU to off");
  assert(Number(bus.get_value("apu.1.hyd_press_pa", 1)) < 1e6, "pressure decays after shutdown");
  assert(bus.get_value("hyd.servo_ok", true) === false, "servo power lost with no APU running");
}

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  rt.systems.apu.units[0].fuel_kg = 0.001; // nearly dry [test probe]
  rt.controls.set("Apu1", true);
  clock.advance(60);
  assert(bus.get_value("apu.1.state", "?") === "off", "APU flames out when hydrazine is exhausted");
  assert(Number(bus.get_value("apu.1.fuel_kg", 1)) === 0, "fuel does not go negative");
}

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  rt.controls.set("Apu2", true);
  clock.advance(60);
  assert(bus.get_value("apu.2.state", "?") === "running", "APU 2 running (snapshot source)");
  const snap = rt.snapshot();
  assert(snap.schema_version === 2, "snapshot schema bumped to 2 for P4 systems");
  assert(snap.systems.apu !== undefined, "snapshot envelope includes APU state");
  rt.controls.set("Apu2", false);
  clock.advance(5);
  assert(bus.get_value("apu.2.state", "?") === "off", "APU 2 off before restore");
  assert(rt.restore(snap), "restore accepts the schema-2 snapshot");
  assert(bus.get_value("apu.2.state", "?") === "running", "restore returns APU 2 to running");
}

// --- Payload bay doors ---

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  rt.controls.set("Plbd", true);
  clock.advance(1);
  assert(bus.get_value("mech.plbd.state", "?") === "unlatching", "door unlatch sequence starts");
  clock.advance(3);
  assert(bus.get_value("mech.plbd.state", "?") === "driving_open", "drive starts after unlatch");
  clock.advance(30);
  const pos = Number(bus.get_value("mech.plbd.position", 0));
  assert(pos > 0.3 && pos < 0.7, `door mid-transit (${pos})`);
  assert(bus.get_value("mech.plbd.talkback", "?") === "TRANSIT", "talkback TRANSIT during drive");
  assert(bus.get_value("mech.plbd.moving", false) === true, "moving flag during transit");
  clock.advance(60);
  assert(bus.get_value("mech.plbd.state", "?") === "open", "door reaches open");
  assert(bus.get_value("mech.plbd.talkback", "?") === "OP", "talkback OP when open");
  rt.controls.set("Plbd", false);
  clock.advance(70);
  assert(bus.get_value("mech.plbd.state", "?") === "closed_latched", "door closes and latches");
  assert(bus.get_value("mech.plbd.talkback", "?") === "CL", "talkback CL when latched");
  assert(bus.get_value("mech.plbd.latched", false) === true, "latched flag true");
}

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  rt.controls.set("Plbd", true);
  clock.advance(10); // driving_open, partway
  const pos = Number(bus.get_value("mech.plbd.position", 0));
  assert(pos > 0, "door partway open before reversal");
  rt.controls.set("Plbd", false);
  clock.advance(1);
  assert(bus.get_value("mech.plbd.state", "?") === "driving_closed", "drive reverses mid-transit");
  clock.advance(70);
  assert(bus.get_value("mech.plbd.state", "?") === "closed_latched", "reversed door closes and latches");
}

// --- Landing gear ---

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  rt.controls.set("Gear", true);
  clock.advance(10);
  assert(bus.get_value("mech.gear.state", "?") === "up", "DN without ARM does nothing");
  rt.controls.set("Gear", false);
  rt.controls.press("GearArm");
  clock.advance(0.1);
  assert(bus.get_value("mech.gear.state", "?") === "armed", "ARM latches the extend valves");
  assert(bus.get_value("mech.gear.armed", false) === true, "armed talkback");
  rt.controls.set("Gear", true);
  clock.advance(4);
  assert(bus.get_value("mech.gear.state", "?") === "extending", "extend transit runs");
  assert(bus.get_value("mech.gear.talkback", "?") === "TRANSIT", "talkback TRANSIT during extend");
  clock.advance(10);
  assert(bus.get_value("mech.gear.state", "?") === "down_locked", "gear reaches down-lock");
  assert(bus.get_value("mech.gear.down_locked", false) === true, "down-lock talkback");
  assert(bus.get_value("mech.gear.talkback", "?") === "DN", "talkback DN at down-lock");
  rt.controls.set("Gear", false);
  clock.advance(5);
  assert(bus.get_value("mech.gear.state", "?") === "down_locked", "gear does not retract");
}

// --- Fire / smoke detection ---

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  assert(bus.get_value("sys.fire.detector_flt_dk_ok", false) === true, "detector powered by default (breaker closed, MN A on)");
  assert(bus.get_value("sys.fire.smoke_flt_dk", true) === false, "no alarm without smoke");
  rt.controls.press("SmokeFault");
  clock.advance(0.1);
  assert(bus.get_value("sys.fire.smoke_flt_dk", false) === true, "smoke trips the alarm while powered");
  rt.controls.pull_breaker("CbMnaSmokeDetnFltDk");
  clock.advance(0.1);
  assert(bus.get_value("sys.fire.detector_flt_dk_ok", true) === false, "pulled breaker kills detector power");
  assert(bus.get_value("sys.fire.smoke_flt_dk", true) === false, "unpowered detector cannot alarm");
  rt.controls.push_breaker("CbMnaSmokeDetnFltDk");
  clock.advance(0.1);
  assert(bus.get_value("sys.fire.smoke_flt_dk", false) === true, "alarm returns when power returns");
  rt.controls.release("SmokeFault");
  clock.advance(0.1);
  assert(bus.get_value("sys.fire.smoke_flt_dk", true) === false, "alarm clears when smoke clears");
}

// --- Fuel-cell reactants ---

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  const o2_0 = Number(bus.get_value("elec.reactant.o2_kg", 0));
  const h2_0 = Number(bus.get_value("elec.reactant.h2_kg", 0));
  assert(o2_0 > 0 && h2_0 > 0, "reactant pools start full");
  clock.advance(100);
  const o2_1 = Number(bus.get_value("elec.reactant.o2_kg", 0));
  const expected = 3 * 2.0e-4 * 100;
  assert(Math.abs(o2_0 - o2_1 - expected) < 1e-9, `O2 consumed by 3 online cells (${o2_0 - o2_1} kg)`);
  assert(Number(bus.get_value("elec.reactant.h2_kg", h2_0)) < h2_0, "H2 consumed too");
}

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  rt.systems.electrical.o2_kg = 0.001; // nearly dry [test probe]
  clock.advance(10);
  assert(Number(bus.get_value("elec.reactant.o2_kg", 1)) === 0, "pool drains to zero, not below");
  assert(bus.get_value("elec.bus.mn_a.powered", true) === false, "empty pool takes the buses dark");
  // Switch truth stays ON: the contactor is still closed, there is just
  // nothing to burn.
  assert(bus.get_value("elec.source.fuel_cell_1.on", false) === true, "switch position truth survives depletion");
  const snap = rt.snapshot();
  assert(snap.systems.electrical.o2_kg === 0, "snapshot carries the drained pool");
  assert(rt.restore(snap), "restore of reactant state round-trips");
}

// --- OMS engine independence ---

reset();
{
  const rt = new SimRuntime();
  rt.start("orbit");
  rt.controls.set("OmsBurn", true);
  clock.advance(1);
  assert(Number(bus.get_value("prop.oms.eng_l.thrust_n", 0)) === 26_700, "left engine makes 26.7 kN");
  assert(Number(bus.get_value("prop.oms.eng_r.thrust_n", 0)) === 26_700, "right engine makes 26.7 kN");
  assert(Number(bus.get_value("prop.thrust_n", 0)) === 53_400, "combined thrust still 53.4 kN");
  const qty = Number(bus.get_value("prop.oms.qty_kg", 0));
  assert(qty < 8_000 && qty > 7_900, `burn consumed propellant (${qty} kg of 8000)`);
  rt.systems.propulsion.oms_l_kg = 0; // left pod dry [test probe]
  clock.advance(1);
  assert(Number(bus.get_value("prop.oms.eng_l.thrust_n", 1)) === 0, "dry left engine makes no thrust");
  assert(Number(bus.get_value("prop.oms.eng_r.thrust_n", 0)) === 26_700, "right engine unaffected");
  assert(Number(bus.get_value("prop.thrust_n", 0)) === 26_700, "thrust halves with one engine out");
  assert(
    Number(bus.get_value("prop.oms.qty_kg", 0)) ===
      Number(bus.get_value("prop.oms.pod_l_kg", 1)) + Number(bus.get_value("prop.oms.pod_r_kg", 1)),
    "combined quantity is the sum of the pods",
  );
}

// --- RCS consumption ---

reset();
{
  const rt = new SimRuntime();
  rt.start("orbit");
  const r0 = Number(bus.get_value("prop.rcs.qty_kg", 0));
  bus.set_value("ctl.hand.roll", 0.5); // hand-flying draws RCS
  clock.advance(10);
  const r1 = Number(bus.get_value("prop.rcs.qty_kg", r0));
  assert(r1 < r0, `RCS consumed by hand flying (${r0 - r1} kg)`);
  assert(bus.get_value("prop.rcs.available", false) === true, "RCS still available");
  bus.set_value("ctl.hand.roll", 0);
}

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  const r0 = Number(bus.get_value("prop.rcs.qty_kg", 0));
  bus.set_value("ctl.hand.roll", 0.5);
  clock.advance(10);
  const r1 = Number(bus.get_value("prop.rcs.qty_kg", r0));
  assert(r1 === r0, "no RCS draw in the stack config (aerosurface/ascent costs nothing)");
  bus.set_value("ctl.hand.roll", 0);
}

reset();
{
  const rt = new SimRuntime();
  rt.start("orbit");
  rt.systems.propulsion.rcs_kg = 0.001; // nearly dry [test probe]
  bus.set_value("ctl.hand.roll", 0.5);
  clock.advance(10);
  assert(bus.get_value("prop.rcs.available", true) === false, "depleted RCS reports unavailable");
  bus.set_value("ctl.hand.roll", 0);
}

// --- Manual RCS rate damping ---
// A stick bump must not leave a permanent spin: the manual DAP path damps
// body rates the way the historical DAP did (no aerodynamic damping in
// vacuum, so undamped hand torque tumbled forever).

reset();
{
  const rt = new SimRuntime();
  rt.start("orbit");
  bus.set_value("ctl.hand.roll", 0.5);
  clock.advance(1); // bump: 1 s of half stick
  bus.set_value("ctl.hand.roll", 0);
  const w0 = Math.abs(Number(bus.get_value("guid.rate.roll", 0)));
  assert(w0 > 0.01, `bump imparts a roll rate (${w0.toFixed(3)} deg/s)`);
  clock.advance(10); // hands off: damping must kill the rate
  const w1 = Math.abs(Number(bus.get_value("guid.rate.roll", 0)));
  assert(w1 < 0.05, `roll rate damps out after hands-off (${w1.toFixed(3)} deg/s)`);
  assert(w1 < w0, "bumped rate decays rather than persisting");
}

// --- Root-owned weight_on_wheels ---

reset();
{
  const rt = new SimRuntime();
  rt.start("approach");
  assert(rt.sequencer.phase === "approach", "starts in approach");
  rt.dynamics.landed = true; // runway contact owned by dynamics (P3)
  clock.advance(0.1);
  assert(bus.get_value("mission.event.weight_on_wheels", false) === true, "root fires weight_on_wheels from dyn.landed");
  assert(rt.sequencer.phase === "rollout", "touchdown advances to rollout");
}

// --- Old snapshots are rejected ---

reset();
{
  const rt = new SimRuntime();
  rt.start("prelaunch");
  assert(rt.restore({ schema_version: 1 }) === false, "schema-1 snapshot is rejected");
  assert(rt.last_checkpoint_error.length > 0, "rejection records an error");
}

if (failures > 0) {
  console.error(`${failures} systems test(s) failed`);
  process.exit(1);
} else {
  console.log("systems.test.ts: all passed");
}
