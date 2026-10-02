import { useSyncExternalStore } from "react";

// A display preference, independent of the flight/checkpoint and control bus.
const key = "shuttle-deck.approach-guides";
let enabled = false;
try { enabled = localStorage.getItem(key) === "true"; } catch { /* session only */ }
const listeners = new Set<() => void>();
export const getLandingGuides = () => enabled;
export function setLandingGuides(value: boolean) {
  enabled = value;
  try { localStorage.setItem(key, String(value)); } catch { /* session only */ }
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useLandingGuides() { return useSyncExternalStore(subscribe, getLandingGuides, () => false); }
