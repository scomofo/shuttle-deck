/**
 * P3 entry/landing integration: effector limits, aerodynamic moments with
 * rigid-body response, gear drag, runway contact, braking/steering/rollout,
 * flight-director outputs, and the guidance-never-steers-state rule.
 */

import { bus } from "../src/core/bus.ts";
import { Dynamics } from "../src/dynamics/dynamics.ts";
import { Guidance } from "../src/systems/guidance.ts";
import { Mechanisms } from "../src/systems/mechanisms.ts";
import { v_rel } from "../src/dynamics/aero.ts";
import { qmul, type Quat } from "../src/dynamics/attitude.ts";
import { len, norm, cross, EARTH_ROTATION_RATE } from "../src/core/frames.ts";

const RE = 6_378_137;
const D2R = Math.PI / 180;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function num(ch: string): number {
  return Number(bus.get_value(ch, NaN));
}

/** Wings-level quaternion: nose along Earth-relative velocity. */
function levelQuat(r: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }): Quat {
  const vr = v_rel(r, v);
  const xb = norm(vr);
  const up = norm(r);
  const yb = norm(cross(xb, up));
  const zb = cross(xb, yb);
  // rotation matrix columns -> quaternion
  const r00 = xb.x, r10 = xb.y, r20 = xb.z;
  const r01 = yb.x, r11 = yb.y, r21 = yb.z;
  const r02 = zb.x, r12 = zb.y, r22 = zb.z;
  const tr = r00 + r11 + r22;
  let x = 0, y = 0, z = 0, w = 1;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = s / 4; x = (r21 - r12) / s; y = (r02 - r20) / s; z = (r10 - r01) / s;
  } else if (r00 > r11 && r00 > r22) {
    const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
    x = s / 4; y = (r01 + r10) / s; z = (r02 + r20) / s; w = (r21 - r12) / s;
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    y = s / 4; x = (r01 + r10) / s; z = (r12 + r21) / s; w = (r02 - r20) / s;
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    z = s / 4; x = (r02 + r20) / s; y = (r12 + r21) / s; w = (r10 - r01) / s;
  }
  return { x, y, z, w };
}

/** Roll a quaternion about the body x (nose) axis (postmultiply = body frame). */
function rollQuat(q: Quat, deg: number): Quat {
  const h = (deg * D2R) / 2;
  return qmul(q, { x: Math.sin(h), y: 0, z: 0, w: Math.cos(h) });
}

function makeRig(alt_m: number, speed_mps: number, fpa_deg: number, bank_deg = 0) {
  bus.reset_values_only();
  const dyn = new Dynamics();
  const g = new Guidance();
  const r = { x: RE + alt_m, y: 0, z: 0 };
  const fpa = fpa_deg * D2R;
  // Local frame: up = +x, east = +y. Earth-relative velocity eastward with
  // flight-path angle (negative fpa = descending), plus Earth corotation so
  // the ECI state actually flies east.
  const v = {
    x: speed_mps * Math.sin(fpa),
    y: speed_mps * Math.cos(fpa) + EARTH_ROTATION_RATE * (RE + alt_m),
    z: 0,
  };
  dyn.set_state_eci(r, v, rollQuat(levelQuat(r, v), bank_deg));
  bus.set_value("seq.config", "entry");
  bus.set_value("mission.phase", "entry");
  dyn.publish();
  g.tick(0);
  return { dyn, g };
}

function step(g: Guidance, dyn: Dynamics, dt: number, n: number) {
  for (let i = 0; i < n; i++) {
    g.tick(dt);
    dyn.tick(dt);
  }
}

