# Browser flight deck

A seated view of the forward station, driven by the root simulation. The cabin
represents the later MEDS cockpit; the STS-1 mission baseline is not a claim of
an STS-1-era cockpit. Panel groupings are sourced, while geometry and control
positions remain estimates.

Do not fold pitch, phase, and meshes back into `src/`. This folder does
not write `dyn.*` and it does not replace an owner.

## What is on the deck

New scenarios open in the commander-seat cabin. **Flight displays**,
**Overhead** and **Aft station** turn the seated eye toward the existing
geometry; **Forward view**, **Esc** or a double-click returns it. Drag to look
around. These are reading aids, not calibrated crew reach or lens settings.

**Controls [X]** opens the optional flat control console. It is a simulator aid,
not a historical panel facsimile. Its station labels relate its controls to the
physical cockpit:

| Panel | Station | On this deck |
|---|---|---|
| F6 | Commander, forward | ADI, altitude, Mach, alpha. Gear is ARM, then DN |
| F2 | Glare shield | CSS is retained as an inert control in this build |
| F7 | Center, forward | Caution and warning matrix, q, g |
| F8 | Pilot, forward | Heading, bus, OMS, and the gear talkback |
| CREW INPUT | Simulator aid | Pitch/roll stick and held OMS BURN |
| C3 | Center console | The open system procedure |
| R1 | Right console | FC/MN bus. ON means the cell is up and the bus is above 24 V |
| R2 | Beside the pilot | APU start. RUN means hydraulics are on the line |
| R13 | Aft, starboard | Payload bay doors. Open on orbit, closed before the burn |

The console's panel codes open a description on hover or click.

Procedures are by system (EPS, APU, MPS, PLBD, OMS, entry, TAEM, gear).
A step stays open until the vehicle matches it. The switch for that step
is the one outlined.

For modeled fuel-cell, APU, bay-door and gear actions, **Find in cockpit** turns
the seated view toward the real scene control and outlines it. Click that
control, or use the checklist's named action button. Finding a control does not
issue its command, pause the flight, or acknowledge its required condition.
On narrow screens, the instruction card becomes compact during inspection so
the highlighted control remains exposed; return forward for the full text.

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
**Hold deorbit burn**, **B**, or **OMS BURN** in Controls until live periapsis falls below
110 km. Release the input, select **Begin deorbit coast**, and monitor entry
interface at 121.92 km. These are the existing simulator procedure thresholds,
not a transcribed STS-1 burn target. Releasing, cancelling or hiding a checklist
burn button stops its held input. Actual OMS thrust drives the burn indication
and plume; selecting a command alone does not prove engine firing.
Closing the Controls drawer also releases its held burn. The 3D THC/RHC geometry
is inert; the simulator burn helper is not a modeled THC translation axis.

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

`python3 tests/cockpit-browser.py` checks actual 3D ray-picked bay-door, fuel-cell,
APU and gear controls, mobile exposure, drag versus click, Find without a
command, reading-view navigation and held-input cancellation. It reads projected
scene coordinates and advances time through the same existing probe. Use the
same `--base-url`, `--browser-executable` and `--output` options as the walkthrough
regression.

See [VISUAL_ASSETS.md](VISUAL_ASSETS.md) for texture provenance, rendering
choices, and the boundary between this visual pass and a calibrated model.
