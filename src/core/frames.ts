/**
 * Reference frames (PHYSICS.md §1). Every public vector names its frame.
 * Port of gemini-capsule src/core/frames.gd.
 *
 * ECI   Earth-centred inertial, J2000 equator/equinox. Propagation state.
 * ECEF  Earth-fixed, ECI rotated by GMST about +Z.
 * LVLH  +Z nadir, +X along-track, +Y completes right-hand.
 * Body  shuttle: +X out the nose, +Z crew-down (belly), +Y right wing.
 * Three.js presentation is never dynamics truth.
 */

export const EARTH_ROTATION_RATE = 7.292115e-5;
export const J2000_JD = 2451545.0;
export const MU = 3.986004418e14;
export const RE = 6_378_137;
export const J2 = 1.08263e-3;

export type Vec3 = { x: number; y: number; z: number };

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function mul(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function len(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function norm(a: Vec3): Vec3 {
  const l = len(a) || 1;
  return mul(a, 1 / l);
}

export const Frames = {
  gmst_rad(jd_utc: number): number {
    const t = (jd_utc - J2000_JD) / 36525.0;
    const gmst_s =
      67310.54841 + (876600.0 * 3600.0 + 8640184.812866) * t + 0.093104 * t * t - 6.2e-6 * t * t * t;
    let gmst = ((gmst_s % 86400) + 86400) % 86400;
    return (gmst / 86400) * Math.PI * 2;
  },

  eci_to_ecef(v_eci: Vec3, jd_utc: number): Vec3 {
    const g = Frames.gmst_rad(jd_utc);
    const c = Math.cos(g);
    const s = Math.sin(g);
    return { x: c * v_eci.x + s * v_eci.y, y: -s * v_eci.x + c * v_eci.y, z: v_eci.z };
  },

  ecef_to_eci(v_ecef: Vec3, jd_utc: number): Vec3 {
    const g = Frames.gmst_rad(jd_utc);
    const c = Math.cos(g);
    const s = Math.sin(g);
    return { x: c * v_ecef.x - s * v_ecef.y, y: s * v_ecef.x + c * v_ecef.y, z: v_ecef.z };
  },

  ecef_to_geodetic(r: Vec3): { lat: number; lon: number; alt: number } {
    const a = RE;
    const f = 1 / 298.257223563;
    const e2 = f * (2 - f);
    const p = Math.hypot(r.x, r.y);
    const lon = Math.atan2(r.y, r.x);
    let lat = Math.atan2(r.z, p * (1 - e2));
    let h = 0;
    for (let i = 0; i < 5; i++) {
      const sl = Math.sin(lat);
      const n = a / Math.sqrt(1 - e2 * sl * sl);
      h = Math.abs(lat) < Math.PI / 4 ? p / Math.cos(lat) - n : r.z / sl - n * (1 - e2);
      lat = Math.atan2(r.z, p * (1 - e2 * n / (n + h)));
    }
    return { lat, lon, alt: h };
  },

  /** Columns are LVLH axes in ECI. +Z nadir, +X along-track. */
  lvlh_basis_in_eci(r_eci: Vec3, v_eci: Vec3): { x: Vec3; y: Vec3; z: Vec3 } {
    const z = mul(norm(r_eci), -1);
    let y = cross(z, v_eci);
    if (dot(y, y) < 1e-12) {
      y = cross(z, cross(v3(0, 0, 1), norm(r_eci)));
      if (dot(y, y) < 1e-12) y = v3(0, 1, 0);
    }
    y = norm(y);
    const x = norm(cross(y, z));
    return { x, y, z };
  },

  julian_date(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
    const jdn =
      Math.floor((1461 * (year + 4800 + Math.floor((month - 14) / 12))) / 4) +
      Math.floor((367 * (month - 2 - 12 * Math.floor((month - 14) / 12))) / 12) -
      Math.floor((3 * Math.floor((year + 4900 + Math.floor((month - 14) / 12)) / 100)) / 4) +
      day -
      32075;
    return jdn - 0.5 + (hour + minute / 60 + second / 3600) / 24;
  },
};
