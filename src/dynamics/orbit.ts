/**
 * Two-body + optional J2 RK4 propagator. Port of gemini-capsule
 * src/dynamics/orbit.gd — same state, same constants, same step contract.
 */

import { add, dot, len, mul, type Vec3, v3, J2, MU, RE } from "../core/frames.ts";

export class Orbit {
  r: Vec3 = v3();
  v: Vec3 = v3();
  use_j2 = true;

  altitude(): number {
    return len(this.r) - RE;
  }

  set_circular(alt_m: number, incl_rad = 0.4936, raan = 0): void {
    const r = RE + alt_m;
    const c = Math.cos(incl_rad);
    const s = Math.sin(incl_rad);
    this.r = { x: r * Math.cos(raan), y: r * Math.sin(raan) * c, z: r * Math.sin(raan) * s };
    const vc = Math.sqrt(MU / r);
    this.v = { x: -vc * Math.sin(raan), y: vc * Math.cos(raan) * c, z: vc * Math.cos(raan) * s };
  }

  gravity(r: Vec3): Vec3 {
    const r2 = dot(r, r);
    const r1 = Math.sqrt(r2);
    let a = mul(r, -MU / (r2 * r1));
    if (!this.use_j2) return a;
    const z2 = r.z * r.z;
    const k = (1.5 * J2 * MU * RE * RE) / (r2 * r2 * r1);
    const f = 5 * (z2 / r2) - 1;
    a = add(a, {
      x: k * r.x * f,
      y: k * r.y * f,
      z: k * r.z * (f - 2),
    });
    return a;
  }

  /** RK4 with optional extra acceleration in ECI (thrust + aero). */
  step(dt: number, a_extra: Vec3 = v3()): void {
    const acc = (r: Vec3) => add(this.gravity(r), a_extra);
    const r0 = this.r;
    const v0 = this.v;
    const k1v = acc(r0);
    const k1r = v0;
    const k2v = acc(add(r0, mul(k1r, dt / 2)));
    const k2r = add(v0, mul(k1v, dt / 2));
    const k3v = acc(add(r0, mul(k2r, dt / 2)));
    const k3r = add(v0, mul(k2v, dt / 2));
    const k4v = acc(add(r0, mul(k3r, dt)));
    const k4r = add(v0, mul(k3v, dt));
    this.r = add(r0, mul(add(add(k1r, mul(k2r, 2)), add(mul(k3r, 2), k4r)), dt / 6));
    this.v = add(v0, mul(add(add(k1v, mul(k2v, 2)), add(mul(k3v, 2), k4v)), dt / 6));
  }
}
