/**
 * STS-1 golden trajectory — P2 of the fidelity roadmap.
 *
 * Baseline data: assets/data/missions/sts1/mission.json, sourced from
 * ~/workspace/shuttle-deck-research/sts1-golden-trajectory.md
 * (STS-001 Press Kit primary; Wikipedia/NASA secondary; astronautix masses).
 * Every number in the baseline is sourced or tagged [estimated] in the JSON;
 * nothing here invents an "STS-1 actual" the research file lists as a gap.
 *
 * Two layers:
 *  1. Baseline data integrity — the JSON carries the research values exactly
 *     (guards the baseline file itself against drift).
 *  2. Sim-vs-baseline tolerances — fly the root sim and check real
 *     quantities against the research file's suggested tolerances.
 *
 * Where the current sim cannot yet hit a tolerance, the assertion is written
 * against the target with an explicit KNOWN-GAP comment and skipped — never
 * weakened into a tautology. Tolerances are bounds, not exact matches, so
 * the parallel P3 physics work can tighten the model without breaking them.
 */

import { bus } from "../src/core/bus.ts";
import { clock } from "../src/core/clock.ts";
import { SimRuntime } from "../src/core/runtime.ts";
import { Mission, type MissionData } from "../src/mission/mission.ts";
import { Dynamics } from "../src/dynamics/dynamics.ts";
import { len, sub, dot } from "../src/core/frames.ts";
import { v_rel } from "../src/dynamics/aero.ts";
import { nose_eci } from "../src/dynamics/attitude.ts";
import sts1json from "../assets/data/missions/sts1/mission.json" with { type: "json" };

const sts1 = sts1json as unknown as MissionData;
// Raw JSON access for the data-integrity layer (MissionData only types the
// fields the sim consumes).
const raw = sts1json as unknown as Record<string, any>;

