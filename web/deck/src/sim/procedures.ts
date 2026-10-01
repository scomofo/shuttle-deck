export type ProcedureAction = "fuel-cells" | "apu" | "doors-open" | "doors-close" | "gear-arm" | "gear" | "deorbit";

export type ProcedureStepView = {
  id: string;
  call: string;
  response: string;
  expected: string;
  instruction: string;
  done: boolean;
  current: boolean;
  action?: ProcedureAction;
  hold?: "burn";
  waiting?: string;
};

export type ProcedureCard = {
  id: string;
  system: string;
  title: string;
  steps: ProcedureStepView[];
};

type SimView = {
  phase: string;
  running: boolean;
  fuelCell: boolean;
  busVolts: number;
  apu: boolean;
  apuStarting: boolean;
  doorsOpen: boolean;
  doorsLatched: boolean;
  doorTalkback: string;
  gear: boolean;
  gearArmed: boolean;
  gearTalkback: string;
  burnActive: boolean;
  burnCommand: boolean;
  periapsisAlt: number;
  deorbitCommitted: boolean;
  srbAttached: boolean;
  get: number;
  altErr: number;
  speed: () => number;
};

type StepDef = {
  id: string;
  call: string;
  response: (s: SimView) => string;
  expected: string;
  instruction: string;
  ok: (s: SimView, latched: Set<string>) => boolean;
  latch?: boolean;
  action?: ProcedureAction;
  hold?: "burn";
  waiting?: (s: SimView) => string | undefined;
};

type ProcDef = {
  id: string;
  system: string;
  title: string;
  when: (s: SimView) => boolean;
  steps: StepDef[];
};

const later = new Set(["entry", "taem", "approach", "rollout", "landed"]);

function doorIndication(s: SimView): string {
  return s.doorTalkback === "OP" ? "OPEN" : s.doorTalkback === "CL" ? "CLOSED" : s.doorTalkback;
}

