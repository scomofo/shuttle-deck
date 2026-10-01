import { useEffect, useRef } from "react";
import { procedureActionLabel, type ProcedureAction, type ProcedureCard } from "@/sim/procedures";
import { COCKPIT_TARGETS, type CockpitTarget } from "./cockpit-navigation";

/** A flight-data-file reading aid. Completion always comes from the live procedure. */
export function ProcedureFocus({ card, perform, paused, resume, holdBurn, findControl }: {
  card: ProcedureCard;
  perform: (action: ProcedureAction) => void;
  paused: boolean;
  resume: () => void;
  holdBurn: (held: boolean) => void;
  findControl: (target: CockpitTarget) => void;
}) {
  const current = card.steps.find((step) => step.current);
  const completed = card.steps.filter((step) => step.done).length;
  const held = useRef(false);
  const burnCallback = useRef(holdBurn);
  burnCallback.current = holdBurn;
  function burn(on: boolean) {
    held.current = on;
    burnCallback.current(on);
  }
  useEffect(() => () => {
    if (held.current) burnCallback.current(false);
    held.current = false;
  }, [current?.id, paused]);
  return (
    <section className="procedure-focus" aria-label="Current procedure">
      <div className="procedure-kicker"><span>FLIGHT DATA FILE</span><span>{card.system}</span></div>
      <h3>{card.title}</h3>
      <div className="procedure-progress">
        <span>{completed} / {card.steps.length} verified{paused ? " · PAUSED" : ""}</span>
        <progress value={completed} max={card.steps.length} aria-label={`${card.title} progress`} />
      </div>
      {current ? <>
        <p className="procedure-mode">{current.waiting ? "WAITING" : current.action || current.hold ? "CREW ACTION" : "MONITOR / VERIFY"} · STEP {card.steps.indexOf(current) + 1}</p>
        <h4>{current.call}</h4>
        <p className="procedure-instruction">{current.instruction}</p>
        {current.action && current.action in COCKPIT_TARGETS ? <button className="procedure-find" type="button"
          onClick={() => findControl(current.action as CockpitTarget)}>Find in cockpit · {COCKPIT_TARGETS[current.action as CockpitTarget].label}</button> : null}
        <dl className="procedure-state">
          <div><dt>LIVE</dt><dd>{current.response}</dd></div>
          <div><dt>REQUIRED</dt><dd>{current.expected}</dd></div>
        </dl>
        {current.waiting ? <p className="procedure-wait" role="status">{current.waiting}</p> : null}
        {/* A released hold must not become a click on the following step. */}
        {paused ? <button key={`resume:${current.id}`} className="procedure-action" type="button" onClick={resume}>Resume flight</button> : current.action ? <button key={`action:${current.id}`} className="procedure-action" type="button" disabled={!!current.waiting} onClick={() => perform(current.action!)}>
          {procedureActionLabel(current.action)}
        </button> : current.hold ? <button key={`hold:${current.id}`} className="procedure-action" type="button" disabled={!!current.waiting}
          onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); burn(true); }}
          onPointerUp={() => burn(false)} onPointerCancel={() => burn(false)} onLostPointerCapture={() => burn(false)}
          onKeyDown={(event) => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); burn(true); } }}
          onKeyUp={(event) => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); burn(false); } }}
          onBlur={() => burn(false)}>
          Hold deorbit burn
        </button> : <p className="procedure-auto">Advances when the condition is verified.</p>}
      </> : <p className="procedure-complete">✓ All steps verified</p>}
    </section>
  );
}
