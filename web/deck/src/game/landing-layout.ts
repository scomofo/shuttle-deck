/** STS-1 landed on Rogers Dry Lake runway 23 (mission.json identity/runway).
 * The footprint and paint coordinates below retain the trainer's estimated
 * layout; they are not a survey or a transcription of the 1981 markings. */
export const LANDING_STRIP = { start: -400, end: 4800, width: 90, number: "23", reciprocal: "05" } as const;

export interface LandingAnchor { x: number; z: number; yaw: number }

/** Local +X follows the recorded approach nose: (-sin(yaw), -cos(yaw)). */
export function landingRotation(yaw: number) { return yaw + Math.PI / 2; }

export function landingPoint(anchor: LandingAnchor, x: number, z: number) {
  const angle = landingRotation(anchor.yaw), c = Math.cos(angle), s = Math.sin(angle);
  return { x: anchor.x + c * x + s * z, z: anchor.z - s * x + c * z };
}

export function landingCoordinates(anchor: LandingAnchor, x: number, z: number) {
  const angle = landingRotation(anchor.yaw), c = Math.cos(angle), s = Math.sin(angle);
  const dx = x - anchor.x, dz = z - anchor.z;
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}

/** The recorded vehicle position is (-dx,-dz) in the approach layout. */
export function makeLandingAnchor(x: number, z: number, yaw: number, dx: number, dz: number): LandingAnchor {
  return { ...landingPoint({ x, z, yaw }, dx, dz), yaw };
}
