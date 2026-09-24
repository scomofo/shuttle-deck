export type ProcedureAction = "fuel-cells" | "apu" | "doors-open" | "doors-close" | "gear-arm" | "gear";

export type ProcedureStepView = {
  id: string;
  call: string;
  response: string;
  done: boolean;
  current: boolean;
  action?: ProcedureAction;
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
  doorsOpen: boolean;
  gear: boolean;
  gearArmed: boolean;
  dvDeorbit: number;
  srbAttached: boolean;
  get: number;
  altErr: number;
};

type StepDef = {
  id: string;
  call: string;
  response: (s: SimView) => string;
  ok: (s: SimView, latched: Set<string>) => boolean;
  latch?: boolean;
  action?: ProcedureAction;
};

type ProcDef = {
  id: string;
  system: string;
  title: string;
  when: (s: SimView) => boolean;
  steps: StepDef[];
};

const later = new Set(["entry", "taem", "approach", "rollout", "landed"]);

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
        response: (s) => (s.fuelCell ? "ON" : "OFF"),
        ok: (s) => s.fuelCell,
        action: "fuel-cells",
      },
      {
        id: "bus",
        call: "FC / MN bus",
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
        response: (s) => (s.apu ? "RUN" : "OFF"),
        ok: (s) => s.apu,
        action: "apu",
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
        response: (s) => (s.srbAttached ? "ATTACHED" : "SEP"),
        ok: (s) => !s.srbAttached && s.get > 20,
        latch: true,
      },
      {
        id: "meco",
        call: "MECO / ET sep",
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
    when: (s) => s.phase === "orbit",
    steps: [
      {
        id: "open",
        call: "Doors",
        response: () => "OPEN",
        ok: (s) => s.doorsOpen,
        latch: true,
        action: "doors-open",
      },
      {
        id: "close",
        call: "Doors for deorbit",
        response: () => "CLOSED",
        ok: (s, latched) => !s.doorsOpen && latched.has("plbd:open"),
        latch: true,
        action: "doors-close",
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
        call: "APU for entry",
        response: (s) => (s.apu ? "RUN" : "OFF"),
        ok: (s) => s.apu,
        action: "apu",
      },
      {
        id: "burn",
        call: "Retro burn",
        response: (s) => `${Math.min(95, Math.round(s.dvDeorbit))} / 95`,
        ok: (s) => s.dvDeorbit >= 95 || later.has(s.phase),
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
        response: (s) => (s.doorsOpen ? "OPEN" : "CLOSED"),
        ok: (s) => !s.doorsOpen,
        action: "doors-close",
      },
      {
        id: "corridor",
        call: "Corridor",
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
        response: (s) => (s.gearArmed || s.gear ? "ARM" : "SAFE"),
        ok: (s) => s.gearArmed || s.gear,
        latch: true,
        action: "gear-arm",
      },
      {
        id: "down",
        call: "Gear down",
        response: (s) => (s.gear ? "DN" : "UP"),
        ok: (s) => s.gear,
        latch: true,
        action: "gear",
      },
      {
        id: "stop",
        call: "Wheel stop",
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
        done,
        current,
        action: current ? step.action : undefined,
      });
    }
    cards.push({ id: proc.id, system: proc.system, title: proc.title, steps });
  }
  return cards;
}

export function activeCard(cards: ProcedureCard[]): ProcedureCard | null {
  return cards.find((card) => card.steps.some((step) => step.current)) ?? cards.at(-1) ?? null;
}
