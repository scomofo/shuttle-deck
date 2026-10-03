# Browser flight deck

A seated view of the forward station, driven by the root simulation. The
selected reconstruction target is **Columbia on STS-1 (1981)**. Four monochrome
CRTs and dedicated flight instruments now replace the later MEDS presentation.
This is a partial era conversion: geometry, scales and crew-control positions
remain estimates, and other panel sections still use later references. See
[HISTORICAL_INSTRUMENTS.md](HISTORICAL_INSTRUMENTS.md) for NASA evidence, captures
and the remaining historical gates. The enclosed cabin now has opaque walls,
roof and floor around six forward, two overhead and two aft apertures. See
[CABIN_ENCLOSURE.md](CABIN_ENCLOSURE.md) for the fixed-state comparison and
source limits.
Side and aft plates now share continuous floor/wall console backing; see
[WORKSTATIONS.md](WORKSTATIONS.md) for the remaining inventory and dimensional
limits, fixed captures and physical control validation.
The aft windows now reveal a root-driven payload bay and door-mounted
radiators. [PAYLOAD_BAY.md](PAYLOAD_BAY.md) records the original STS-1 evidence,
observation view, paused recovery and dimensional limits.

The landing scene presents Rogers Dry Lake runway 23. The synthetic approach
placement, surface finish and markings remain estimates. See
[LANDING_VIEW.md](LANDING_VIEW.md) for provenance and review captures.

Do not fold pitch, phase, and meshes back into `src/`. This folder does
not write `dyn.*` and it does not replace an owner.

## What is on the deck

New scenarios open in the commander-seat cabin. **Flight instruments**, **Center CRTs**,
**Overhead** and **Aft station** turn the seated eye toward the existing
geometry; **Forward view**, **Esc** or a double-click returns it. Drag to look
around. These are reading aids, not calibrated crew reach or lens settings.

**Bay windows** moves to an estimated observation point inside the aft window
to watch the bay and doors. **Esc**, **Forward view**, double-click and
checklist **Find** return to the commander seat. The doors follow their real
continuous travel position, including pause and restored checkpoints.

During terminal flight, **Approach guides** toggles the simulator heading-alignment
gates and glide-slope lights. It defaults off and remembers your preference.
The checklist works with either setting. **Esc** returns forward even when the
panel-light slider has focus.

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
The full checklist and header fit the phone width. Short screens scroll the
card above the cockpit toolbar so the current action stays reachable.

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

The header's **Save checkpoint** and **Restore checkpoint** buttons work on
desktop and phones; **F5** and **F9** also work from a focused panel-light slider.
There is one checkpoint in this browser's site storage. Saving replaces it.
Restoring works after a reload or a different scenario, preserves the saved
runway placement, switch commands and verified checklist history, and opens
the checklist **paused**. Review the current instruction, then select **Resume
flight**. Recovery returns to the top of the current instruction and closes
the expanded procedure overview, even when the saved step is unchanged.
Held burn, hand-control and momentary-button inputs are released;
the Controls drawer closes and the seated view returns from inspection.
APU spool and door transit continue from their saved states when resumed.

Older v3 checkpoints remain readable but omitted the render frame, switch
positions and checklist history. They restore paused with a warning: check
the indications and configure the controls before resuming. Their scenario
origin is recovered; any missing terminal placement is estimated again.
Missing, incomplete, incompatible and blocked-storage saves report a visible
message. A failed restore keeps the current flight and does not delete the save.
See [checkpoint evidence and captures](CHECKPOINT_RECOVERY.md).

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

`python3 tests/landing-browser.py` checks the actual threshold ray through a
forward window, default/persisted approach-guide preference, slider-focused Esc,
desktop/mobile rendering, and the final-approach checklist through wheel stop.
It also checks browser/shader errors and failed asset requests, using the same
CLI options and time-advance probe.

`python3 tests/checkpoint-browser.py` checks desktop/phone recovery, a different
scenario and fresh-page restore, slider-focused F5/F9, checklist rewind and
saved history, APU/door command continuity, held-burn release, and missing,
corrupt, legacy and blocked-storage feedback. It uses real inputs and the same
CLI options. `npm test` includes owner-backed checkpoint tests as well as the
existing exhaust, timer, procedure and render-frame checks.

`python3 tests/cabin-shell-browser.py` reuses committed GUI checkpoints for
fixed forward, overhead, aft and phone views. Ordinary pointer look exposes
both roof and aft apertures. It raycasts the actual opaque shell to check all
ten windows and the crew controls/instruments, retains the commander eye,
and checks landing visibility and short-phone recovery. Use the same browser
options; `--record-fixture --fixture <path>` records new GUI checkpoints.
The probe also checks console housings, panel plates and seats for obstruction
of all named crew controls and instrument centers, and of the roof/aft window
centers. `npm test` includes 2,400-direction cabin-continuity rays, closed
floor-connected workstation volumes and backing/visibility samples across
all eleven mounted faces. See [workstation evidence](WORKSTATIONS.md).

`python3 tests/payload-bay-browser.py` checks actual bay sightlines through
glazing, real door commands and reversal, paused/cold partial-travel recovery,
shared exterior hinges, proper chase attitude and short-phone Find/close.
`npm test` also checks bay surfaces and root-owned travel/recovery. See
[payload bay evidence](PAYLOAD_BAY.md).

See [VISUAL_ASSETS.md](VISUAL_ASSETS.md) for texture provenance, rendering
choices, and the boundary between this visual pass and a calibrated model.
