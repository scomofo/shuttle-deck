import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { getSimVersion, sim, subscribeSim } from "@/sim/runtime";
import { activeCard, procedureActionLabel } from "@/sim/procedures";

import { usePanelLight } from "./panel-lighting";

function useSim() {
  useSyncExternalStore(subscribeSim, getSimVersion, getSimVersion);
  return sim;
}

function useTip() {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  return {
    open,
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => {
      if (!pinned.current) setOpen(false);
    },
    onClick: () => {
      pinned.current = !pinned.current;
      setOpen(pinned.current);
    },
  };
}

function Tip({
  code,
  who,
  about,
}: {
  code: string;
  who?: string;
  about: string;
}) {
  const tip = useTip();
  return (
    <h3 onMouseEnter={tip.onMouseEnter} onMouseLeave={tip.onMouseLeave}>
      <button type="button" className="plate" aria-expanded={tip.open} onClick={tip.onClick}>
        {code}
        {who ? <span>{who}</span> : null}
      </button>
      {tip.open ? (
        <span className="about" role="tooltip">
          {about}
        </span>
      ) : null}
    </h3>
  );
}

function Face({
  code,
  who,
  label,
  about,
  children,
}: {
  code: string;
  who?: string;
  label: string;
  about: string;
  children: ReactNode;
}) {
  return (
    <section className="face" aria-label={label}>
      <Tip code={code} who={who} about={about} />
      {children}
    </section>
  );
}

function altLabel(m: number) {
  if (m > 20000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function heading() {
  return String(Math.round((((-sim.yaw * 180) / Math.PI) % 360 + 360) % 360)).padStart(3, "0");
}

function Paddle({
  label,
  on,
  talk,
  onClick,
  hold,
  cued,
  disabled,
}: {
  label: string;
  on: boolean;
  talk: string;
  onClick?: () => void;
  hold?: boolean;
  cued?: boolean;
  disabled?: boolean;
}) {
  const held = useRef(false);
  function burn(on: boolean) { held.current = on; sim.onKey("KeyB", on); }
  useEffect(() => () => { if (held.current) burn(false); }, []);
  return (
    <button
      type="button"
      className="paddle"
      data-on={on}
      data-cue={cued || undefined}
      disabled={disabled}
      onClick={hold ? undefined : onClick}
      onPointerDown={
        hold
          ? (event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              burn(true);
            }
          : undefined
      }
      onPointerUp={hold ? () => burn(false) : undefined}
      onPointerCancel={hold ? () => burn(false) : undefined}
      onLostPointerCapture={hold ? () => burn(false) : undefined}
      onBlur={hold ? () => burn(false) : undefined}
      onKeyDown={hold ? event => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); burn(true); } } : undefined}
      onKeyUp={hold ? event => { if (event.code === "Space" || event.code === "Enter") { event.preventDefault(); burn(false); } } : undefined}
    >
      <span>{label}</span>
      <i />
      <b>{talk}</b>
    </button>
  );
}