const PROCEDURES: ProcDef[] = [
  {
    id: "eps",
    system: "EPS",
    title: "Fuel cell to main bus",
    when: (s) => s.phase !== "landed",
    steps: [
      {
        id: "fc",
        call: "Fuel cells",
        expected: "ON",
        instruction: "Select the fuel cells ON, then verify the main bus indication.",
        response: (s) => (s.fuelCell ? "ON" : "OFF"),
        ok: (s) => s.fuelCell,
        action: "fuel-cells",
      },
      {
        id: "bus",
        call: "FC / MN bus",
        expected: "ON · >24 V",
        instruction: "Verify that the fuel cells are supplying the main bus.",
        response: (s) => (s.busVolts > 24 ? "ON" : "OFF"),
        ok: (s) => s.fuelCell && s.busVolts > 24,
      },
    ],
  },
  {
    id: "apu",
    system: "APU",
    title: "Hydraulics",
    when: (s) => s.phase === "ascent" || s.phase === "entry" || s.phase === "taem" || s.phase === "approach" || s.phase === "rollout" || !s.running,
    steps: [
      {
        id: "start",
        call: "APU start",
        expected: "RUN",
        instruction: "Start the APUs. Wait for RUN to confirm hydraulic power.",
        response: (s) => s.apu ? "RUN" : s.apuStarting ? "STARTING" : "OFF",
        ok: (s) => s.apu,
        action: "apu",
        waiting: (s) => s.apuStarting ? "APUs starting. Wait for RUN." : undefined,
      },
    ],
  },
  {
    id: "mps",
    system: "MPS",
    title: "Ascent",
    when: (s) => s.running && s.phase === "ascent",
    steps: [
      {
        id: "srb",
        call: "SRB sep",
        expected: "SEP",
        instruction: "Monitor ascent. This step completes when booster separation is confirmed.",
        response: (s) => (s.srbAttached ? "ATTACHED" : "SEP"),
        ok: (s) => !s.srbAttached && s.get > 20,
        latch: true,
      },
      {
        id: "meco",
        call: "MECO / ET sep",
        expected: "SEP",
        instruction: "Monitor main-engine cutoff and the transition to orbital flight.",
        response: (s) => (s.phase === "ascent" ? "BURNING" : "SEP"),
        ok: (s) => s.phase !== "ascent" && s.phase !== "pad",
        latch: true,
      },
    ],
  },
  {
    id: "plbd",
    system: "PLBD",
    title: "Payload bay doors",
    when: (s) => s.phase === "orbit" && !s.deorbitCommitted,
    steps: [
      {
        id: "open",
        call: "Doors",
        expected: "OPEN",
        instruction: "Open the payload bay doors and verify the OPEN indication.",
        response: doorIndication,
        ok: (s) => s.doorsOpen,
        latch: true,
        action: "doors-open",
        waiting: (s) => s.doorTalkback === "TRANSIT" ? "Doors moving. Wait for OPEN." : undefined,
      },
      {
        id: "close",
        call: "Doors for deorbit",
        expected: "CLOSED",
        instruction: "When ready for deorbit, close the bay doors. Wait through TRANSIT until CLOSED confirms the latches.",
        response: doorIndication,
        ok: (s, latched) => s.doorsLatched && latched.has("plbd:open"),
        latch: true,
        action: "doors-close",
        waiting: (s) => s.doorTalkback === "TRANSIT" ? "Doors moving. Wait for CLOSED and latched." : undefined,
      },
    ],
  },
  {
    id: "oms",
    system: "OMS",
    title: "Deorbit",
    when: (s) => s.phase === "orbit",
    steps: [
      {
        id: "apu",
        call: "APUs 2+3 for entry",
        expected: "RUN",
        instruction: "Start the entry APUs and wait for the RUN indication.",
        response: (s) => s.apu ? "RUN" : s.apuStarting ? "STARTING" : "OFF",
        ok: (s) => s.apu,
        action: "apu",
        waiting: (s) => s.apuStarting ? "APUs starting. Wait for RUN." : undefined,
      },
      {
        id: "burn",
        call: "Lower orbital periapsis",
        expected: "<110 km",
        instruction: "With bay doors latched, hold the burn button or B (THC +X in the cabin). Release when periapsis falls below 110 km; then begin the deorbit coast.",
        response: (s) => `${(s.periapsisAlt / 1000).toFixed(1)} km · ${s.burnActive ? "BURNING" : "IDLE"}`,
        ok: (s) => s.periapsisAlt < 110_000 || s.deorbitCommitted,
        latch: true,
        hold: "burn",
        waiting: (s) => !s.doorsLatched ? "Close and latch the bay doors before the burn." : undefined,
      },
      {
        id: "coast",
        call: "Begin deorbit coast",
        expected: "DEORBIT",
        instruction: "Release the burn input, then select Begin deorbit coast. This starts the simulator's deorbit sequence; entry follows at the actual entry interface.",
        response: (s) => s.deorbitCommitted ? "DEORBIT" : "ORBIT",
        ok: (s) => s.deorbitCommitted,
        latch: true,
        action: "deorbit",
        waiting: (s) => s.burnCommand ? "Release the burn input before starting the coast." : !s.doorsLatched ? "Close and latch the bay doors first." : s.periapsisAlt >= 110_000 ? "Lower periapsis below 110 km first." : undefined,
      },
      {
        id: "interface",
        call: "Entry interface",
        expected: "ENTRY",
        instruction: "Coast with the burn off. Entry starts when altitude falls below 121.92 km. Use the time-rate buttons to shorten the coast.",
        response: (s) => s.deorbitCommitted ? "COASTING" : "ORBIT",
        ok: (s) => later.has(s.phase),
        latch: true,
      },
    ],
  },
  {
    id: "entry",
    system: "ENTRY",
    title: "Entry config",
    when: (s) => s.phase === "entry",
    steps: [
      {
        id: "doors",
        call: "Bay doors",
        expected: "CLOSED",
        instruction: "Verify the payload bay doors are closed for entry.",
        response: doorIndication,
        ok: (s) => s.doorsLatched,
        action: "doors-close",
      },
      {
        id: "corridor",
        call: "Corridor",
        expected: "IN",
        instruction: "Monitor the entry corridor. Completion follows the live trajectory check.",
        response: (s) => (Math.abs(s.altErr) < 8000 ? "IN" : "OFF"),
        ok: (s) => s.get > 8 && Math.abs(s.altErr) < 8000,
        latch: true,
      },
    ],
  },
  {
    id: "taem",
    system: "TAEM",
    title: "Heading alignment",
    when: (s) => s.phase === "taem" || s.phase === "approach",
    steps: [
      {
        id: "hac",
        call: "On the cylinder",
        expected: "ON",
        instruction: "Follow the heading-alignment guidance and monitor the flight director.",
        response: (s) => (Math.abs(s.altErr) < 400 ? "ON" : "OFF"),
        ok: (s) => s.phase === "approach" || (s.get > 4 && Math.abs(s.altErr) < 400),
        latch: true,
      },
    ],
  },
  {
    id: "gear",
    system: "GEAR",
    title: "Landing",
    when: (s) => s.phase === "approach" || s.phase === "rollout" || s.phase === "landed",
    steps: [
      {
        id: "arm",
        call: "Gear arm",
        expected: "ARM",
        instruction: "Arm the landing gear before commanding it down.",
        response: (s) => (s.gearArmed || s.gear ? "ARM" : "SAFE"),
        ok: (s) => s.gearArmed || s.gear,
        latch: true,
        action: "gear-arm",
      },
      {
        id: "down",
        call: "Gear down",
        expected: "DN",
        instruction: "Command gear down within the permitted speed range, then verify DN.",
        response: (s) => s.gearTalkback,
        ok: (s) => s.gear,
        latch: true,
        action: "gear",
        waiting: (s) => s.gearTalkback === "TRANSIT" ? "Gear moving. Wait for DN." : s.speed() > 190 ? "Wait for speed at or below 190 m/s before lowering gear." : undefined,
      },
      {
        id: "stop",
        call: "Wheel stop",
        expected: "STOP",
        instruction: "Monitor rollout until the vehicle is stopped on the runway.",
        response: (s) => (s.phase === "landed" ? "STOP" : "ROLL"),
        ok: (s) => s.phase === "landed",
        latch: true,
      },
    ],
  },
];