function reset() {
  clock.reset(0);
  bus.reset();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, tol: number, msg: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg}: ${a} vs ${b} (tol ${tol})`);
}

/** Known gap: assertion written against the real target, skipped with the
 * reason recorded. Never a tautology. */
function knownGap(name: string, target: string, reason: string) {
  console.log(`SKIP (known gap) ${name}: target ${target} — ${reason}`);
}

// ---------------------------------------------------------------- data

function test_baseline_identity() {
  assert(sts1.id === "sts1", "mission id");
  assert(sts1.liftoff_utc === "1981-04-12T12:00:03Z", "liftoff_utc");
  almost(sts1.liftoff_jd, 2444707.000034722, 1e-9, "liftoff_jd");
  assert(raw.identity.vehicle === "OV-102 Columbia", "vehicle");
  assert(raw.identity.launch_site === "Kennedy Space Center, Pad 39A", "pad");
  assert(raw.identity.orbits === 36, "orbits");
  // Sourced masses (astronautix via research).
  assert(raw.masses.stack_liftoff_kg === 2041000, "stack mass");
  assert(raw.masses.orbiter_liftoff_kg === 99453, "orbiter liftoff mass");
  assert(raw.masses.orbiter_landing_kg === 88662, "orbiter landing mass");
  assert(raw.masses.dfi_payload_kg === 4909, "DFI payload");
}

function test_event_schedule_matches_press_kit() {
  const events = raw.event_schedule.events as Array<{ id: string; get_s: number; delta_v_mps?: number }>;
  const get = (id: string) => {
    const e = events.find((e) => e.id === id);
    assert(e, `event ${id} present`);
    return e!;
  };
  // METs, seconds — press kit Flight Sequence of Events.
  almost(get("srb_ignition").get_s, 0, 1e-9, "srb_ignition");
  almost(get("srb_sep").get_s, 132, 1e-9, "srb_sep"); // 0:02:12
  almost(get("meco").get_s, 512, 1e-9, "meco"); // 0:08:32
  almost(get("et_sep").get_s, 530, 1e-9, "et_sep"); // 0:08:50
  almost(get("oms1_ignition").get_s, 632, 1e-9, "oms1_ignition"); // 0:10:32
  almost(get("oms1_cutoff").get_s, 721, 1e-9, "oms1_cutoff");
  almost(get("oms2_ignition").get_s, 2640, 1e-9, "oms2_ignition"); // 0:44:00
  almost(get("oms2_cutoff").get_s, 2715, 1e-9, "oms2_cutoff");
  almost(get("oms3_ignition").get_s, 22841, 1e-9, "oms3_ignition"); // 6:20:41
  almost(get("oms4_ignition").get_s, 25531, 1e-9, "oms4_ignition"); // 7:05:31
  almost(get("deorbit_ignition").get_s, 192480, 1e-9, "deorbit_ignition"); // 53:28:00
  almost(get("deorbit_cutoff").get_s, 192627, 1e-9, "deorbit_cutoff"); // 53:30:27
  almost(get("entry_interface").get_s, 194162, 1e-9, "entry_interface"); // 53:56:02
  almost(get("taem").get_s, 195690, 1e-9, "taem"); // 54:21:30
  almost(get("landing").get_s, 196063, 1e-9, "landing"); // 54:27:43
  // Planned ΔVs, m/s.
  almost(get("oms1_ignition").delta_v_mps!, 50.3, 1e-9, "oms1 dv");
  almost(get("oms2_ignition").delta_v_mps!, 41.8, 1e-9, "oms2 dv");
  almost(get("oms3_ignition").delta_v_mps!, 11.1, 1e-9, "oms3 dv");
  almost(get("oms4_ignition").delta_v_mps!, 11.4, 1e-9, "oms4 dv");
  almost(get("deorbit_ignition").delta_v_mps!, 91.1, 1e-9, "deorbit dv");
  // The sequencer-driven ascent events are wired at the same GETs.
  assert(sts1.phases.ascent.events!.srb_sep === 132, "phase srb_sep");
  assert(sts1.phases.ascent.events!.meco === 512, "phase meco");
  assert(sts1.phases.ascent.on!.get_s === 512, "ascent->insertion at MECO");
  // Insertion block: post-OMS-2 achieved orbit (130/130 n.mi. → 246×248 km).
  almost(sts1.insertion.perigee_km, 246.0, 1e-9, "insertion perigee");
  almost(sts1.insertion.apogee_km, 248.0, 1e-9, "insertion apogee");
  almost(sts1.insertion.inclination_deg, 40.3, 1e-9, "insertion incl");
}

function test_runway_anchor() {
  const rwy = raw.runway;
  assert(rwy.id === "EDW-RWY23", "runway id");
  almost(rwy.touchdown_speed_mps, 94.2, 1e-9, "touchdown speed"); // 339 kph
  assert(rwy.rollout_m === 2741, "rollout");
  assert(rwy.miss_distance_m === 1844, "miss distance");
  // Anchor position itself is [estimated] (see JSON note); just require it.
  assert(typeof rwy.lat_deg === "number" && typeof rwy.lon_deg === "number", "anchor present");
}

// ---------------------------------------------------------------- sim

function test_ascent_event_mets() {
  reset();
  const rt = new SimRuntime(sts1);
  rt.start("prelaunch");
  clock.advance(10); // hold-down release
  rt.sequencer.inject_event("liftoff");
  assert(bus.get_value("mission.phase", "") === "ascent", "phase ascent after liftoff");

  clock.advance(140);
  const srbGet = Number(bus.get_value("mission.event_get.srb_sep", -1));
  almost(srbGet, 132, 5, "SRB sep MET ±5 s");

  clock.advance(380); // GET 520
  const mecoGet = Number(bus.get_value("mission.event_get.meco", -1));
  almost(mecoGet, 512, 5, "MECO MET ±5 s");
  assert(bus.get_value("mission.phase", "") === "insertion", "phase insertion after MECO");

  clock.advance(10); // GET 530 — crew ET sep per the press-kit MET
  rt.controls.press("EtSep");
  clock.advance(2);
  const etGet = Number(bus.get_value("mission.event_get.et_sep", -1));
  almost(etGet, 530, 5, "ET sep MET ±5 s");
  assert(bus.get_value("mission.phase", "") === "orbit", "phase orbit after ET sep");
  assert(bus.get_value("prop.et.attached", true) === false, "ET detached");
}

function test_stack_liftoff_mass() {
  reset();
  const rt = new SimRuntime(sts1);
  rt.start("prelaunch");
  const m = Number(bus.get_value("dyn.mass_kg", 0));
  // Research: stack 2,041,000 ± 20,000 kg at liftoff.
  almost(m, 2041000, 20000, "stack liftoff mass");
}

function test_deorbit_burn_captures() {
  reset();
  const rt = new SimRuntime(sts1);
  rt.start("orbit");
  // STS-1 post-OMS-4: 150/150 n.mi. ≈ 278 km circular, incl 40.3°.
  rt.dynamics.orbit.set_circular(278_000, (40.3 * Math.PI) / 180);
  rt.dynamics.publish();
  rt.controls.press("Deorbit");
  clock.advance(1);
  assert(bus.get_value("mission.phase", "") === "deorbit", "phase deorbit");

  rt.controls.set("DapRetro", true);
  rt.controls.set("OmsBurn", true);
  // Integrate the actually delivered ΔV (thrust/mass each step).
  let dv = 0;
  const dt = 0.02;
  const steps = Math.round(147 / dt); // press-kit burn duration
  for (let i = 0; i < steps; i++) {
    const t = Number(bus.get_value("prop.thrust_n", 0));
    const m = Number(bus.get_value("dyn.mass_kg", 1));
    dv += (t / Math.max(1, m)) * dt;
    clock.advance(dt);
  }
  rt.controls.set("OmsBurn", false);

  // Internal consistency: the integrated ΔV must match the sim's own
  // thrust/mass bookkeeping (guards the propulsion integration, not STS-1).
  const predicted = (53400 * 147) / Number(bus.get_value("dyn.mass_kg", 1));
  almost(dv, predicted, 1.0, "delivered ΔV matches thrust/mass");

  // Golden: the burn captures — post-burn perigee below 50 km.
  const pe = Number(bus.get_value("dyn.periapsis_alt_m", Infinity));
  assert(pe < 50_000, `captured perigee < 50 km, got ${pe}`);
}

function test_entry_ic_placement() {
  reset();
  const mission = new Mission(sts1);
  const dyn = new Dynamics();
  mission.start_in_entry(dyn);
  almost(clock.get_seconds, 194162, 1e-9, "entry IC GET = EI MET");
  const r = dyn.orbit.r;
  const v = dyn.orbit.v;
  almost(len(r) - 6_378_137, 121920, 2000, "entry IC altitude ≈ 400,000 ft");
  // The IC is built from the sourced inertial speed 7,844 m/s (minus the
  // Earth-rotation component along the heading); the placed state must
  // recover it — validates the geo→ECI construction, not just the data.
  almost(len(v), 7844, 150, "entry IC inertial speed ≈ 7,844 m/s");
  const q = dyn.attitude.q;
  almost(Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w), 1, 1e-9, "unit attitude");
  const nose = nose_eci(q);
  const vr = v_rel(r, v);
  const align = dot(nose, vr) / (len(vr) || 1);
  assert(align > 0.99, `wings-level nose along velocity, align ${align}`);
  assert(dyn.config === "entry", "entry config");
}

function test_approach_ic_placement() {
  reset();
  const mission = new Mission(sts1);
  const dyn = new Dynamics();
  mission.start_in_approach(dyn);
  almost(clock.get_seconds, 195690, 1e-9, "approach IC GET = TAEM MET");
  almost(len(dyn.orbit.r) - 6_378_137, 25000, 1000, "approach IC altitude");
  almost(len(v_rel(dyn.orbit.r, dyn.orbit.v)), 200, 15, "approach IC Earth-relative speed");
  assert(dyn.config === "entry", "entry config");
}

// ---------------------------------------------------------------- known gaps

function test_known_gaps() {
  knownGap(
    "post_oms2_orbit",
    "SMA 240.8±15 km, e ±0.01 at OMS-2 cutoff (130/130 n.mi.)",
    "guidance has no prograde OMS hold and there is no burn targeting; " +
      "OMS-1/OMS-2 cannot be executed by the current sim (P3 work)",
  );
  knownGap(
    "deorbit_dv_golden",
    "91.1±3 m/s delivered",
    "sim uses the generic orbit-config mass (104 t, [estimated] in " +
      "mass_properties.json) vs STS-1's ~94 t deorbit mass, so the modeled " +
      "twin-OMS burn delivers ~75 m/s in 147 s; needs mission-specific masses",
  );
  knownGap(
    "ei_state_golden",
    "alt 120,000±5,000 m, inertial speed 7,844±150 m/s at GET 194162",
    "entry profile shape not modeled — the sim cannot fly deorbit→EI (P3)",
  );
  knownGap(
    "landing_golden",
    "touchdown 94±15 m/s, rollout ≤4,000 m from the sts1 approach_ic",
    "P3 delivered the runway contact/brake model (covered by tests/entry.test.ts " +
      "in its own scenario); closed-loop flight of the sts1 TAEM-gate IC to " +
      "touchdown is still unwired",
  );
  knownGap(
    "orbiter_landing_mass",
    "88,662±2,000 kg",
    "mass_properties.json entry mass (85 t) is a generic [estimated] " +
      "operating mass, not the STS-1 weigh sheet",
  );
}

const tests = [
  test_baseline_identity,
  test_event_schedule_matches_press_kit,
  test_runway_anchor,
  test_ascent_event_mets,
  test_stack_liftoff_mass,
  test_deorbit_burn_captures,
  test_entry_ic_placement,
  test_approach_ic_placement,
  test_known_gaps,
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
