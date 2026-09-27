/**
 * Mission profile data plus the ascent profile.
 * Port of gemini-capsule src/mission/mission.gd.
 * Pure data and initial-condition helpers; the running machine is the sequencer.
 */

import { clock } from "../core/clock.ts";
import { add, cross, Frames, mul, norm, type Vec3 } from "../core/frames.ts";
import { qid, type Quat } from "../dynamics/attitude.ts";
import { v_rel } from "../dynamics/aero.ts";
import type { Dynamics } from "../dynamics/dynamics.ts";

export type PhaseSpec = {
  next?: string;
  on?: Record<string, unknown>;
  config?: string;
  events?: Record<string, number>;
  events_on_control?: Record<string, string>;
  one_shot?: string[];
  branches?: Array<{ next: string; on: Record<string, unknown>; one_shot?: string[] }>;
  event_config?: Record<string, string>;
};

export type MissionData = {
  id: string;
  name?: string;
  liftoff_utc?: string;
  data_version: number;
  liftoff_jd: number;
  insertion: {
    get_s: number;
    perigee_km: number;
    apogee_km: number;
    inclination_deg: number;
  };
  phases: Record<string, PhaseSpec>;
  ascent?: { rows: AscentRow[]; launch_azimuth_deg: number };
  /** P2 golden-trajectory: terminal scenario starts (root mission data owns
   * what the deck adapter used to hard-code in placeWithVelocity). */
  entry_ic?: GeoIC;
  approach_ic?: GeoIC;
};

/** Geodetic fix + Earth-relative velocity for a scenario start (entry
 * interface, TAEM/final). Speeds are Earth-relative like AscentRow; the
 * helper below recovers the inertial state. */
export type GeoIC = {
  get_s: number;
  lat_deg: number;
  lon_deg: number;
  alt_m: number;
  heading_deg: number;
  speed_rel_mps: number;
  fpa_deg: number;
};

export type AscentRow = {
  t_s: number;
  alt_m: number;
  speed_rel_mps: number;
  fpa_deg: number;
  lat_deg: number;
  lon_deg: number;
  accel_g: number;
};

export class Mission {
  data: MissionData;
  path = "";

  constructor(data: MissionData) {
    this.data = data;
  }

  id(): string {
    return this.data.id;
  }

  phases(): Record<string, PhaseSpec> {
    return this.data.phases;
  }

  start_in_orbit(dyn: Dynamics): void {
    clock.liftoff_jd = this.data.liftoff_jd;
    clock.get_seconds = this.data.insertion.get_s;
    const alt = ((this.data.insertion.perigee_km + this.data.insertion.apogee_km) / 2) * 1000;
    dyn.orbit.set_circular(alt, (this.data.insertion.inclination_deg * Math.PI) / 180);
    dyn.driven = false;
    dyn.set_configuration("orbit");
    dyn.attitude.q = qid();
    dyn.publish();
  }

  start_on_pad(dyn: Dynamics, hold_s = 10): void {
    clock.liftoff_jd = this.data.liftoff_jd;
    clock.get_seconds = -hold_s;
    dyn.set_configuration("stack");
    const s = this.ascent_state(0);
    dyn.set_state_eci(s.r, s.v, s.q);
    dyn.driven = true;
    dyn.publish();
  }

  ascent_row(t: number): AscentRow {
    const rows = this.data.ascent?.rows ?? defaultAscent();
    if (t <= rows[0].t_s) return rows[0];
    for (let k = 1; k < rows.length; k++) {
      if (t <= rows[k].t_s) {
        const a = rows[k - 1];
        const b = rows[k];
        const f = (t - a.t_s) / (b.t_s - a.t_s);
        const lerp = (x: number, y: number) => x + (y - x) * f;
        return {
          t_s: t,
          alt_m: lerp(a.alt_m, b.alt_m),
          speed_rel_mps: lerp(a.speed_rel_mps, b.speed_rel_mps),
          fpa_deg: lerp(a.fpa_deg, b.fpa_deg),
          lat_deg: lerp(a.lat_deg, b.lat_deg),
          lon_deg: lerp(a.lon_deg, b.lon_deg),
          accel_g: lerp(a.accel_g, b.accel_g),
        };
      }
    }
    return rows[rows.length - 1];
  }

  /** Entry-interface scenario start from mission data (replaces the deck
   * adapter's hard-coded placeEntryInterface). Wings-level, nose along the
   * Earth-relative velocity; the historical 40° hypersonic AoA is a P3/P4
   * entry-guidance gap, not modeled here. */
  start_in_entry(dyn: Dynamics): void {
    const ic = this.data.entry_ic;
    if (!ic) throw new Error(`mission ${this.data.id} has no entry_ic`);
    clock.liftoff_jd = this.data.liftoff_jd;
    clock.get_seconds = ic.get_s;
    const s = this.geo_state(ic.lat_deg, ic.lon_deg, ic.alt_m, ic.heading_deg, ic.speed_rel_mps, ic.fpa_deg, ic.get_s);
    dyn.set_state_eci(s.r, s.v, level_attitude(s.r, s.v));
    dyn.driven = false;
    dyn.set_configuration("entry");
    dyn.publish();
  }

  /** TAEM/final-approach scenario start from mission data (replaces the deck
   * adapter's hard-coded placeApproach). */
  start_in_approach(dyn: Dynamics): void {
    const ic = this.data.approach_ic;
    if (!ic) throw new Error(`mission ${this.data.id} has no approach_ic`);
    clock.liftoff_jd = this.data.liftoff_jd;
    clock.get_seconds = ic.get_s;
    const s = this.geo_state(ic.lat_deg, ic.lon_deg, ic.alt_m, ic.heading_deg, ic.speed_rel_mps, ic.fpa_deg, ic.get_s);
    dyn.set_state_eci(s.r, s.v, level_attitude(s.r, s.v));
    dyn.driven = false;
    dyn.set_configuration("entry");
    dyn.publish();
  }

