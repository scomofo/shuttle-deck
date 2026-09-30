import { useEffect, useRef, useState } from "react";
import { FlightScene } from "@/game/scene";
import { Hud } from "@/game/hud";
import { beep, unlockAudio } from "@/game/audio";
import { attachControlsProbe, sim, type StartMode } from "@/sim/runtime";

export function ShuttleApp() {
  const [listOpen, setListOpen] = useState(false);
  const stick = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const lastCall = useRef("");

  useEffect(() => {
    attachControlsProbe();
    const down = (event: KeyboardEvent) => {
      if (event.repeat && event.code !== "KeyB") return;
      sim.onKey(event.code, true);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
        event.preventDefault();
      }
      unlockAudio();
      if (event.code === "KeyP") sim.togglePause();
      if (event.code === "KeyV") sim.cycleView();
      if (event.code === "KeyG") sim.toggleGear();
      if (event.code === "KeyO") sim.toggleDoors();
      if (event.code === "KeyM") sim.toggleMute();
      if (event.code === "F5") {
        event.preventDefault();
        sim.save();
      }
      if (event.code === "F9") {
        event.preventDefault();
        if (!sim.load()) sim.notify();
      }
      if (event.code === "BracketRight") sim.setRate(sim.timeRate < 4 ? 4 : 16);
      if (event.code === "BracketLeft") sim.setRate(sim.timeRate > 4 ? 4 : 1);
    };
    const up = (event: KeyboardEvent) => sim.onKey(event.code, false);
    const blur = () => sim.blur();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    const vis = () => {
      if (document.visibilityState === "visible") unlockAudio();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (sim.callout && sim.callout !== lastCall.current) {
        lastCall.current = sim.callout;
        if (!sim.muted) beep(sim.phase === "lost" ? 220 : 880);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  function start(mode: StartMode) {
    unlockAudio();
    beep(640);
    sim.start(mode);
  }

  function moveStick(clientX: number, clientY: number) {
    const base = stick.current;
    const cap = knob.current;
    if (!base || !cap) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.34;
    const mag = Math.hypot(dx, dy) || 1;
    if (mag > max) {
      dx = (dx / mag) * max;
      dy = (dy / mag) * max;
    }
    cap.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    sim.analog.roll = Math.max(-1, Math.min(1, -dx / max));
    sim.analog.pitch = Math.max(-1, Math.min(1, -dy / max));
  }

  function endStick() {
    sim.analog.roll = 0;
    sim.analog.pitch = 0;
    if (knob.current) knob.current.style.transform = "translate(-50%, -50%)";
  }

  return (
    <main className="deck">
      <FlightScene />
      <Hud onStart={start} checklistOpen={listOpen} onChecklist={() => setListOpen((v) => !v)} />
      <div
        className="stick"
        ref={stick}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          moveStick(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) moveStick(event.clientX, event.clientY);
        }}
        onPointerUp={endStick}
        onPointerCancel={endStick}
      >
        <div className="knob" ref={knob} />
      </div>
      <div className="touch-actions">
        <button
          className="choice"
          type="button"
          onPointerDown={() => sim.onKey("KeyB", true)}
          onPointerUp={() => sim.onKey("KeyB", false)}
          onPointerLeave={() => sim.onKey("KeyB", false)}
        >
          Burn
        </button>
        <button className="choice" type="button" onClick={() => sim.toggleGear()}>
          Gear
        </button>
        <button className="choice" type="button" onClick={() => sim.toggleDoors()}>
          Doors
        </button>
        <button className="choice" type="button" onClick={() => sim.cycleView()}>
          View
        </button>
      </div>
    </main>
  );
}
