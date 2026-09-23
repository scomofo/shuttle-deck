import { bus } from "../src/core/bus.ts";
import { clock } from "../src/core/clock.ts";
import { SimRuntime } from "../src/core/runtime.ts";
import { nose_eci, q_body_x_along } from "../src/dynamics/attitude.ts";
import { dot, len } from "../src/core/frames.ts";

function reset() {
  clock.reset(0);
  bus.reset();
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, tol: number, msg: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg}: ${a} vs ${b}`);
}

function test_q_points_body_x() {
  const dir = { x: 0, y: 1, z: 0 };
  const q = q_body_x_along(dir);
  const n = nose_eci(q);
  almost(n.x, 0, 1e-6, "nx");
  almost(n.y, 1, 1e-6, "ny");
  almost(n.z, 0, 1e-6, "nz");
}

function test_oms_retrograde_drops_periapsis() {
  reset();
  const rt = new SimRuntime();
  rt.start("orbit");
  const p0 = Number(bus.get_value("dyn.periapsis_alt_m", 0));
  assert(p0 > 230_000, `start periapsis ${p0}`);
  rt.controls.set("DapRetro", true);
  rt.controls.set("OmsBurn", true);
  clock.advance(220);
  const v = bus.get_value("dyn.v_eci_mps") as number[];
  const q = rt.dynamics.attitude.q;
  const nose = nose_eci(q);
  const align = dot(nose, { x: v[0], y: v[1], z: v[2] }) / (len({ x: v[0], y: v[1], z: v[2] }) || 1);
  assert(align < -0.9, `nose should be retrograde, align ${align}`);
  const p1 = Number(bus.get_value("dyn.periapsis_alt_m", 0));
  assert(p1 < 110_000, `periapsis after OMS ${p1} (was ${p0})`);
}

const tests = [test_q_points_body_x, test_oms_retrograde_drops_periapsis];

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
