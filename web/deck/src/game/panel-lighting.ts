import { useSyncExternalStore } from "react";

const key = "shuttle-deck.panel-light";
export function clampPanelLight(value: number) {
  return Number.isFinite(value) ? Math.max(0.25, Math.min(1, value)) : 0.75;
}
function readPreference() {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? 0.75 : clampPanelLight(Number(saved));
  } catch { return 0.75; }
}
let level = readPreference();
const listeners = new Set<() => void>();
export const getPanelLight = () => level;
export function setPanelLight(value: number) {
  level = clampPanelLight(value);
  // A blocked storage policy must not make the cockpit control fail.
  try { localStorage.setItem(key, String(level)); } catch { /* session-only preference */ }
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function usePanelLight() { return useSyncExternalStore(subscribe, getPanelLight, () => 0.75); }
