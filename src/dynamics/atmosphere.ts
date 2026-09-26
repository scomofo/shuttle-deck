/**
 * Neutral atmosphere at the dynamics boundary.
 * US-Standard-Atmosphere-1976 structure up to the mesopause, extrapolated
 * to the model top: temperature lapse segments with hydrostatic pressure
 * integration, so density and the temperature-dependent speed of sound
 * both follow from one temperature profile instead of a single-exponential
 * stand-in. Same publication idea as gemini-capsule src/dynamics/atmosphere.gd.
 *
 * Segment base data (altitude m, temperature K, lapse K/m) follows the
 * US-76 table to 86 km; above that the lapse is extrapolated to the model
 * top (120 km) where density is ~1e-8 kg/m^3 and the extrapolation error
 * is dynamically irrelevant. No node-only APIs: pure arithmetic, safe for
 * the deck prebuild.
 */

export const ATMOSPHERE_TOP_M = 120_000;

const R_AIR = 287.05; // J/(kg K)
const GAMMA = 1.4;
const G0 = 9.80665;
const P0 = 101325; // Pa
const RHO0 = 1.225; // kg/m^3

type Segment = { h: number; t: number; lapse: number };

/** US-76 lapse segments; the last row extrapolates 86 km -> model top. */
const SEGMENTS: Segment[] = [
  { h: 0, t: 288.15, lapse: -0.0065 },
  { h: 11_000, t: 216.65, lapse: 0 },
  { h: 20_000, t: 216.65, lapse: 0.001 },
  { h: 32_000, t: 228.65, lapse: 0.0028 },
  { h: 47_000, t: 270.65, lapse: 0 },
  { h: 51_000, t: 270.65, lapse: -0.0028 },
  { h: 71_000, t: 214.65, lapse: -0.002 },
  { h: 86_000, t: 184.65, lapse: -0.002 },
];

/** Base pressures, integrated once at module load (deterministic). */
const BASE_PRESSURE: number[] = (() => {
  const ps: number[] = [P0];
  for (let i = 0; i < SEGMENTS.length; i++) {
    const s = SEGMENTS[i];
    const h1 = i + 1 < SEGMENTS.length ? SEGMENTS[i + 1].h : ATMOSPHERE_TOP_M;
    const t1 = s.t + s.lapse * (h1 - s.h);
    let p1: number;
    if (s.lapse === 0) {
      p1 = ps[i] * Math.exp((-G0 * (h1 - s.h)) / (R_AIR * s.t));
    } else {
      p1 = ps[i] * Math.pow(t1 / s.t, -G0 / (R_AIR * s.lapse));
    }
    ps.push(p1);
  }
  return ps;
})();

function segment_at(alt_m: number): number {
  let idx = 0;
  for (let i = 0; i < SEGMENTS.length; i++) {
    if (alt_m >= SEGMENTS[i].h) idx = i;
  }
  return idx;
}

/** Temperature in kelvin from the lapse profile. */
export function temperature(alt_m: number): number {
  if (alt_m <= 0) return SEGMENTS[0].t;
  if (alt_m >= ATMOSPHERE_TOP_M) {
    const s = SEGMENTS[SEGMENTS.length - 1];
    return Math.max(50, s.t + s.lapse * (ATMOSPHERE_TOP_M - s.h));
  }
  const i = segment_at(alt_m);
  const s = SEGMENTS[i];
  return s.t + s.lapse * (alt_m - s.h);
}

/** Pressure in pascals from hydrostatic integration of the profile. */
export function pressure(alt_m: number): number {
  if (alt_m <= 0) return P0;
  if (alt_m >= ATMOSPHERE_TOP_M) return 0;
  const i = segment_at(alt_m);
  const s = SEGMENTS[i];
  const p_base = BASE_PRESSURE[i];
  const t = temperature(alt_m);
  if (s.lapse === 0) {
    return p_base * Math.exp((-G0 * (alt_m - s.h)) / (R_AIR * s.t));
  }
  return p_base * Math.pow(t / s.t, -G0 / (R_AIR * s.lapse));
}

export function density(alt_m: number): number {
  if (alt_m > ATMOSPHERE_TOP_M) return 0;
  if (alt_m < 0) return RHO0;
  return pressure(alt_m) / (R_AIR * temperature(alt_m));
}

/** Temperature-dependent speed of sound, m/s. */
export function sound_speed(alt_m: number): number {
  return Math.sqrt(GAMMA * R_AIR * temperature(alt_m));
}