  /**
   * Geodetic fix + Earth-relative heading/speed → ECI state. Shared by the
   * scripted ascent profile and the terminal scenario starts; same
   * construction as Gemini Mission.ascent_state.
   */
  geo_state(
    lat_deg: number,
    lon_deg: number,
    alt_m: number,
    heading_deg: number,
    speed_rel_mps: number,
    fpa_deg: number,
    get_s: number,
  ): { r: Vec3; v: Vec3 } {
    const jd = this.data.liftoff_jd + get_s / 86400;
    const lat = (lat_deg * Math.PI) / 180;
    const lon = (lon_deg * Math.PI) / 180;
    const rad = 6_378_137 + alt_m;
    const r_ecef: Vec3 = {
      x: rad * Math.cos(lat) * Math.cos(lon),
      y: rad * Math.cos(lat) * Math.sin(lon),
      z: rad * Math.sin(lat),
    };
    const az = (heading_deg * Math.PI) / 180;
    const fpa = (fpa_deg * Math.PI) / 180;
    const spd = speed_rel_mps;
    const v_enu = {
      x: spd * Math.cos(fpa) * Math.sin(az),
      y: spd * Math.cos(fpa) * Math.cos(az),
      z: spd * Math.sin(fpa),
    };
    const east = { x: -Math.sin(lon), y: Math.cos(lon), z: 0 };
    const north = {
      x: -Math.sin(lat) * Math.cos(lon),
      y: -Math.sin(lat) * Math.sin(lon),
      z: Math.cos(lat),
    };
    const up = {
      x: Math.cos(lat) * Math.cos(lon),
      y: Math.cos(lat) * Math.sin(lon),
      z: Math.sin(lat),
    };
    const v_ecef = add(add(mul(east, v_enu.x), mul(north, v_enu.y)), mul(up, v_enu.z));
    const r_eci = Frames.ecef_to_eci(r_ecef, jd);
    const v_rot = Frames.ecef_to_eci(v_ecef, jd);
    const w = 7.292115e-5;
    const v_eci = add(v_rot, { x: -w * r_eci.y, y: w * r_eci.x, z: 0 });
    return { r: r_eci, v: v_eci };
  }

  /** Earth-relative profile → ECI, same construction as Gemini Mission.ascent_state. */
  ascent_state(t: number): { r: Vec3; v: Vec3; q: ReturnType<typeof qid>; accel_g: number; alt_m: number } {
    const row = this.ascent_row(t);
    const s = this.geo_state(
      row.lat_deg,
      row.lon_deg,
      row.alt_m,
      this.data.ascent?.launch_azimuth_deg ?? 90,
      row.speed_rel_mps,
      row.fpa_deg,
      t,
    );
    return { r: s.r, v: s.v, q: qid(), accel_g: row.accel_g, alt_m: row.alt_m };
  }
}

/**
 * Wings-level attitude: body +X (nose) along the Earth-relative velocity,
 * +Y (right wing) level. Rotation matrix (columns = body axes in ECI) →
 * quaternion; the roll about the nose is fixed by the level wing, unlike
 * q_body_x_along which leaves it arbitrary.
 */
function level_attitude(r: Vec3, v: Vec3): Quat {
  const up = norm(r);
  const xb = norm(v_rel(r, v));
  const yb = norm(cross(xb, up));
  const zb = cross(xb, yb);
  return mat_to_quat(xb, yb, zb);
}

function mat_to_quat(xb: Vec3, yb: Vec3, zb: Vec3): Quat {
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
    x = s / 4; y = (r01 + r10) / s; z = (r02 - r20) / s; w = (r21 - r12) / s;
  } else if (r11 > r22) {
    const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
    y = s / 4; x = (r01 + r10) / s; z = (r12 + r21) / s; w = (r02 - r20) / s;
  } else {
    const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
    z = s / 4; x = (r02 + r20) / s; y = (r12 + r21) / s; w = (r10 - r01) / s;
  }
  return { x, y, z, w };
}

/** Coarse STS-1 shaped profile so the scripted-ascent handoff is testable. */
export function defaultAscent(): AscentRow[] {
  return [
    { t_s: 0, alt_m: 20, speed_rel_mps: 0, fpa_deg: 90, lat_deg: 28.6, lon_deg: -80.6, accel_g: 1.5 },
    { t_s: 20, alt_m: 3_000, speed_rel_mps: 170, fpa_deg: 70, lat_deg: 28.61, lon_deg: -80.58, accel_g: 2.1 },
    { t_s: 124, alt_m: 48_000, speed_rel_mps: 1400, fpa_deg: 30, lat_deg: 28.8, lon_deg: -79.9, accel_g: 2.5 },
    { t_s: 126, alt_m: 49_000, speed_rel_mps: 1410, fpa_deg: 29, lat_deg: 28.81, lon_deg: -79.88, accel_g: 1.1 },
    { t_s: 480, alt_m: 104_000, speed_rel_mps: 6500, fpa_deg: 5, lat_deg: 30.2, lon_deg: -75.0, accel_g: 2.8 },
    { t_s: 514, alt_m: 110_000, speed_rel_mps: 7450, fpa_deg: 0.6, lat_deg: 30.5, lon_deg: -74.2, accel_g: 0.1 },
  ];
}
