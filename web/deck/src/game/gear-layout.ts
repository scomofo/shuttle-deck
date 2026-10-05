/** Fitted presentation coordinates. +Z is the nose; down-lock retains the
 * existing six wheel centers and Y=-2.4 contact plane. See GEAR_DEPLOYMENT.md.
 * Fold direction, pivot and travel curve are estimates, not STS-1 calibration. */
export const GEAR_LAYOUT = [
  { id: "nose", x: 0, z: 8.25, radius: 0.4 },
  { id: "starboard", x: -3.25, z: -5.25, radius: 0.55 },
  { id: "port", x: 3.25, z: -5.25, radius: 0.55 },
] as const;
export const GEAR_PIVOT_Y = -0.75;

/** Nose assembly fits the existing rendered envelope, not a flown drawing.
 * Physical model coordinates after transverse compensation. The 108-degree
 * stow lead is guided by the 1977 model diagram; registration remains fitted. */
export const NOSE_WELL = {
  halfWidth: 0.72, aft: 7.74, forward: 10.10, roof: 0.40,
  doorHalfWidth: 0.67, hingeX: 0.68,
  doorTravel: 88 * Math.PI / 180, doorComplete: 0.18,
  legStart: 0.22, stowAngle: 108 * Math.PI / 180,
} as const;

function progress(position: number) {
  return Math.max(0, Math.min(1, Number.isFinite(position) ? position : 0));
}
function smooth(p: number) { return p * p * (3 - 2 * p); }

export function noseDoorAngle(position: number) {
  return NOSE_WELL.doorTravel * smooth(progress(position / NOSE_WELL.doorComplete));
}

/** A direct mapping of root travel, never a wall-clock animation. */
export function gearFoldAngle(position: number, id = "main") {
  const p = progress(position);
  if (p === 1) return 0;
  if (id === "nose") {
    const leg = progress((p - NOSE_WELL.legStart) / (1 - NOSE_WELL.legStart));
    // Bounded acceleration/deceleration with constant middle travel avoids
    // rushing the larger fitted arc after the doors have cleared.
    const travel = leg < 0.2 ? leg * leg / 0.32 : leg > 0.8 ? 1 - (1 - leg) ** 2 / 0.32 : (leg - 0.1) / 0.8;
    return -(1 - travel) * NOSE_WELL.stowAngle;
  }
  // Ease away from stow and settle at down-lock without an endpoint jump.
  return -(1 - smooth(p)) * Math.PI / 2;
}
