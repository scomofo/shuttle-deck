/**
 * Body-rate integrator. Quaternion is q_body_from_eci (Gemini convention).
 */

import { add, mul, type Vec3, v3 } from "../core/frames.ts";

export type Quat = { x: number; y: number; z: number; w: number };

export function qid(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function qnorm(q: Quat): Quat {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

/** Rotate an ECI vector into body. */
export function body_from_eci(q: Quat, v: Vec3): Vec3 {
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

function cross3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

export class Attitude {
  q: Quat = qid();
  omega: Vec3 = v3();
  inertia: Vec3 = { x: 1.07e6, y: 7.9e6, z: 8.2e6 };

  step(dt: number, torque_body: Vec3): void {
    const I = this.inertia;
    const w = this.omega;
    const alpha = {
      x: (torque_body.x - (I.z - I.y) * w.y * w.z) / I.x,
      y: (torque_body.y - (I.x - I.z) * w.z * w.x) / I.y,
      z: (torque_body.z - (I.y - I.x) * w.x * w.y) / I.z,
    };
    this.omega = add(w, mul(alpha, dt));
    const oq = { x: this.omega.x, y: this.omega.y, z: this.omega.z, w: 0 };
    const q = this.q;
    const dq = {
      x: 0.5 * (oq.w * q.x + oq.x * q.w + oq.y * q.z - oq.z * q.y),
      y: 0.5 * (oq.w * q.y - oq.x * q.z + oq.y * q.w + oq.z * q.x),
      z: 0.5 * (oq.w * q.z + oq.x * q.y - oq.y * q.x + oq.z * q.w),
      w: 0.5 * (oq.w * q.w - oq.x * q.x - oq.y * q.y - oq.z * q.z),
    };
    this.q = qnorm({
      x: q.x + dq.x * dt,
      y: q.y + dq.y * dt,
      z: q.z + dq.z * dt,
      w: q.w + dq.w * dt,
    });
  }
}
