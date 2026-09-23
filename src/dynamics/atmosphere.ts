/**
 * Neutral atmosphere at the dynamics boundary.
 * Exponential scale-height stand-in for US-76 until a table is ingested.
 * Same publication idea as gemini-capsule src/dynamics/atmosphere.gd.
 */

export const ATMOSPHERE_TOP_M = 120_000;

export function density(alt_m: number): number {
  if (alt_m > ATMOSPHERE_TOP_M) return 0;
  if (alt_m < 0) return 1.225;
  return 1.225 * Math.exp(-alt_m / 7500);
}

export function sound_speed(alt_m: number): number {
  if (alt_m > 80_000) return 280;
  if (alt_m > 20_000) return 295;
  return 340;
}