export function FlightDeck({ open }: { open: boolean }) {
  const live = useSim();
  const panelLight = usePanelLight();
  const stick = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  if (!open || live.view !== "cockpit" || !live.running || live.phase === "landed" || live.phase === "lost") return null;

  const bankDeg = (-live.bank * 180) / Math.PI;
  const pitchPx = live.pitch * 64;
  const busHot = live.fuelCell && live.busVolts > 24;
  const cards = live.procedures();
  const card = activeCard(cards);
  const cue = card?.steps.find((step) => step.current) ?? null;
  const hydro =
    live.phase === "ascent" ||
    live.phase === "entry" ||
    live.phase === "taem" ||
    live.phase === "approach" ||
    live.phase === "rollout";
  const legends = [
    { id: "FC BUS", on: !busHot },
    { id: "APU", on: hydro && !live.apu },
    { id: "BAY", on: live.doorsOpen && hydro && live.phase !== "ascent" },
    { id: "GEAR", on: live.phase === "approach" && !live.gear && live.y < 280 },
    { id: "HAC", on: live.phase === "taem" && Math.abs(live.altErr) > 400 },
    { id: "NRG", on: live.phase === "entry" && live.get > 8 && Math.abs(live.altErr) > 8000 },
    { id: "COMM", on: !!live.blackout },
  ];
  const ask = cue?.action;

  function moveStick(clientX: number, clientY: number) {
    const base = stick.current;
    const cap = knob.current;
    if (!base || !cap) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.32;
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
    <section id="cockpit-controls" className="flightdeck" aria-label="Flight deck controls" style={{ "--display-level": 0.65 + panelLight * 0.35 } as CSSProperties}>
      <div className="deck-light-row">
      <p className="deck-call">{live.callout && live.calloutT < 7 ? live.callout : "\u00a0"}</p>
      <span className="deck-helper-label">SIMULATOR CONTROLS · X / ESC TO CLOSE</span>
      </div>
      <div className="station">
        <Face
          code="F6"
          who="CDR"
          label="Panel F6"
          about="Simulator controls for the commander's forward station. The cabin has separate attitude, heading, alpha/Mach and altitude/vertical-speed instruments. This helper shows altitude in metres; the cabin instruments use feet. For gear, select ARM before DN. The down-lock indication follows the modeled extension transit, and deployment is blocked above 190 m/s."
        >
          <div className="adi-ball">
            <div className="adi-ball-inner" style={{ transform: `translateY(${pitchPx}px) rotate(${bankDeg}deg)` }}>
              <div className="adi-sky" />
              <div className="adi-gnd" />
            </div>
            <div className="adi-wings" />
          </div>
          <dl className="face-read">
            <div>
              <dt>ALT</dt>
              <dd>{altLabel(live.y)}</dd>
            </div>
            <div>
              <dt>M</dt>
              <dd>{live.mach.toFixed(2)}</dd>
            </div>
            <div>
              <dt>α</dt>
              <dd>{((live.alpha * 180) / Math.PI).toFixed(0)}°</dd>
            </div>
          </dl>
          <div className="gear-pair">
            <button type="button" className="guard" data-on={live.gearArmed} data-cue={ask === "gear-arm" || undefined} onClick={() => live.armGear()}>
              ARM
            </button>
            <button type="button" className="guard" data-on={live.gear} data-cue={ask === "gear" || undefined} onClick={() => live.toggleGear()}>
              DN
            </button>
          </div>
          <div>
            <Tip
              code="F2"
              about="Glare shield, just above these instruments. CSS is control stick steering. On, the rotational hand controller flies the vehicle. Off, guidance flies and the stick only perturbs that path. In this build the switch is inert: the root guidance has no control path for it, so the deck always flies with guidance holding the path."
            />
            {/*
              P4: rendered inert — the DAP auto flag lives inside the root
              guidance owner (src/systems/guidance.ts, out of bounds for P4)
              and no ctl.* channel drives it, so this switch cannot receive
              honest causality. The root always flies manual+auto: guidance
              holds the path and the stick perturbs it.
            */}
            <button type="button" className="guard css" data-on={false} aria-disabled="true" title="No DAP control path in this build">
              CSS
            </button>
          </div>
        </Face>
        <Face
          code="F7"
          label="Panel F7"
          about="Simulator alert summary for the center forward station. The cabin's three CRTs show flight, systems and trajectory readouts. These helper alerts report current conditions such as bus power, required APUs, open bay doors, gear and the simplified entry/approach corridor. They are not a reproduction of the original warning-panel inventory."
        >
          <div className="cw" aria-label="Caution and warning">
            {legends.map((lamp) => (
              <i key={lamp.id} data-on={lamp.on}>
                {lamp.id}
              </i>
            ))}
          </div>
          <dl className="face-read">
            <div>
              <dt>Q</dt>
              <dd>{(live.qbar / 1000).toFixed(1)}</dd>
            </div>
            <div>
              <dt>G</dt>
              <dd>{live.gLoad.toFixed(2)}</dd>
            </div>
          </dl>
        </Face>
        <Face
          code="F8"
          who="PLT"
          label="Panel F8"
          about="Simulator readout summary for the pilot station. The cabin has a corresponding set of dedicated flight instruments. This helper groups heading, bus voltage, OMS quantity and system indications for reading; the physical representative gear controls are on F6."
        >
          <strong className="hdg">HDG {heading()}</strong>
          <dl className="face-read">
            <div>
              <dt>BUS</dt>
              <dd>{live.busVolts.toFixed(1)}</dd>
            </div>
            <div>
              <dt>OMS</dt>
              <dd>{Math.round(live.omsProp * 100)}</dd>
            </div>
            <div>
              <dt>FC</dt>
              <dd data-on={busHot}>{busHot ? "ON" : "OFF"}</dd>
            </div>
            <div>
              <dt>APU</dt>
              <dd data-on={live.apu}>{live.apu ? "RUN" : live.apuStarting ? "STARTING" : "OFF"}</dd>
            </div>
            <div>
              <dt>GEAR</dt>
              <dd data-on={live.gear}>{live.gearTalkback}</dd>
            </div>
          </dl>
        </Face>
      </div>
      <div className="side-row">
        <Face
          code="CREW INPUT"
          label="Crew input helpers"
          about="Use the stick for pitch and roll. OMS BURN is the simulator's held deorbit input. With bay doors latched, follow the checklist's live periapsis target, release the burn input, then select Begin deorbit coast. This helper is not a physical THC translation controller."
        >
          <div
            className="rhc"
            ref={stick}
            aria-label="Rotational hand controller"
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
            <div className="rhc-knob" ref={knob} />
            <span>RHC</span>
          </div>
          <Paddle label="OMS BURN" on={live.burning()} talk={live.burning() ? "FIRING" : "IDLE"} hold cued={cue?.id === "oms:burn"} />
        </Face>
        <Face
          code="C3"
          label="Center console C3"
          about="Center console, between the seats, aft of the keyboards. The card clipped here is the flight data file: the open system procedure and the vehicle's live indications. Open Checklist for the current instruction and required indication."
        >
          {card ? (
            <div className="deck-proc">
              <header>
                <small>{card.system}</small>
                {card.title}
              </header>
              <ol>
                {card.steps.map((step) => (
                  <li key={step.id} data-current={step.current} data-done={step.done}>
                    <span>{step.call}</span>
                    <em title={`Live: ${step.response} · Required: ${step.expected}`}>{step.response}</em>
                    {step.action ? (
                      <button type="button" disabled={!!step.waiting || live.paused} aria-label={procedureActionLabel(step.action)} onClick={() => live.perform(step.action!)}>
                        Set
                      </button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </Face>
        <Face
          code="R1"
          label="Panels R1, R2, and R13"
          about="Right console, just forward of the pilot. FC/MN is the fuel-cell-to-main-bus contactor. The real switch is momentary: hold it until the talkback shows the contactor has latched. ON here means the cell is running and the bus is above 24 volts."
        >
          <Paddle
            label="FC/MN"
            on={live.fuelCell}
            talk={busHot ? "ON" : "OFF"}
            cued={ask === "fuel-cells"}
            onClick={() => {
              live.fuelCell = !live.fuelCell;
              live.notify();
            }}
          />
          <Tip
            code="R2"
            about="Immediately right of the pilot's seat, parallel to it, so it can be reached without looking away from F8. APU OPERATE START/RUN. Three hydrazine units drive the hydraulic pumps. RUN means those pumps are on the line — it lights after the spool-up, not the instant the switch moves. The real panel has a ready-to-start talkback for each unit. This switch is that start."
          />
          <Paddle
            label="APU"
            on={live.apu}
            talk={live.apu ? "RUN" : live.apuStarting ? "STARTING" : "OFF"}
            cued={ask === "apu"}
            disabled={live.apuStarting}
            onClick={() => {
              if (live.apu) { live.apu = false; live.notify(); }
              else live.perform("apu");
            }}
          />
          <Tip
            code="R13"
            about="Aft flight deck, starboard, not the forward station. Payload bay door switches. Open them on orbit so the radiators can cool the ship. Close them before the deorbit burn. Off orbit, they will not move."
          />
          <Paddle
            label="BAY"
            on={live.doorsOpen}
            talk={live.doorTalkback}
            cued={ask === "doors-open" || ask === "doors-close"}
            onClick={() => live.toggleDoors()}
          />
        </Face>
      </div>
    </section>
  );
}