function test_effector_rate_and_position_limits() {
  const { dyn } = makeRig(60_000, 5000, -2);
  bus.set_value("guid.eff.elevon_l_cmd", 25);
  dyn.tick(0.02);
  const e1 = dyn.eff.elevon_l_deg;
  assert(e1 > 0.2 && e1 < 0.8, `rate limit ~20 deg/s, got ${e1} deg in 20 ms`);
  for (let i = 0; i < 200; i++) dyn.tick(0.02); // 4 s, commands held on the bus
  assert(Math.abs(dyn.eff.elevon_l_deg - 25) < 0.5, `reaches command, got ${dyn.eff.elevon_l_deg}`);
  bus.set_value("guid.eff.elevon_l_cmd", 100);
  dyn.tick(0.02);
  assert(dyn.eff.elevon_l_deg <= 25, `position limit, got ${dyn.eff.elevon_l_deg}`);
  bus.set_value("guid.eff.speedbrake_cmd", -5);
  dyn.tick(0.02);
  assert(dyn.eff.speedbrake_deg >= 0, `speedbrake min 0, got ${dyn.eff.speedbrake_deg}`);
}

function test_bank_law_rolls_through_effectors() {
  const { dyn, g } = makeRig(60_000, 5000, -2, 20);
  g.bank_deg = 0; // crew commands wings-level
  step(g, dyn, 0.02, 5);
  const b0 = Math.abs(num("aero.bank_deg"));
  assert(b0 > 10, `starts banked, got ${b0}`);
  step(g, dyn, 0.02, 1500); // 30 s
  const b1 = Math.abs(num("aero.bank_deg"));
  assert(b1 < 8, `bank law rolls wings-level through differential elevon, got ${b1} (was ${b0})`);
  // Effector commands stayed inside limits the whole way.
  for (const ch of ["guid.eff.elevon_l_cmd", "guid.eff.elevon_r_cmd"]) {
    assert(Math.abs(num(ch)) <= 25, `${ch} within limits`);
  }
}

function test_alpha_tracks_schedule() {
  const { dyn, g } = makeRig(70_000, 7000, -1.5, 0);
  step(g, dyn, 0.02, 3000); // 60 s
  const alpha = num("aero.alpha_deg");
  const cmd = num("guid.alpha_cmd_deg");
  assert(alpha > 25 && alpha < 55, `alpha tracks the ~40 deg schedule, got ${alpha}`);
  assert(cmd > 35 && cmd < 45, `alpha command from schedule, got ${cmd}`);
  assert(num("aero.q_dyn_pa") > 0, "dynamic pressure present");
}

function test_touchdown_rollout_and_wheel_stop() {
  bus.reset_values_only();
  const dyn = new Dynamics();
  const g = new Guidance();
  const mechanisms = new Mechanisms();
  bus.set_value("ctl.gear_arm", true);
  mechanisms.tick(0.02);
  bus.set_value("ctl.gear_arm", false);
  // Start on the approach energy line: alt = 28 * (v - 95).
  const v0 = 200;
  const alt0 = 28 * (v0 - 95);
  const r = { x: RE + alt0, y: 0, z: 0 };
  const fpa = -6 * D2R;
  const v = {
    x: v0 * Math.sin(fpa),
    y: v0 * Math.cos(fpa) + EARTH_ROTATION_RATE * (RE + alt0),
    z: 0,
  };
  dyn.set_state_eci(r, v, levelQuat(r, v));
  bus.set_value("seq.config", "entry");
  bus.set_value("mission.phase", "approach");
  bus.set_value("ctl.dap.mode", "manual");
  // This trainer's estimated transit takes eight seconds. Keep the gear
  // up on the outer glide, then allow that transit before runway contact.
  bus.set_value("ctl.gear", false);
  dyn.publish();
  g.tick(0);

  const dt = 0.02;
  let touchdown_speed = -1;
  let rollout_m = 0;
  let steps = 0;
  // Fly to touchdown.
  while (!dyn.landed && steps < 15000) {
    if (Number(bus.get_value("dyn.alt_m", 1e9)) < 500) bus.set_value("ctl.gear", true);
    g.tick(dt);
    mechanisms.tick(dt);
    dyn.tick(dt);
    steps++;
  }
  assert(dyn.landed, "touchdown latches dyn.landed");
  touchdown_speed = len(v_rel(dyn.orbit.r, dyn.orbit.v)); // Earth-relative, not inertial
  assert(
    touchdown_speed > 79 && touchdown_speed < 109,
    `touchdown speed 94±15 m/s, got ${touchdown_speed}`,
  );
  assert(dyn.gear_down === true, "gear state on the bus");
  g.tick(dt); // let guidance see weight-on-wheels
  assert(num("guid.brake_cmd") === 1, "full brake command after weight on wheels");
  // Roll out to wheel stop. Measure Earth-relative ground distance (the
  // inertial position includes Earth corotation).
  steps = 0;
  while (!dyn.stopped && steps < 15000) {
    g.tick(dt);
    dyn.tick(dt);
    const vr = v_rel(dyn.orbit.r, dyn.orbit.v);
    rollout_m += len(vr) * dt;
    steps++;
  }
  assert(dyn.stopped, "wheel stop reached");
  assert(rollout_m <= 4000, `rollout within 4000 m, got ${rollout_m}`);
  assert(rollout_m > 50, `rollout actually rolled, got ${rollout_m}`);
  assert(num("dyn.alt_m") >= -1, "never sinks through the runway");
}

