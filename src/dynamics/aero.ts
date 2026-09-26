/**
 * Shuttle entry aero. Same publication contract as Gemini aero.gd
 * (q_dyn, heating proxy, blackout, alpha) with orbiter coefficients.
 *
 * Geometry (S, b, MAC) is sourced. The Mach/alpha force table is a
 * schedule; rows are tagged in assets/data/spacecraft/aero.json.
 * Pitch/yaw/roll moments use the moment table, sideslip derivatives and
 * rotary damping there, plus control-effector effectiveness. All moment
 * and effectiveness numbers are [estimated] order-of-magnitude values
 * shaped for plausible trim and response, not databook data.
 *
 * Body axes: x nose, y right wing, z down. Positive torque_y is nose-up,
 * positive torque_z is nose-right, positive torque_x is right-wing-down.
 * Deflection signs: elevon/bodyflap positive = trailing-edge down,
 * rudder positive = trailing-edge right (nose-right), speedbrake
 * positive = open.
 */

import { add, cross, dot, len, mul, norm, sub, type Vec3, EARTH_ROTATION_RATE } from "../core/frames.ts";
import { density as std_density, sound_speed } from "./atmosphere.ts";
import { body_from_eci, eci_from_body, type Quat } from "./attitude.ts";
import table from "../../assets/data/spacecraft/aero.json" with { type: "json" };

export function v_rel(r: Vec3, v: Vec3): Vec3 {
  const w = { x: 0, y: 0, z: EARTH_ROTATION_RATE };
  return sub(v, cross(w, r));
}

/** Standard-atmosphere density (re-export of the dynamics-boundary model). */
export function density(alt_m: number): number {
  return std_density(alt_m);
}

export type AeroRow = { mach: number; alpha_deg: number; cl: number; cd: number; tag?: string };
export type MomentRow = { mach: number; alpha_deg: number; cm: number; tag?: string };

export type EffectorDeflection = {
  elevon_l_deg: number;
  elevon_r_deg: number;
  rudder_deg: number;
  speedbrake_deg: number;
  bodyflap_deg: number;
};

export const EFFECTOR_NEUTRAL: EffectorDeflection = {
  elevon_l_deg: 0,
  elevon_r_deg: 0,
  rudder_deg: 0,
  speedbrake_deg: 0,
  bodyflap_deg: 0,
};

