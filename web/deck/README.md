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

**Checklist [C]** opens the flight-data-file reading aid in any camera view. A
new flight reopens it. It
shows the current instruction, verified progress, and separate **LIVE** and
**REQUIRED** indications. Named action buttons operate the existing controls;
monitored events advance only when the simulation confirms them. **All
procedures** expands the surrounding steps. Door indications follow the actual
talkback through **TRANSIT**; a closure step requires the closed latches, not
just an opening command being released. The paper styling is a presentation
choice, not a facsimile of a historical flight data file.

The card reports **PAUSED** and offers **Resume flight**. Moving doors and gear
show a wait message, and the gear-down button waits for the existing 190 m/s
speed limit. Each new step returns the reading area to the top.

For deorbit, open and then close/latch the bay doors, start the APUs, and hold
**Hold deorbit burn**, **B**, or cabin **THC +X** until live periapsis falls below
110 km. Release the input, select **Begin deorbit coast**, and monitor entry
interface at 121.92 km. These are the existing simulator procedure thresholds,
not a transcribed STS-1 burn target. Releasing, cancelling or hiding a checklist
burn button stops its held input. Actual OMS thrust drives the burn indication
and plume; selecting a command alone does not prove engine firing.

## What this is not

The runtime in `src/sim/runtime.ts` is a presentation facade over `RootAdapter`.
Shuttle truth lives in the repo root: bus, clock, dynamics, systems and
sequencer. Checklist controls use the existing crew-command API; reading a
card does not write trajectory or phase truth.

## Run and verify

```sh
npm ci
npm run dev
npm run build
```

Run these from this folder. The Vite build uses local assets and a relative
base URL, so it can be served from a subdirectory. `npm run typecheck` runs
TypeScript on the browser presentation and its existing browser model.

For the optional real-input walkthrough regression, install Python Playwright,
serve the built app with `npm run preview -- --host 127.0.0.1 --port 4173`, then
run `python3 tests/walkthrough-browser.py`. Use `--browser-executable` for a
system Chromium and `--output` for captures. The regression checks paused and
moving mechanisms, burn cancellation, deliberate cutoff-to-coast handoff,
entry interface, cabin/mobile checklist access, and the final-approach card
through gear transit and wheel stop. It accelerates time through the existing
controls probe; it does not assign flight truth.

See [VISUAL_ASSETS.md](VISUAL_ASSETS.md) for texture provenance, rendering
choices, and the boundary between this visual pass and a calibrated model.
