/** Fitted presentation coordinates. +Z is the nose; down-lock retains the
 * existing six wheel centers and Y=-2.4 contact plane. See GEAR_DEPLOYMENT.md.
 * Fold direction, pivot and travel curve are estimates, not STS-1 calibration. */
export const GEAR_LAYOUT = [
  { id: "nose", x: 0, z: 8.25, radius: 0.4 },
  { id: "starboard", x: -3.25, z: -5.25, radius: 0.55 },
  { id: "port", x: 3.25, z: -5.25, radius: 0.55 },
] as const;
export const GEAR_PIVOT_Y = -0.75;

/** A direct mapping of root travel, never a wall-clock animation. */
export function gearFoldAngle(position: number) {
  const p = Math.max(0, Math.min(1, Number.isFinite(position) ? position : 0));
  if (p === 1) return 0;
  // Ease away from stow and settle at down-lock without an endpoint jump.
  return -(1 - p * p * (3 - 2 * p)) * Math.PI / 2;
}
