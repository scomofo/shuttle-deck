import { useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { getSimVersion, sim, subscribeSim } from "@/sim/runtime";
import { activeCard } from "@/sim/procedures";

import { setPanelLight, usePanelLight } from "./panel-lighting";

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
}: {
  label: string;
  on: boolean;
  talk: string;
  onClick?: () => void;
  hold?: boolean;
  cued?: boolean;
}) {
  return (
    <button
      type="button"
      className="paddle"
      data-on={on}
      data-cue={cued || undefined}
      onClick={hold ? undefined : onClick}
      onPointerDown={
        hold
          ? (event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              sim.onKey("KeyB", true);
            }
          : undefined
      }
      onPointerUp={hold ? () => sim.onKey("KeyB", false) : undefined}
      onPointerCancel={hold ? () => sim.onKey("KeyB", false) : undefined}
    >
      <span>{label}</span>
      <i />
      <b>{talk}</b>
    </button>
  );
}

export function FlightDeck() {
  const live = useSim();
  const panelLight = usePanelLight();
  const stick = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  if (live.view !== "cockpit" || !live.running || live.phase === "landed" || live.phase === "lost") return null;

  const bankDeg = (-live.bank * 180) / Math.PI;
  const pitchPx = live.pitch * 64;
  const busHot = live.fuelCell && live.busVolts > 18;
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
    <section className="flightdeck" aria-label="Flight deck" style={{ "--display-level": 0.65 + panelLight * 0.35 } as CSSProperties}>
      <div className="deck-light-row">
      <p className="deck-call">{live.callout && live.calloutT < 7 ? live.callout : "\u00a0"}</p>
      <label className="panel-light">PANEL LIGHT
        <input aria-label="Panel lighting" type="range" min="25" max="100" step="5" value={Math.round(panelLight * 100)}
          onChange={event => setPanelLight(Number(event.target.value) / 100)} />
        <output>{Math.round(panelLight * 100)}%</output>
      </label>
      </div>
      <div className="station">
        <Face
          code="F6"
          who="CDR"
          label="Panel F6"
          about="Commander's forward panel, left of the centerline. The ball is the attitude director indicator. Altitude and alpha/Mach are the dedicated instruments beside it, the set fed by the commander's display driver on main bus A. Landing gear is two guarded pushbuttons: ARM latches the extend valves and the door pyros, then DN fires them. DN does nothing until ARM, and it still will not drop the gear if you are fast."
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
              about="Glare shield, just above these instruments. CSS is control stick steering. On, the rotational hand controller flies the vehicle. Off, guidance flies and the stick only perturbs that path."
            />
            <button type="button" className="guard css" data-on={!live.auto} onClick={() => live.toggleAuto()}>
              CSS
            </button>
          </div>
        </Face>
        <Face
          code="F7"
          label="Panel F7"
          about="Center forward panel, between the two seats. The caution-and-warning matrix lives here, with the g-meter. A lamp means that condition is true now: fuel-cell bus, APU when hydraulics are required, bay doors open off orbit, gear still up on short final, off the heading-alignment cylinder, off the entry corridor, or no air-to-ground in blackout. A dark C&W is a quiet board."
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
          about="Pilot's forward panel, the right-hand mirror of F6. Heading, main-bus voltage, and OMS quantity are the instruments. Fuel cell, APU, and gear are talkbacks only. On the orbiter the pilot has a second ARM and DN pair here. This deck keeps the switches on F6 and the indication on F8."
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
              <dd data-on={live.apu}>{live.apu ? "ON" : "OFF"}</dd>
            </div>
            <div>
              <dt>GEAR</dt>
              <dd data-on={live.gear}>{live.gear ? "DN" : "UP"}</dd>
            </div>
          </dl>
        </Face>
      </div>
      <div className="side-row">
        <Face
          code="L2"
          label="Panel L2"
          about="Commander's left console, outboard of the seat. The rotational hand controller is pitch and roll. The translational controller's forward axis is +X. On orbit, holding +X is the OMS retrograde burn. Hold it until the deorbit card on C3 reads 95 m/s, and only with the bay doors closed."
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
          <Paddle label="THC" on={live.burning()} talk={live.burning() ? "+X" : "OFF"} hold cued={cue?.id === "oms:burn"} />
        </Face>
        <Face
          code="C3"
          label="Center console C3"
          about="Center console, between the seats, aft of the keyboards. The card clipped here is the flight data file: the open system procedure, the call, the response the vehicle is actually giving, and Do when that step is a switch on this deck."
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
                    <em>{step.response}</em>
                    {step.action ? (
                      <button type="button" onClick={() => live.perform(step.action!)}>
                        Do
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
            about="Immediately right of the pilot's seat, parallel to it, so it can be reached without looking away from F8. APU OPERATE START/RUN. Three hydrazine units drive the hydraulic pumps. RUN means those pumps are on the line. The real panel has a ready-to-start talkback for each unit. This switch is that start."
          />
          <Paddle
            label="APU"
            on={live.apu}
            talk={live.apu ? "RUN" : "OFF"}
            cued={ask === "apu"}
            onClick={() => {
              live.apu = !live.apu;
              live.notify();
            }}
          />
          <Tip
            code="R13"
            about="Aft flight deck, starboard, not the forward station. Payload bay door switches. Open them on orbit so the radiators can cool the ship. Close them before the deorbit burn. Off orbit, they will not move."
          />
          <Paddle
            label="BAY"
            on={live.doorsOpen}
            talk={live.doorsOpen ? "OP" : "CL"}
            cued={ask === "doors-open" || ask === "doors-close"}
            onClick={() => live.toggleDoors()}
          />
        </Face>
      </div>
    </section>
  );
}
