import { Attitude } from "../src/dynamics/attitude.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, tol: number, msg: string) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg}: ${a} vs ${b}`);
}

function mom(att: Attitude) {
  const I = att.inertia;
  const w = att.omega;
  return { x: I.x * w.x, y: I.y * w.y, z: I.z * w.z };
}

function test_principal_spin_is_exact() {
  const att = new Attitude();
  att.omega = { x: 0.01, y: 0, z: 0 };
  const dt = 0.5;
  att.step(dt, { x: 0, y: 0, z: 0 });
  almost(att.omega.x, 0.01, 1e-15, "wx");
  almost(att.omega.y, 0, 1e-15, "wy");
  almost(att.omega.z, 0, 1e-15, "wz");
  const half = 0.01 * dt * 0.5;
  almost(att.q.x, Math.sin(half), 1e-12, "qx");
  almost(att.q.w, Math.cos(half), 1e-12, "qw");
  almost(att.q.y, 0, 1e-15, "qy");
}

function test_torque_kick_matches_impulse() {
  const att = new Attitude();
  const tau = 2e4;
  const dt = 0.02;
  att.step(dt, { x: 0, y: tau, z: 0 });
  almost(att.omega.y, (tau * dt) / att.inertia.y, 1e-12, "pitch rate from a pure kick");
  almost(att.omega.x, 0, 1e-15, "no roll");
}

function test_coast_step_stays_on_the_sphere() {
  const att = new Attitude();
  att.omega = { x: 0.004, y: 0.012, z: -0.009 };
  const p0 = mom(att);
  const m0 = Math.hypot(p0.x, p0.y, p0.z);
  const e0 = 0.5 * (p0.x * att.omega.x + p0.y * att.omega.y + p0.z * att.omega.z);
  const zero = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 1800; i++) att.step(1, zero);
  const p = mom(att);
  const m = Math.hypot(p.x, p.y, p.z);
  const e = 0.5 * (p.x * att.omega.x + p.y * att.omega.y + p.z * att.omega.z);
  almost(m, m0, m0 * 1e-12, "|π| over a 30 min coast at 1 s");
  almost(e, e0, e0 * 1e-4, "energy stays bounded");
  almost(Math.hypot(att.q.x, att.q.y, att.q.z, att.q.w), 1, 1e-12, "quaternion");
}

const tests = [test_principal_spin_is_exact, test_torque_kick_matches_impulse, test_coast_step_stays_on_the_sphere];

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