function test_fd_outputs_published() {
  const { dyn, g } = makeRig(3000, 170, -4, 0);
  bus.set_value("mission.phase", "approach");
  step(g, dyn, 0.02, 50);
  for (const ch of ["guid.fd.bank_deg", "guid.fd.pitch_deg", "guid.fd.alt_err_m", "guid.alpha_cmd_deg"]) {
    const v = num(ch);
    assert(Number.isFinite(v), `${ch} published, got ${v}`);
  }
  assert(Math.abs(num("guid.fd.bank_deg")) <= 70, "fd bank within limits");
  // Effector commands are all inside their position limits.
  const lim: Array<[string, number, number]> = [
    ["guid.eff.elevon_l_cmd", -25, 25],
    ["guid.eff.elevon_r_cmd", -25, 25],
    ["guid.eff.rudder_cmd", -27, 27],
    ["guid.eff.speedbrake_cmd", 0, 90],
    ["guid.eff.bodyflap_cmd", -20, 15],
  ];
  for (const [ch, lo, hi] of lim) {
    const v = num(ch);
    assert(v >= lo && v <= hi, `${ch}=${v} within [${lo}, ${hi}]`);
  }
}

function test_guidance_writes_no_vehicle_state() {
  const { g } = makeRig(60_000, 5000, -2, 0);
  const before = {
    r: bus.get_value("dyn.r_eci_m"),
    v: bus.get_value("dyn.v_eci_mps"),
    q: bus.get_value("dyn.q_body_from_eci"),
    alt: bus.get_value("dyn.alt_m"),
  };
  for (let i = 0; i < 20; i++) g.tick(0.02);
  const after = {
    r: bus.get_value("dyn.r_eci_m"),
    v: bus.get_value("dyn.v_eci_mps"),
    q: bus.get_value("dyn.q_body_from_eci"),
    alt: bus.get_value("dyn.alt_m"),
  };
  assert(JSON.stringify(before) === JSON.stringify(after), "guidance never writes dyn.* state");
  // ...but it does command effectors and publish flight-director targets.
  assert(Number.isFinite(num("guid.eff.elevon_l_cmd")), "effector commands published");
  assert(Number.isFinite(num("guid.fd.pitch_deg")), "flight-director pitch published");
}

const tests = [
  test_effector_rate_and_position_limits,
  test_bank_law_rolls_through_effectors,
  test_alpha_tracks_schedule,
  test_touchdown_rollout_and_wheel_stop,
  test_fd_outputs_published,
  test_guidance_writes_no_vehicle_state,
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
