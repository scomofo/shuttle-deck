/**
 * Shuttle entry aero. Same publication contract as Gemini aero.gd
 * (q_dyn, heating proxy, blackout, alpha) with orbiter coefficients.
 * Coefficients are [estimated] pending a sourced Mach table.
 */

import { add, cross, dot, len, mul, norm, sub, type Vec3, EARTH_ROTATION_RATE } from "../core/frames.ts";

export function v_rel(r: Vec3, v: Vec3): Vec3 {
  const w = { x: 0, y: 0, z: EARTH_ROTATION_RATE };
  return sub(v, cross(w, r));
}

export function density(alt_m: number): number {
  if (alt_m > 120_000) return 0;
  if (alt_m < 0) return 1.225;
  return 1.225 * Math.exp(-alt_m / 7500);
}

export type AeroSample = {
  a_eci: Vec3;
  torque_body: Vec3;
  q_dyn: number;
  heating: number;
  rho: number;
  alpha_deg: number;
  lift_to_drag: number;
};

export class Aero {
  /** Reference area, m². Orbiter planform [estimated]. */
  S = 250;
  atmosphere_top_m = 120_000;
  blackout_heating = 1.2e4;
  plasma_heating = 8e3;

  accelerations(r: Vec3, v: Vec3, mass: number, nose_eci: Vec3, bank_rad: number): AeroSample {
    const vr = v_rel(r, v);
    const spd = len(vr);
    const alt = len(r) - 6_378_137;
    const rho = density(alt);
    const q = 0.5 * rho * spd * spd;
    if (spd < 1 || rho <= 0) {
      return {
        a_eci: { x: 0, y: 0, z: 0 },
        torque_body: { x: 0, y: 0, z: 0 },
        q_dyn: q,
        heating: 0,
        rho,
        alpha_deg: 0,
        lift_to_drag: 0,
      };
    }
    const vhat = norm(vr);
    const mach = spd / 300;
    const ld = mach > 5 ? 1.1 : mach > 2 ? 1.4 : 0.9;
    const cds = mach > 5 ? 70 : mach > 1 ? 34 : 18;
    const drag = q * cds;
    const lift = drag * ld;
    const rhat = norm(r);
    let up = sub(rhat, mul(vhat, dot(rhat, vhat)));
    if (len(up) < 1e-6) up = { x: 0, y: 0, z: 1 };
    else up = norm(up);
    const side = norm(cross(vhat, up));
    const lift_dir = add(mul(up, Math.cos(bank_rad)), mul(side, Math.sin(bank_rad)));
    const f = add(mul(vhat, -drag), mul(lift_dir, lift));
    const heating = Math.sqrt(Math.max(rho, 0)) * spd * spd * spd * 1e-9;
    const alpha = Math.acos(Math.min(1, Math.max(-1, dot(norm(nose_eci), vhat))));
    return {
      a_eci: mul(f, 1 / mass),
      torque_body: { x: 0, y: 0, z: 0 },
      q_dyn: q,
      heating,
      rho,
      alpha_deg: (alpha * 180) / Math.PI,
      lift_to_drag: ld,
    };
  }
}
