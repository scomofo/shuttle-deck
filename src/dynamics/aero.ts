/**
 * Shuttle entry aero. Same publication contract as Gemini aero.gd
 * (q_dyn, heating proxy, blackout, alpha) with orbiter coefficients.
 *
 * Geometry (S, b, MAC) is sourced. The Mach/alpha table is a schedule;
 * rows are tagged in assets/data/spacecraft/aero.json.
 */

import { add, cross, dot, len, mul, norm, sub, type Vec3, EARTH_ROTATION_RATE } from "../core/frames.ts";
import table from "../../assets/data/spacecraft/aero.json" with { type: "json" };

export function v_rel(r: Vec3, v: Vec3): Vec3 {
  const w = { x: 0, y: 0, z: EARTH_ROTATION_RATE };
  return sub(v, cross(w, r));
}

export function density(alt_m: number): number {
  if (alt_m > 120_000) return 0;
  if (alt_m < 0) return 1.225;
  return 1.225 * Math.exp(-alt_m / 7500);
}

export type AeroRow = { mach: number; alpha_deg: number; cl: number; cd: number; tag?: string };

export type AeroSample = {
  a_eci: Vec3;
  torque_body: Vec3;
  q_dyn: number;
  heating: number;
  rho: number;
  alpha_deg: number;
  lift_to_drag: number;
  cl: number;
  cd: number;
};

export function lerp_coeff(mach: number, alpha_deg: number, rows: AeroRow[]): { cl: number; cd: number } {
  if (!rows.length) return { cl: 0, cd: 0 };
  const machs = [...new Set(rows.map((r) => r.mach))].sort((a, b) => a - b);
  const lo_m = machs.reduce((acc, m) => (m <= mach ? m : acc), machs[0]);
  const hi_m = machs.find((m) => m >= mach) ?? machs[machs.length - 1];
  const slice = (m: number) => {
    const at = rows.filter((r) => r.mach === m).sort((a, b) => a.alpha_deg - b.alpha_deg);
    if (!at.length) return { cl: 0, cd: 0 };
    if (alpha_deg <= at[0].alpha_deg) return { cl: at[0].cl, cd: at[0].cd };
    for (let i = 1; i < at.length; i++) {
      if (alpha_deg <= at[i].alpha_deg) {
        const a = at[i - 1];
        const b = at[i];
        const f = (alpha_deg - a.alpha_deg) / (b.alpha_deg - a.alpha_deg || 1);
        return { cl: a.cl + (b.cl - a.cl) * f, cd: a.cd + (b.cd - a.cd) * f };
      }
    }
    const last = at[at.length - 1];
    return { cl: last.cl, cd: last.cd };
  };
  if (lo_m === hi_m) return slice(lo_m);
  const a = slice(lo_m);
  const b = slice(hi_m);
  const f = (mach - lo_m) / (hi_m - lo_m || 1);
  return { cl: a.cl + (b.cl - a.cl) * f, cd: a.cd + (b.cd - a.cd) * f };
}

export class Aero {
  S = table.reference_area_m2;
  atmosphere_top_m = table.atmosphere_top_m;
  blackout_heating = table.blackout_heating_proxy;
  plasma_heating = table.plasma_heating_proxy;
  rows = table.table as AeroRow[];

  accelerations(r: Vec3, v: Vec3, mass: number, nose_eci: Vec3, bank_rad: number): AeroSample {
    const vr = v_rel(r, v);
    const spd = len(vr);
    const alt = len(r) - 6_378_137;
    const rho = density(alt);
    const q = 0.5 * rho * spd * spd;
    const zero: AeroSample = {
      a_eci: { x: 0, y: 0, z: 0 },
      torque_body: { x: 0, y: 0, z: 0 },
      q_dyn: q,
      heating: 0,
      rho,
      alpha_deg: 0,
      lift_to_drag: 0,
      cl: 0,
      cd: 0,
    };
    if (spd < 1 || rho <= 0) return zero;
    const vhat = norm(vr);
    const mach = spd / 300;
    const alpha = Math.acos(Math.min(1, Math.max(-1, dot(norm(nose_eci), vhat))));
    const alpha_deg = (alpha * 180) / Math.PI;
    const { cl, cd } = lerp_coeff(mach, alpha_deg, this.rows);
    const drag = q * cd * this.S;
    const lift = q * cl * this.S;
    const rhat = norm(r);
    let up = sub(rhat, mul(vhat, dot(rhat, vhat)));
    if (len(up) < 1e-6) up = { x: 0, y: 0, z: 1 };
    else up = norm(up);
    const side = norm(cross(vhat, up));
    const lift_dir = add(mul(up, Math.cos(bank_rad)), mul(side, Math.sin(bank_rad)));
    const f = add(mul(vhat, -drag), mul(lift_dir, lift));
    const heating = Math.sqrt(Math.max(rho, 0)) * spd * spd * spd * 1e-9;
    return {
      a_eci: mul(f, 1 / mass),
      torque_body: { x: 0, y: 0, z: 0 },
      q_dyn: q,
      heating,
      rho,
      alpha_deg,
      lift_to_drag: cd > 1e-9 ? cl / cd : 0,
      cl,
      cd,
    };
  }
}
