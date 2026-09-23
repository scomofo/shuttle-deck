import { lerp_coeff, Aero } from "../src/dynamics/aero.ts";
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
  const s = aero.accelerations(r, v, 85_000, { x: 0, y: 1, z: 0 }, 0);
  assert(s.q_dyn > 0, `q ${s.q_dyn}`);
  assert(s.lift_to_drag > 0, `L/D ${s.lift_to_drag}`);
}

const tests = [
  test_reference_area_is_sourced_2690_ft2,
  test_atp_anchor_ld,
  test_lerp_between_mach,
  test_aero_publishes_sample_shape,
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