export function buildProcedures(sim: SimView, latched: Set<string>): ProcedureCard[] {
  const cards: ProcedureCard[] = [];
  for (const proc of PROCEDURES) {
    if (!proc.when(sim)) continue;
    const steps: ProcedureStepView[] = [];
    let open = true;
    for (const step of proc.steps) {
      const id = `${proc.id}:${step.id}`;
      const ok = step.ok(sim, latched);
      if (step.latch) {
        if (ok) latched.add(id);
      }
      const done = step.latch ? latched.has(id) : ok;
      const current = open && !done;
      if (current) open = false;
      steps.push({
        id,
        call: step.call,
        response: step.response(sim),
        expected: step.expected,
        instruction: step.instruction,
        done,
        current,
        action: current ? step.action : undefined,
        hold: current ? step.hold : undefined,
        waiting: current ? step.waiting?.(sim) : undefined,
      });
    }
    cards.push({ id: proc.id, system: proc.system, title: proc.title, steps });
  }
  return cards;
}

export function activeCard(cards: ProcedureCard[]): ProcedureCard | null {
  return cards.find((card) => card.steps.some((step) => step.current)) ?? cards.at(-1) ?? null;
}

export function procedureActionLabel(action: ProcedureAction): string {
  return {
    "fuel-cells": "Set fuel cells ON",
    apu: "Start APUs",
    "doors-open": "Open bay doors",
    "doors-close": "Close bay doors",
    "gear-arm": "Arm landing gear",
    gear: "Lower landing gear",
    deorbit: "Begin deorbit coast",
  }[action];
}
