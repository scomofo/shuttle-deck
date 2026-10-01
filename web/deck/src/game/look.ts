import { inspectCockpit } from "./cockpit-navigation";

/**
 * Seated-eye look state for the cockpit view.
 *
 * The cabin is anchored in the orbiter body frame; the camera is the
 * independently moving seated eye. Dragging on the viewport yaws/pitches the
 * eye, double-click recenters it, and entering the cockpit view resets it.
 * Yaw is clamped to ±160° so the aft station stays reachable; pitch is
 * clamped to a seated range.
 */

export const LOOK_YAW_MAX = (160 * Math.PI) / 180;
export const LOOK_PITCH_MIN = (-55 * Math.PI) / 180;
export const LOOK_PITCH_MAX = (75 * Math.PI) / 180;

const SENSITIVITY = 0.0038;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export const lookState = { yaw: 0, pitch: 0 };

export function addLook(dx: number, dy: number) {
  // Drag right → look right; drag up → look up.
  lookState.yaw = clamp(lookState.yaw - dx * SENSITIVITY, -LOOK_YAW_MAX, LOOK_YAW_MAX);
  lookState.pitch = clamp(lookState.pitch - dy * SENSITIVITY, LOOK_PITCH_MIN, LOOK_PITCH_MAX);
}

export function resetLook() {
  lookState.yaw = 0;
  lookState.pitch = 0;
}

/** Drag-to-look + double-click-to-recenter on a viewport element. */
export function attachLookControls(el: HTMLElement): () => void {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* no capture — drag still works via move/up on the element */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    addLook(e.clientX - lastX, e.clientY - lastY);
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onUp = () => {
    dragging = false;
  };
  const onDblClick = () => { inspectCockpit(null); resetLook(); };

  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onUp);
  el.addEventListener("dblclick", onDblClick);
  return () => {
    el.removeEventListener("pointerdown", onDown);
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onUp);
    el.removeEventListener("dblclick", onDblClick);
  };
}
