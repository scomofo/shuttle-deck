# Architecture

This project is a **Space Shuttle** simulation that uses the same runtime
contract as [scomofo/gemini-capsule](https://github.com/scomofo/gemini-capsule)
`docs/ARCHITECTURE.md`. The vehicle, procedures and aero change. The ownership
rules do not.

Gemini Capsule is Godot / OpenXR / Gemini IV. Shuttle Deck is the same split
applied to an orbiter: bus, clock, dynamics, systems, mission, presentation.
Nothing in the 3D tree is spacecraft truth.

## 1. Layout (mapped 1:1 from Gemini)

```
src/
  core/          # Bus, SimClock, SimRuntime, Units, Frames
  dynamics/      # ECI propagator, attitude, atmosphere, aero, mass
  systems/       # electrical, MPS/SSME, SRB, OMS, RCS, DAP/guidance, ECS
  mission/       # Mission profile + MissionSequencer + procedures
  presentation/  # world / cabin / HUD — consume Bus only
assets/
  data/
    cockpit/     # channels.csv — namespaced system.component.quantity
    missions/    # mission.json + ascent.json + procedures
    spacecraft/  # mass_properties, aero, thrusters, electrical
docs/
tests/
```

## 2. Runtime tree

```
SimRuntime
├── SimClock                 GET, fixed step, rate, pause
├── Bus                      namespaced channels, not the save store
├── Dynamics                 r_eci, v_eci, q, omega, mass  (not a mesh)
├── Systems                  electrical, MPS, SRB, OMS, RCS, guidance, ECS
├── MissionSequencer         phase transactions from mission.json
└── Presentation             cabin stays at the origin; world is inverted
```

The cabin / orbiter visual is the render frame. Earth, runway and stars are
placed from `dyn.r_eci_m` and `guid.att` through `Frames`. No `Node3D` /
`Object3D` transform is authoritative state.

## 3. Bus

`src/core/bus.ts` is the Gemini bus:

- `set_value` / `get_value` / `subscribe`
- emit only on change
- `ctl.*` writes bump `command_epoch` so the clock will not take a coarse
  coast step across a new command
- quantities on the bus are SI; instruments convert at display
- Bus is a projection. Owners keep internal truth and republish after
  initialize / restore. A system must not read its own channel to recover
  state after reset.

Namespaces (same categories as Gemini §3.1):

```
ctl.*        crew / input commands
mission.*    phase, latched events
seq.*        sequencer commands and config
sys.*        cross-system flags (coast_ok, controls_locked)
elec.*       electrical truth
prop.*       MPS / SRB / OMS / RCS truth
guid.*       DAP / IMU / rates / LVLH attitude
dyn.*        dynamics truth (frame in the name)
aero.*       derived aero at the dynamics boundary
present.*    presentation-only, never fed back
```

## 4. Tick order (ARCHITECTURE.md §7.1)

`SimClock.add_ticker(fn, Stage)` — registration order does not matter.

1. INPUT            freeze `ctl.*` for the step
2. MISSION          time/phase events fire exactly once
3. POWER_GUIDANCE   buses, DAP mode, actuator demands
4. SYSTEMS          MPS / SRB / OMS / RCS interpret commands
5. DYNAMICS         integrate forces / torques
6. DEPENDENT        tanks, heat, timers from the new truth
7. publish          owners write the completed-step snapshot
8. present          HUD / world / audio read the bus off the truth path

## 5. Dynamics

State is the Gemini vector, not a flat ENU arcade frame:

```
r_eci  m
v_eci  m/s
q      body from ECI
omega  body rad/s
m      kg
```

Gravity is point-mass + optional J2 (`mu = 3.986004418e14`). Atmosphere
relative velocity includes Earth rotation. Ascent is a **scripted profile**
until MECO (same rule as Titan II in Gemini PHYSICS.md §3.6). The propagator
takes over at a defined insertion state; that handoff is a test, not a snap
that invents a circular orbit.

Entry aero is shuttle-specific (delta wing, L/D schedule, bank steering).
The module still publishes Gemini-shaped channels: `aero.q_dyn_pa`,
`aero.alpha_deg`, `aero.blackout`, `guid.bank_deg`.

## 6. Mission phases are transactions

`assets/data/missions/sts_template/mission.json` owns:

- entry preconditions
- one-shot events (SRB sep, MECO, ET sep, deorbit, gear)
- configuration changes (stack / orbit / entry mass properties)
- resulting phase id
- completion conditions

The sequencer latches one-shots so a restore across a boundary cannot
fire SRB sep twice. Branches outrank the default `next`.

## 7. Snapshot

```json
{
  "schema_version": 1,
  "mission_id": "sts_template",
  "mission_data_version": 1,
  "clock": {},
  "mission": {},
  "dynamics": {},
  "systems": {},
  "controls": {},
  "bus": {}
}
```

Serialize truth. Do not serialize mesh transforms, floating-origin offsets,
or HUD needle angles. Restore is paused: clock → mission → dynamics →
systems → controls, then every owner `publish_state()` / `tick(0)` before
the clock runs again.

## 8. Procedures

`src/mission/procedures.ts` is Gemini's procedure runner. Definitions live
in `assets/data/missions/sts_template/procedures/`. See
`docs/MISSION_PROCEDURE_TESTING.md`.

## 9. Presentation

`src/presentation/presenter.ts` reads `dyn.r_eci_m` and publishes only
`present.*`. The cabin stays at the origin; the world vector is the inverse
of ECI position. Mutating the presenter must not change dynamics.

## 10. What this is not

This is not a single `ShuttleRuntime` class that owns pitch, phase, HUD and
meshes. That was the first pass. It violated every ownership row in Gemini
§10. This tree is the second pass.
