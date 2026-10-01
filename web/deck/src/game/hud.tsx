import { useEffect, useRef, useSyncExternalStore } from "react";
import { Eye, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { getSimVersion, sim, subscribeSim, type StartMode } from "@/sim/runtime";
import { activeCard, procedureActionLabel } from "@/sim/procedures";
import { ProcedureFocus } from "./procedure-focus";
import { CockpitTools } from "./cockpit-tools";
import { getCockpitInspection, subscribeCockpitInspection, inspectCockpit } from "./cockpit-navigation";

function useSim() {
  useSyncExternalStore(subscribeSim, getSimVersion, getSimVersion);
  return sim;
}

function met(seconds: number) {
  const t = Math.max(0, Math.floor(seconds));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function phaseLabel() {
  if (!sim.running) return "PREFLIGHT";
  if (sim.phase === "ascent") return sim.srbAttached ? "ASCENT · SRB" : "ASCENT · SSME";
  if (sim.phase === "orbit") return sim.deorbitCommitted ? "DEORBIT · COAST" : "ORBIT";
  if (sim.phase === "entry") return sim.blackout ? "ENTRY · BLACKOUT" : "ENTRY";
  if (sim.phase === "taem") return "TAEM · HAC";
  if (sim.phase === "approach") return "APPROACH";
  if (sim.phase === "rollout") return "ROLLOUT";
  if (sim.phase === "landed") return "WHEEL STOP";
  if (sim.phase === "lost") return "LOST";
  return "PAD";
}

function fmtAlt(m: number) {
  if (m > 20000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

export function Hud({
  onStart,
  checklistOpen,
  onChecklist,
  controlsOpen,
  onControls,
  onFind,
}: {
  onStart: (mode: StartMode) => void;
  checklistOpen: boolean;
  onChecklist: () => void;
  controlsOpen: boolean;
  onControls: () => void;
  onFind: () => void;
}) {
  const live = useSim();
  const inspection = useSyncExternalStore(subscribeCockpitInspection, getCockpitInspection, getCockpitInspection);
  const cards = live.procedures();
  const currentCard = activeCard(cards);
  const sheet = useRef<HTMLElement>(null);
  const stepId = currentCard?.steps.find((step) => step.current)?.id;
  useEffect(() => { sheet.current?.scrollTo(0, 0); }, [stepId, checklistOpen]);
  useEffect(() => { inspectCockpit(null); }, [stepId]);
  useEffect(() => { if (live.view !== "cockpit") inspectCockpit(null); }, [live.view]);
  const showMenu = !live.running || live.phase === "lost" || live.phase === "landed";
  const bankDeg = (-live.bank * 180) / Math.PI;
  const pitchPx = live.pitch * 90;

  return (
    <div className="hud" data-menu={showMenu} data-view={live.view} data-checklist-open={checklistOpen} data-controls-open={controlsOpen} data-inspecting={!!inspection.target}>
      <header className="topbar">
        <div className="brand">
          <b>SHUTTLE DECK</b>
          <span>MET {live.running ? met(live.get) : "00:00"}</span>
        </div>
        <div className="phase-pill">{phaseLabel()}</div>
        <div className="row">
          {[1, 4, 16].map((rate) => (
            <button key={rate} className="rate" data-on={live.timeRate === rate} onClick={() => live.setRate(rate)} type="button">
              {rate}×
            </button>
          ))}
          <button className="icon-btn" type="button" onClick={() => live.togglePause()} aria-label={live.paused ? "Resume" : "Pause"}>
            {live.paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button className="ghost view-btn" type="button" onClick={() => live.cycleView()} aria-label="Change view">
            <Eye size={16} />
            {live.view === "cockpit" ? "CABIN" : live.view === "tower" ? "TOWER" : "CHASE"}
          </button>
          <button className="icon-btn" type="button" onClick={() => live.toggleMute()} aria-label="Mute">
            {live.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button className="ghost" type="button" onClick={onChecklist} aria-expanded={checklistOpen} aria-controls="flight-checklist">
            Checklist [C]
          </button>
        </div>
      </header>

      <div className="mid">
        <aside ref={sheet} id="flight-checklist" className="sheet" data-open={checklistOpen} aria-label="Flight checklist">
          {checklistOpen && currentCard ? <ProcedureFocus card={currentCard} perform={(action) => live.perform(action)} paused={live.paused}
            resume={() => live.togglePause()} holdBurn={(held) => live.onKey("KeyB", held)}
            findControl={(action) => {
              live.setView("cockpit");
              onFind();
              inspectCockpit(action);
            }} /> : null}
          <details className="procedure-overview">
          <summary>All procedures · {cards.length}</summary>
          {cards.map((card) => (
            <section className="proc" key={card.id}>
              <header>
                <small>{card.system}</small>
                <b>{card.title}</b>
              </header>
              {card.steps.map((step, index) => (
                <div className="step" key={step.id} data-current={step.current} data-done={step.done}>
                  <i className="dot" data-on={step.done} />
                  <span>
                    {index + 1}. {step.call}
                  </span>
                  <em>{step.response}</em>
                  {step.action ? (
                    <button type="button" className="choice" disabled={!!step.waiting || live.paused} onClick={() => live.perform(step.action!)}>
                      {procedureActionLabel(step.action)}
                    </button>
                  ) : null}
                </div>
              ))}
            </section>
          ))}
          </details>
        </aside>
        <div>
          {live.callout && live.calloutT < 7 ? (
            <div className="callout" data-warn={live.phase === "lost"}>
              {live.callout}
            </div>
          ) : null}
          {live.blackout ? <div className="warn-flag">NO AIR TO GROUND</div> : null}
          {live.phase === "entry" && live.running ? (
            <div className="energy" data-state={live.altErr > 5000 ? "high" : live.altErr < -3000 ? "low" : "on"}>
              {live.altErr > 5000 ? "ENERGY HIGH" : live.altErr < -3000 ? "ENERGY LOW" : "CORRIDOR"}
            </div>
          ) : null}
          {live.phase === "taem" && live.running ? (
            <div className="energy" data-state={live.altErr > 400 ? "high" : live.altErr < -400 ? "low" : "on"}>
              {live.altErr > 400 ? "ABOVE CYLINDER" : live.altErr < -400 ? "BELOW CYLINDER" : "ON THE HAC"}
            </div>
          ) : null}
          {(live.phase === "entry" || live.phase === "taem" || live.phase === "approach") && live.running ? (
            <div className="fd" aria-hidden="true">
              <i style={{ transform: `translate(-50%, -50%) translateX(${live.fdBank * 28}px)` }} />
              <b style={{ transform: `translate(-50%, -50%) translateY(${-(live.fdPitch - live.pitch) * 40}px)` }} />
              <span className="director" style={{ transform: "translate(-50%, -50%)" }} />
            </div>
          ) : null}
        </div>
      </div>

      <footer className="bottom">
        <div className="adi" aria-label="Attitude indicator">
          <div className="horizon" style={{ transform: `translateY(${pitchPx}px) rotate(${bankDeg}deg)` }}>
            <div className="sky" />
            <div className="ground-h" />
          </div>
          <div className="wings" />
        </div>
        <div>
          <div className="tapes">
            <div className="readout">
              <small>ALT</small>
              <strong>{fmtAlt(live.y)}</strong>
            </div>
            <div className="readout">
              <small>SPEED</small>
              <strong>{Math.round(live.speed())} m/s</strong>
            </div>
            <div className="readout">
              <small>MACH</small>
              <strong>{live.mach.toFixed(2)}</strong>
            </div>
            <div className="readout">
              <small>ALPHA</small>
              <strong>{((live.alpha * 180) / Math.PI).toFixed(0)}°</strong>
            </div>
            <div className="readout">
              <small>Q</small>
              <strong>{(live.qbar / 1000).toFixed(1)} kPa</strong>
            </div>
            <div className="readout">
              <small>G</small>
              <strong>{live.gLoad.toFixed(2)}</strong>
            </div>
            <div className="readout">
              <small>BUS</small>
              <strong>{live.busVolts.toFixed(1)} V</strong>
            </div>
            <div className="readout">
              <small>HEAT</small>
              <strong>{Math.round(live.heat * 100)}%</strong>
            </div>
          </div>
          <div className="bars">
            <div className="bar">
              <span>SRB</span>
              <div className="track">
                <em style={{ width: `${live.srbProp * 100}%` }} />
              </div>
            </div>
            <div className="bar">
              <span>OMS</span>
              <div className="track">
                <em style={{ width: `${live.omsProp * 100}%` }} />
              </div>
            </div>
            <div className="bar">
              <span>RCS</span>
              <div className="track">
                <em style={{ width: `${live.rcsProp * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </footer>

      {!showMenu && live.view === "cockpit" ? <CockpitTools controlsOpen={controlsOpen} onControls={onControls} /> : null}

      {showMenu ? (
        <section className="menu">
          <h1>{live.phase === "landed" ? "WHEEL STOP" : live.phase === "lost" ? "VEHICLE LOST" : "SHUTTLE DECK"}</h1>
          <p>
            {live.phase === "landed"
              ? "Down on the runway. Launch again, or skip to entry or the approach."
              : live.phase === "lost"
                ? live.fail
                : "Start from the commander seat. Guidance flies the trajectory while you configure the spacecraft. Follow the checklist and use Find in cockpit to locate each modeled control."}
          </p>
          <div className="choices">
            <button className="primary" type="button" onClick={() => onStart("launch")}>
              Start launch
            </button>
            <button className="choice" type="button" onClick={() => onStart("orbit")}>
              Start in orbit
            </button>
            <button className="choice" type="button" onClick={() => onStart("entry")}>
              Start at entry
            </button>
            <button className="choice" type="button" onClick={() => onStart("approach")}>
              Final approach
            </button>
          </div>
          <div className="legend">
            <span>A / D roll left / right</span>
            <span>W / S pitch</span>
            <span>Q / E yaw</span>
            <span>B deorbit burn</span>
            <span>G gear · O bay doors</span>
            <span>V cabin / chase / tower</span>
          </div>
        </section>
      ) : null}
    </div>
  );
}