export type AeroSample = {
  a_eci: Vec3;
  torque_body: Vec3;
  q_dyn: number;
  /** Sutton-Graves stagnation heat-flux proxy, W/m^2. Not a thermal analysis. */
  heating: number;
  rho: number;
  mach: number;
  alpha_deg: number;
  beta_deg: number;
  bank_deg: number;
  lift_to_drag: number;
  cl: number;
  cd: number;
  cm: number;
  blackout: boolean;
  /** 0..3 plasma display scale. */
  plasma: number;
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

function lerp_moment(mach: number, alpha_deg: number, rows: MomentRow[]): number {
  if (!rows.length) return 0;
  const machs = [...new Set(rows.map((r) => r.mach))].sort((a, b) => a - b);
  const lo_m = machs.reduce((acc, m) => (m <= mach ? m : acc), machs[0]);
  const hi_m = machs.find((m) => m >= mach) ?? machs[machs.length - 1];
  const slice = (m: number) => {
    const at = rows.filter((r) => r.mach === m).sort((a, b) => a.alpha_deg - b.alpha_deg);
    if (!at.length) return 0;
    if (alpha_deg <= at[0].alpha_deg) return at[0].cm;
    for (let i = 1; i < at.length; i++) {
      if (alpha_deg <= at[i].alpha_deg) {
        const a = at[i - 1];
        const b = at[i];
        const f = (alpha_deg - a.alpha_deg) / (b.alpha_deg - a.alpha_deg || 1);
        return a.cm + (b.cm - a.cm) * f;
      }
    }
    return at[at.length - 1].cm;
  };
  if (lo_m === hi_m) return slice(lo_m);
  const f = (mach - lo_m) / (hi_m - lo_m || 1);
  return slice(lo_m) + (slice(hi_m) - slice(lo_m)) * f;
}

/** 1-D Mach interpolation over a derivative schedule. */
function lerp_beta_deriv(
  mach: number,
  rows: Array<{ mach: number; cl_beta_per_rad: number; cn_beta_per_rad: number }>,
): { cl_beta: number; cn_beta: number } {
  if (!rows.length) return { cl_beta: 0, cn_beta: 0 };
  const at = [...rows].sort((a, b) => a.mach - b.mach);
  if (mach <= at[0].mach) return { cl_beta: at[0].cl_beta_per_rad, cn_beta: at[0].cn_beta_per_rad };
  for (let i = 1; i < at.length; i++) {
    if (mach <= at[i].mach) {
      const a = at[i - 1];
      const b = at[i];
      const f = (mach - a.mach) / (b.mach - a.mach || 1);
      return {
        cl_beta: a.cl_beta_per_rad + (b.cl_beta_per_rad - a.cl_beta_per_rad) * f,
        cn_beta: a.cn_beta_per_rad + (b.cn_beta_per_rad - a.cn_beta_per_rad) * f,
      };
    }
  }
  const last = at[at.length - 1];
  return { cl_beta: last.cl_beta_per_rad, cn_beta: last.cn_beta_per_rad };
}

const D2R = Math.PI / 180;

export class Aero {
  S = table.reference_area_m2;
  span_m = table.reference_span_m;
  mac_m = table.mac_m;
  atmosphere_top_m = table.atmosphere_top_m;
  heat = table.heating;
  eff_cfg = table.effectors;
  rows = table.table as AeroRow[];
  moment_rows = table.moment_table as MomentRow[];
  beta_rows = table.beta_derivatives as Array<{ mach: number; cl_beta_per_rad: number; cn_beta_per_rad: number }>;
  damping = table.damping_derivatives as { cmq_per_rad: number; clp_per_rad: number; cnr_per_rad: number };

  accelerations(
    r: Vec3,
    v: Vec3,
    mass: number,
    q: Quat,
    omega_body: Vec3,
    eff: EffectorDeflection,
    gear_down: boolean,
  ): AeroSample {
    const vr = v_rel(r, v);
    const spd = len(vr);
    const alt = len(r) - 6_378_137;
    const rho = std_density(alt);
    const qbar = 0.5 * rho * spd * spd;
    const zero: AeroSample = {
      a_eci: { x: 0, y: 0, z: 0 },
      torque_body: { x: 0, y: 0, z: 0 },
      q_dyn: qbar,
      heating: 0,
      rho,
      mach: 0,
      alpha_deg: 0,
      beta_deg: 0,
      bank_deg: 0,
      lift_to_drag: 0,
      cl: 0,
      cd: 0,
      cm: 0,
      blackout: false,
      plasma: 0,
    };
    if (spd < 1 || rho <= 0) return zero;
    const vhat = norm(vr);
    const mach = spd / sound_speed(alt);

    // Attitude-relative airflow, measured from the quaternion: no commanded
    // bank is assumed. Body axes: x nose, y right wing, z down. Positive
    // alpha = nose above the velocity vector (velocity appears from below,
    // +z); positive beta = velocity to the right of the nose (+y).
    const vr_body = body_from_eci(q, vr);
    const alpha = Math.atan2(vr_body.z, Math.max(vr_body.x, 0.05 * spd));
    const beta = Math.atan2(vr_body.y, Math.max(vr_body.x, 0.05 * spd));
    const alpha_deg = alpha / D2R;
    const beta_deg = beta / D2R;

    // Measured bank about the velocity vector: rotation of the right wing
    // out of the plane spanned by velocity and local up.
    const rhat = norm(r);
    let up = sub(rhat, mul(vhat, dot(rhat, vhat)));
    if (len(up) < 1e-6) up = { x: 0, y: 0, z: 1 };
    else up = norm(up);
    const side = norm(cross(vhat, up));
    const yb = eci_from_body(q, { x: 0, y: 1, z: 0 });
    const bank = Math.atan2(-dot(yb, up), dot(yb, side));
    const bank_deg = bank / D2R;

    // Forces.
    const tab = lerp_coeff(mach, alpha_deg, this.rows);
    const de_avg = (eff.elevon_l_deg + eff.elevon_r_deg) / 2;
    const sb = eff.speedbrake_deg;
    const bf = eff.bodyflap_deg;
    const cl = tab.cl + this.eff_cfg.speedbrake.dcl_per_deg * sb;
    let cd =
      tab.cd +
      this.eff_cfg.elevon.dcd_per_deg_abs * Math.abs(de_avg) +
      this.eff_cfg.speedbrake.dcd_per_deg * sb +
      this.eff_cfg.bodyflap.dcd_per_deg_abs * Math.abs(bf) +
      this.eff_cfg.rudder.dcd_per_deg_abs * Math.abs(eff.rudder_deg);
    if (gear_down) cd += this.eff_cfg.gear.dcd;
    const drag = qbar * cd * this.S;
    const lift = qbar * cl * this.S;
    const lift_dir = add(mul(up, Math.cos(bank)), mul(side, Math.sin(bank)));
    const f = add(mul(vhat, -drag), mul(lift_dir, lift));

    // Moments.
    const cm_tab = lerp_moment(mach, alpha_deg, this.moment_rows);
    const { cl_beta, cn_beta } = lerp_beta_deriv(mach, this.beta_rows);
    const de_diff = (eff.elevon_l_deg - eff.elevon_r_deg) / 2;
    const qrate_nd = spd > 1 ? (omega_body.y * this.mac_m) / (2 * spd) : 0;
    const prate_nd = spd > 1 ? (omega_body.x * this.span_m) / (2 * spd) : 0;
    const rrate_nd = spd > 1 ? (omega_body.z * this.span_m) / (2 * spd) : 0;
    const cm =
      cm_tab +
      this.eff_cfg.elevon.dcm_per_deg * de_avg +
      this.eff_cfg.bodyflap.dcm_per_deg * bf +
      this.eff_cfg.speedbrake.dcm_per_deg * sb +
      this.damping.cmq_per_rad * qrate_nd;
    const clm =
      cl_beta * beta + this.eff_cfg.elevon.dcl_diff_per_deg * de_diff + this.damping.clp_per_rad * prate_nd;
    const cn =
      cn_beta * beta + this.eff_cfg.rudder.dcn_per_deg * eff.rudder_deg + this.damping.cnr_per_rad * rrate_nd;
    const torque_body = {
      x: qbar * this.S * this.span_m * clm,
      y: qbar * this.S * this.mac_m * cm,
      z: qbar * this.S * this.span_m * cn,
    };

    // Heating: Sutton-Graves stagnation proxy. Blackout while the
    // ionization proxy band holds. Both [estimated] proxies.
    const heating = this.heat.sutton_graves_k * Math.sqrt(Math.max(rho, 0) / this.heat.nose_radius_m) * spd ** 3;
    const blackout = spd > this.heat.blackout_v_min_mps && rho > this.heat.blackout_rho_min_kgm3;
    const plasma = Math.min(3, heating / this.heat.plasma_heat_ref_wm2);

    return {
      a_eci: mul(f, 1 / mass),
      torque_body,
      q_dyn: qbar,
      heating,
      rho,
      mach,
      alpha_deg,
      beta_deg,
      bank_deg,
      lift_to_drag: cd > 1e-9 ? cl / cd : 0,
      cl,
      cd,
      cm,
      blackout,
      plasma,
    };
  }
}
