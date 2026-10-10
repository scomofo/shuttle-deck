import { lerp_coeff, Aero, EFFECTOR_NEUTRAL } from "../src/dynamics/aero.ts";
import { q_body_x_along, qmul } from "../src/dynamics/attitude.ts";
import { v_rel } from "../src/dynamics/aero.ts";
import { density, sound_speed } from "../src/dynamics/atmosphere.ts";
import table from "../assets/data/spacecraft/aero.json" with { type: "json" };

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, tol: number, msg: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg}: ${a} vs ${b}`);
}

function test_reference_area_is_sourced_2690_ft2() {
  almost(table.reference_area_m2, 2690 * 0.09290304, 0.02, "S from 2690 ft2");
  assert(table.reference_area_ft2 === 2690, "ft2");
  assert(table.sources.length >= 3, "need sourced locators");
}

function test_atp_anchor_ld() {
  const row = table.table.find((r) => r.mach === 10 && r.alpha_deg === 34);
  assert(row, "missing ATP anchor row");
  almost(row.cl / row.cd, 1.3, 0.02, "ATP L/D 1.3 at Mach 10 / 34 deg");
  assert(row.tag === "sourced-anchor", row.tag);
}

function test_lerp_between_mach() {
  const c = lerp_coeff(10, 34, table.table);
  almost(c.cl / c.cd, 1.3, 0.02, "lookup hits the anchor");
}

function test_aero_publishes_sample_shape() {
  const aero = new Aero();
  const r = { x: 6_378_137 + 80_000, y: 0, z: 0 };
  const v = { x: 0, y: 7000, z: 0 };
  const q = q_body_x_along(v_rel(r, v));
  const s = aero.accelerations(r, v, 85_000, q, { x: 0, y: 0, z: 0 }, EFFECTOR_NEUTRAL, false);
  assert(s.q_dyn > 0, `q ${s.q_dyn}`);
  assert(s.lift_to_drag > 0, `L/D ${s.lift_to_drag}`);
  almost(s.alpha_deg, 0, 2, `nose into wind, alpha ${s.alpha_deg}`);
  almost(s.beta_deg, 0, 2, `beta ${s.beta_deg}`);
  assert(s.mach > 15 && s.mach < 30, `mach ${s.mach}`);
}

function test_hypersonic_low_alpha_drag_and_lift() {
  const aero = new Aero();
  const r = { x: 6_378_137 + 70_000, y: 0, z: 0 };
  const v = { x: 0, y: 7500, z: 0 }; // ~Mach 25
  const q = q_body_x_along(v_rel(r, v)); // alpha = 0
  const s = aero.accelerations(r, v, 85_000, q, { x: 0, y: 0, z: 0 }, EFFECTOR_NEUTRAL, false);
  assert(s.cd <= 0.09, `Mach 25 low-alpha drag coefficient should be low C_D0, got ${s.cd}`);
  assert(s.cl <= 0.05, `Mach 25 low-alpha lift coefficient should be low C_L0, got ${s.cl}`);
}

function test_3d_force_directions_bank_and_sideslip() {
  const aero = new Aero();
  const r = { x: 6_378_137 + 60_000, y: 0, z: 0 }; // radial along +x
  const v = { x: 0, y: 5000, z: 0 }; // velocity along +y
  const q_base = q_body_x_along(v_rel(r, v));

  // Pitch up 34 deg for entry L/D.
  const h_pitch = (17 * Math.PI) / 180;
  const q_pitch = qmul(q_base, { x: 0, y: Math.sin(h_pitch), z: 0, w: Math.cos(h_pitch) });

  // 1) Wings level: lift points radially outward (+x)
  const s_level = aero.accelerations(r, v, 85_000, q_pitch, { x: 0, y: 0, z: 0 }, EFFECTOR_NEUTRAL, false);
  assert(s_level.a_eci.x > 0, `wings level lift accelerates outward (+x), got ${s_level.a_eci.x}`);

  // 2) Banked 90 deg right: lift accelerates laterally (+z)
  const h_roll = (45 * Math.PI) / 180;
  const q_bank90 = qmul(q_pitch, { x: Math.sin(h_roll), y: 0, z: 0, w: Math.cos(h_roll) });
  const s_bank90 = aero.accelerations(r, v, 85_000, q_bank90, { x: 0, y: 0, z: 0 }, EFFECTOR_NEUTRAL, false);
  assert(Math.abs(s_bank90.a_eci.z) > 1.0, `90 deg bank generates lateral acceleration, got ${s_bank90.a_eci.z}`);

  // 3) Yaw / sideslip generates side force
  const h_yaw = (2.5 * Math.PI) / 180;
  const q_beta = qmul(q_pitch, { x: 0, y: 0, z: Math.sin(h_yaw), w: Math.cos(h_yaw) });
  const s_beta = aero.accelerations(r, v, 85_000, q_beta, { x: 0, y: 0, z: 0 }, EFFECTOR_NEUTRAL, false);
  assert(Math.abs(s_beta.beta_deg) > 1.5, `measured beta present: ${s_beta.beta_deg}`);
  assert(Math.abs(s_beta.a_eci.z) > 0.01, `sideslip generates side acceleration, got ${s_beta.a_eci.z}`);
}

function test_standard_atmosphere() {
  almost(density(0), 1.225, 0.005, "sea-level density");
  almost(sound_speed(0), 340.3, 0.5, "sea-level sound speed");
  almost(sound_speed(11_000), 295.1, 0.5, "tropopause sound speed");
  almost(sound_speed(20_000), 295.1, 0.5, "stratosphere sound speed");
  assert(sound_speed(0) > sound_speed(11_000), "sound speed follows temperature");
  assert(density(90_000) < 0.001 * density(0), "thin at 90 km");
  assert(density(130_000) === 0, "no atmosphere above the model top");
}

function test_elevon_pitch_sign() {
  const aero = new Aero();
  const r = { x: 6_378_137 + 80_000, y: 0, z: 0 };
  const v = { x: 0, y: 7000, z: 0 };
  const q = q_body_x_along(v_rel(r, v));
  const w = { x: 0, y: 0, z: 0 };
  const base = aero.accelerations(r, v, 85_000, q, w, EFFECTOR_NEUTRAL, false);
  const down = aero.accelerations(
    r, v, 85_000, q, w,
    { ...EFFECTOR_NEUTRAL, elevon_l_deg: 20, elevon_r_deg: 20 },
    false,
  );
  assert(down.torque_body.y < base.torque_body.y, "elevon TE-down pitches nose down");
}

function test_differential_elevon_rolls() {
  const aero = new Aero();
  const r = { x: 6_378_137 + 80_000, y: 0, z: 0 };
  const v = { x: 0, y: 7000, z: 0 };
  const q = q_body_x_along(v_rel(r, v));
  const w = { x: 0, y: 0, z: 0 };
  const s = aero.accelerations(
    r, v, 85_000, q, w,
    { ...EFFECTOR_NEUTRAL, elevon_l_deg: 10, elevon_r_deg: -10 },
    false,
  );
  assert(s.torque_body.x > 0, `left TE-down rolls right, got ${s.torque_body.x}`);
}

function test_rudder_yaws() {
  const aero = new Aero();
  const r = { x: 6_378_137 + 80_000, y: 0, z: 0 };
  const v = { x: 0, y: 7000, z: 0 };
  const q = q_body_x_along(v_rel(r, v));
  const w = { x: 0, y: 0, z: 0 };
  const s = aero.accelerations(r, v, 85_000, q, w, { ...EFFECTOR_NEUTRAL, rudder_deg: 10 }, false);
  assert(s.torque_body.z > 0, `rudder TE-right yaws nose right, got ${s.torque_body.z}`);
}

function test_gear_and_speedbrake_add_drag() {
  const aero = new Aero();
  const r = { x: 6_378_137 + 3_000, y: 0, z: 0 };
  const v = { x: 0, y: 150, z: 0 };
  const q = q_body_x_along(v_rel(r, v));
  const w = { x: 0, y: 0, z: 0 };
  const clean = aero.accelerations(r, v, 85_000, q, w, EFFECTOR_NEUTRAL, false);
  const gear = aero.accelerations(r, v, 85_000, q, w, EFFECTOR_NEUTRAL, true);
  assert(gear.cd > clean.cd + 0.03, `gear drag increment, ${clean.cd} -> ${gear.cd}`);
  const sb = aero.accelerations(r, v, 85_000, q, w, { ...EFFECTOR_NEUTRAL, speedbrake_deg: 60 }, false);
  assert(sb.cd > clean.cd + 0.05, `speedbrake drag, ${clean.cd} -> ${sb.cd}`);
}

function test_heating_and_blackout_band() {
  const aero = new Aero();
  const w = { x: 0, y: 0, z: 0 };
  const hot = (() => {
    const r = { x: 6_378_137 + 70_000, y: 0, z: 0 };
    const v = { x: 0, y: 7400, z: 0 };
    return aero.accelerations(r, v, 85_000, q_body_x_along(v_rel(r, v)), w, EFFECTOR_NEUTRAL, false);
  })();
  assert(hot.heating > 1e5 && hot.heating < 5e6, `heat flux W/m^2: ${hot.heating}`);
  assert(hot.blackout === true, "blackout inside the ionization band");
  assert(hot.plasma > 0, "plasma display scale nonzero");
  const thin = (() => {
    const r = { x: 6_378_137 + 120_000, y: 0, z: 0 };
    const v = { x: 0, y: 7500, z: 0 };
    return aero.accelerations(r, v, 85_000, q_body_x_along(v_rel(r, v)), w, EFFECTOR_NEUTRAL, false);
  })();
  assert(thin.blackout === false, "no blackout above the atmosphere");
  const slow = (() => {
    const r = { x: 6_378_137 + 10_000, y: 0, z: 0 };
    const v = { x: 0, y: 200, z: 0 };
    return aero.accelerations(r, v, 85_000, q_body_x_along(v_rel(r, v)), w, EFFECTOR_NEUTRAL, false);
  })();
  assert(slow.blackout === false, "no blackout at low speed");
}

const tests = [
  test_reference_area_is_sourced_2690_ft2,
  test_atp_anchor_ld,
  test_lerp_between_mach,
  test_aero_publishes_sample_shape,
  test_hypersonic_low_alpha_drag_and_lift,
  test_3d_force_directions_bank_and_sideslip,
  test_standard_atmosphere,
  test_elevon_pitch_sign,
  test_differential_elevon_rolls,
  test_rudder_yaws,
  test_gear_and_speedbrake_add_drag,
  test_heating_and_blackout_band,
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
