# Browser flight deck

A seated view of the forward station. It is presentation. It is not the
bus, the clock, or the dynamics in `src/`.

Do not fold pitch, phase, and meshes back into `src/`. This folder does
not write `dyn.*` and it does not replace an owner.

## What is on the deck

The panels follow the real station, not a single row of switches.

| Panel | Station | On this deck |
|---|---|---|
| F6 | Commander, forward | ADI, altitude, Mach, alpha. Gear is ARM, then DN |
| F2 | Glare shield | CSS. On, the stick flies. Off, guidance flies |
| F7 | Center, forward | Caution and warning matrix, q, g |
| F8 | Pilot, forward | Heading, bus, OMS, and the gear talkback |
| L2 | Left console | Rotational hand controller. THC +X is the OMS burn |
| C3 | Center console | The open system procedure |
| R1 | Right console | FC/MN bus. ON means the cell is up and the bus is above 24 V |
| R2 | Beside the pilot | APU start. RUN means hydraulics are on the line |
| R13 | Aft, starboard | Payload bay doors. Open on orbit, closed before the burn |

Panel codes open a description on hover or click. They do not sit in the layout.

Procedures are by system (EPS, APU, MPS, PLBD, OMS, entry, TAEM, gear).
A step stays open until the vehicle matches it. The switch for that step
is the one outlined.

## What this is not

The runtime in `src/sim/runtime.ts` here is a flat browser model so the
deck can be flown. Shuttle truth still lives in the repo root: bus,
clock, dynamics, systems, sequencer. Wiring this deck to those channels
is later work.
