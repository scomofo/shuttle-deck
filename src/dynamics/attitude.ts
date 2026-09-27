/**
 * Body-rate integrator. Quaternion is q_body_from_eci (Gemini convention).
 * Free rotation is a Lie–Poisson splitting; it is not forward Euler.
 */

import { add, mul, type Vec3, v3 } from "../core/frames.ts";

export type Quat = { x: number; y: number; z: number; w: number };

/** Orbiter principal inertia, kg·m². Single owner: Attitude and Guidance share it. [estimated] */
export const ORBITER_INERTIA = { x: 1.07e6, y: 7.9e6, z: 8.2e6 };

export function qid(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function qnorm(q: Quat): Quat {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

/**
 * Rotate an ECI vector into body. Convention (matches nose_eci and the
 * left-multiplied body rotors in Attitude.step): v_eci = q v_body q*,
 * so the ECI->body direction is the conjugate rotation.
 */
export function body_from_eci(q: Quat, v: Vec3): Vec3 {
  return rotate_vec(qconj(q), v);
}

/** Rotate a body vector into ECI (inverse of body_from_eci). */
export function eci_from_body(q: Quat, v: Vec3): Vec3 {
  return rotate_vec(q, v);
}

/** Active rotation of v by the unit quaternion q: q v q*. */
function rotate_vec(q: Quat, v: Vec3): Vec3 {
  const qv = { x: q.x, y: q.y, z: q.z };
  const t = mul(cross3(qv, v), 2);
  return add(v, add(mul(t, q.w), cross3(qv, t)));
}

/** Body +X expressed in ECI. Matches Dynamics nose column. */
export function nose_eci(q: Quat): Vec3 {
  return {
    x: 1 - 2 * (q.y * q.y + q.z * q.z),
    y: 2 * (q.x * q.y + q.w * q.z),
    z: 2 * (q.x * q.z - q.w * q.y),
  };
}

/** Shortest quaternion that takes body +X onto `dir_eci`. */
export function q_body_x_along(dir_eci: Vec3): Quat {
  const d = { x: dir_eci.x, y: dir_eci.y, z: dir_eci.z };
  const n = Math.hypot(d.x, d.y, d.z) || 1;
  d.x /= n;
  d.y /= n;
  d.z /= n;
  const from = { x: 1, y: 0, z: 0 };
  const axis = cross3(from, d);
  const w = 1 + from.x * d.x + from.y * d.y + from.z * d.z;
  if (w < 1e-8 && Math.hypot(axis.x, axis.y, axis.z) < 1e-8) {
    return { x: 0, y: 1, z: 0, w: 0 };
  }
  return qnorm({ x: axis.x, y: axis.y, z: axis.z, w });
}

export function qconj(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export function qmul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

type Axis = "x" | "y" | "z";

function rotor(axis: Axis, theta: number): Quat {
  const h = theta / 2;
  const s = Math.sin(h);
  const w = Math.cos(h);
  if (axis === "x") return { x: s, y: 0, z: 0, w };
  if (axis === "y") return { x: 0, y: s, z: 0, w };
  return { x: 0, y: 0, z: s, w };
}

/** Exact flow of one principal-axis piece of the rigid-body Hamiltonian. */
function spinAbout(pi: Vec3, axis: Axis, theta: number): Vec3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  if (axis === "x") return { x: pi.x, y: c * pi.y + s * pi.z, z: -s * pi.y + c * pi.z };
  if (axis === "y") return { x: c * pi.x - s * pi.z, y: pi.y, z: s * pi.x + c * pi.z };
  return { x: c * pi.x + s * pi.y, y: -s * pi.x + c * pi.y, z: pi.z };
}

export class Attitude {
  q: Quat = qid();
  omega: Vec3 = v3();
  inertia: Vec3 = { ...ORBITER_INERTIA };

  /**
   * Lie–Poisson step for a diagonal inertia. The free rotation is a Strang
   * splitting, so |π| does not leave the sphere. Torque is a kick around it.
   * Convention: v_eci = q v_body q* (see nose_eci), so body rates integrate
   * as q-dot = 1/2 q ω_body: each principal-axis rotor postmultiplies, which
   * applies the rotation in the body frame. (Premultiplying here would
   * integrate ECI-frame rates instead — the aerodynamic moments would then
   * act about the wrong axes.)
   */
  step(dt: number, torque_body: Vec3): void {
    const I = this.inertia;
    const half = {
      x: torque_body.x * dt * 0.5,
      y: torque_body.y * dt * 0.5,
      z: torque_body.z * dt * 0.5,
    };
    let pi: Vec3 = {
      x: I.x * this.omega.x + half.x,
      y: I.y * this.omega.y + half.y,
      z: I.z * this.omega.z + half.z,
    };
    const parts: Array<[Axis, number]> = [
      ["x", dt * 0.5],
      ["y", dt * 0.5],
      ["z", dt],
      ["y", dt * 0.5],
      ["x", dt * 0.5],
    ];
    let q = this.q;
    for (const [axis, h] of parts) {
      const w = axis === "x" ? pi.x / I.x : axis === "y" ? pi.y / I.y : pi.z / I.z;
      const theta = w * h;
      pi = spinAbout(pi, axis, theta);
      q = qmul(q, rotor(axis, theta));
    }
    pi = { x: pi.x + half.x, y: pi.y + half.y, z: pi.z + half.z };
    this.omega = { x: pi.x / I.x, y: pi.y / I.y, z: pi.z / I.z };
    this.q = qnorm(q);
  }
}
