# Shuttle Deck

Standalone Space Shuttle trainer. Own repo, own tree, own clock.

It uses the **same runtime contract** as
[scomofo/gemini-capsule](https://github.com/scomofo/gemini-capsule)
but it is not a fork, not a Godot add-on, and not a folder inside
that project. Clone this repo by itself.

Gemini Capsule is Godot 4.4 / OpenXR / Gemini IV. This repo is not a
skin of that cabin and it is not a single arcade class with shuttle
meshes. It is the Gemini ownership split pointed at an orbiter.

| Gemini owner | Shuttle owner | Truth |
|---|---|---|
| `src/core/bus.gd` | `src/core/bus.ts` | namespaced SI channels |
| `src/core/sim_clock.gd` | `src/core/clock.ts` | GET, 50 Hz, staged tickers |
| `src/core/sim_runtime.gd` | `src/core/runtime.ts` | snapshot / restore envelope |
| `src/dynamics/dynamics.gd` | `src/dynamics/dynamics.ts` | `r_eci`, `v_eci`, `q`, `omega`, mass |
| `src/mission/mission_sequencer.gd` | `src/mission/sequencer.ts` | phase transactions from JSON |
| `src/systems/*` | `src/systems/*` | electrical, MPS/OMS, DAP |
| presentation | (not truth) | cabin fixed; world inverted |

Read `docs/ARCHITECTURE.md` next to Gemini's `docs/ARCHITECTURE.md`.
The tick order, bus rules, driven-ascent handoff and checkpoint
envelope are copied on purpose.

## What is different from Gemini

- Vehicle: orbiter + ET + SRB, not a two-man capsule.
- Ascent profile is shuttle-shaped (SRB sep, MECO) but still **scripted
  until MECO**, same rule as Titan II in Gemini PHYSICS.md §3.6.
- Deorbit is OMS, not four solid retros.
- Entry aero is a delta-wing L/D schedule, still published on `aero.*`.
- Landing is a runway phase machine, not splashdown + chutes.

Coefficients that are not sourced are tagged `[estimated]`, same
discipline as Gemini's datum sheet.

## Test

```
npm test
```

Gates:

- tick stages run INPUT → MISSION → POWER_GUIDANCE → SYSTEMS → DYNAMICS → DEPENDENT
- `ctl.*` bumps `command_epoch`; `dyn.*` does not
- two-body circular orbit holds radius
- ascent is `driven`; insertion releases the propagator
- snapshot restore does not refire SRB sep
- electrical truth lives in the system, not in a leftover bus write
- orbiter reference area is the sourced 2690 ft²
- procedure runner rejects `set_channel` onto `dyn.*`
- pad → SRB sep → MECO → ET sep is a data procedure
- presenter inverts the world from the bus and never writes `dyn.*`

## Status

Core, sequencer, systems, sourced aero geometry, procedure runner,
cabin-fixed presenter. No Godot cabin and no WebGL layer yet — those
subscribe to the bus after the owners exist. Do not put pitch, phase
and meshes back into one class.
