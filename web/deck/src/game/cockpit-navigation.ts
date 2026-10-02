/** Reading/navigation aids only; selecting a target never issues a crew command. */
export const COCKPIT_TARGETS = {
  "fuel-cells": { node: "control-fuel-cells", label: "R1 · FC / MN", fov: 38 },
  apu: { node: "control-apu", label: "R2 · APU START", fov: 38 },
  "doors-open": { node: "control-doors-open", label: "R13 · PLBD OPEN", fov: 42 },
  "doors-close": { node: "control-doors-close", label: "R13 · PLBD CLOSE", fov: 42 },
  "gear-arm": { node: "control-gear-arm", label: "F6 · GEAR ARM", fov: 38 },
  gear: { node: "control-gear", label: "F6 · GEAR DOWN", fov: 38 },
  displays: { node: "view-displays", label: "Commander flight instruments", fov: 42 },
  crts: { node: "view-crts", label: "F7 · Center CRTs", fov: 52 },
  overhead: { node: "view-overhead", label: "Overhead panels", fov: 62 },
  aft: { node: "view-aft", label: "Aft station", fov: 62 },
} as const;

export type CockpitTarget = keyof typeof COCKPIT_TARGETS;

/** A portrait reading aid must fit the entire station in the unobscured
 * scene. This adjusts the lens/crop, never the eye or vehicle. */
export function portraitReadingLens(width: number, height: number, top: number, bottom: number, baseFov: number) {
  const available = Math.max(100, bottom - top);
  const rad = Math.PI / 180;
  return {
    fov: Math.min(120, Math.max(baseFov,
      2 * Math.atan(Math.tan(baseFov * rad / 2) * height / available) / rad,
      2 * Math.atan(Math.tan(20 * rad) * height / width) / rad)),
    offsetY: -(top + available / 2 - height / 2),
  };
}
let inspection: { target: CockpitTarget | null; revision: number } = { target: null, revision: 0 };
const listeners = new Set<() => void>();
export const getCockpitInspection = () => inspection;
export function subscribeCockpitInspection(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function inspectCockpit(target: CockpitTarget | null) {
  inspection = { target, revision: inspection.revision + 1 };
  for (const listener of listeners) listener();
}

// Read-only projected locations let browser acceptance use real scene ray picks.
// The probe cannot move a control, camera or vehicle.
declare global {
  interface Window {
    __cockpitReadout?: { target: CockpitTarget; revision: number; x: number; y: number; visible: boolean; fov: number } | null;
  }
}
