/**
 * Mission profile data plus the ascent profile.
 * Port of gemini-capsule src/mission/mission.gd.
 * Pure data and initial-condition helpers; the running machine is the sequencer.
 */

import { clock } from "../core/clock.ts";
import { add, Frames, mul, type Vec3 } from "../core/frames.ts";
import { qid } from "../dynamics/attitude.ts";
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

  /** Earth-relative profile → ECI, same construction as Gemini Mission.ascent_state. */
  ascent_state(t: number): { r: Vec3; v: Vec3; q: ReturnType<typeof qid>; accel_g: number; alt_m: number } {
    const row = this.ascent_row(t);
    const jd = this.data.liftoff_jd + t / 86400;
    const lat = (row.lat_deg * Math.PI) / 180;
    const lon = (row.lon_deg * Math.PI) / 180;
    const rad = 6_378_137 + row.alt_m;
    const r_ecef: Vec3 = {
      x: rad * Math.cos(lat) * Math.cos(lon),
      y: rad * Math.cos(lat) * Math.sin(lon),
      z: rad * Math.sin(lat),
    };
    const az = ((this.data.ascent?.launch_azimuth_deg ?? 90) * Math.PI) / 180;
    const fpa = (row.fpa_deg * Math.PI) / 180;
    const spd = row.speed_rel_mps;
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
    return { r: r_eci, v: v_eci, q: qid(), accel_g: row.accel_g, alt_m: row.alt_m };
  }
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
