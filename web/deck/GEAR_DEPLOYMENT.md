# Landing-gear travel and recovery

Previously the six-wheel assembly stayed hidden throughout the gear TRANSIT
indication and appeared fully extended at DN. It now follows the root
mechanism's continuous travel position. ARM alone keeps it hidden; each fitted
leg folds down during TRANSIT and settles at its existing down-lock position.
The exterior also stops inferring deployed gear from rollout/landed phase.

`mech.gear.position` is derived from the existing saved `gear_t` and state:
zero for UP/ARM, normalized transit time while extending, one at down-lock.
There is no separate display timer or checkpoint field. Pause and existing
checkpoint recovery therefore preserve the same fitted pose, including cold
reload and recovery from a different scenario. Only DN completes Gear down;
Find in cockpit remains an inspection action. The gear remains one-way.

## Evidence and limits

| Evidence | Use and limit |
| --- | --- |
| [NASA News Reference three-view, p. 3-6](https://www.nasa.gov/history/SP-4225/diagrams/shuttle/shuttle-diagram-4.htm), [original drawing](https://www.nasa.gov/wp-content/uploads/static/history/SP-4225/imagery/diagrams/shuttle/3-6_m.jpg), [cached bytes](review/gear-three-view.jpg) | Supports deployed tricycle arrangement and the airframe proportions already used here. It does not establish stow directions, hinge stations or travel curves. SHA-256 `d906b11c7443299b14ff2e415d94a73d266458a325dc9e808ee653facfe4cf30`. |
| [NASA/TM-2005-213860, Fig. 1, printed p. 2](https://ntrs.nasa.gov/api/citations/20050216395/downloads/20050216395.pdf) | Shows open main-gear doors and TPS breaks. This later Discovery reference cannot establish Columbia's 1981 geometry or exact deployment sequence. Retrieved original PDF SHA-256 `0da678ef709da5a2784856786c9559e19b7b5501c9307543d09c4aa29b53a216`. |
| Existing root mechanism | ARM → TRANSIT → DN, eight-second estimated transit, sticky down-lock and saved elapsed time. The eight seconds are not a newly validated historical duration. |

The motion is a fitted visual estimate: a common forward fold about a transverse
hinge at local Y=-0.75, smoothly mapped from root progress. It is **not a calibrated STS-1
kinematic reconstruction**. Existing braces move with each assembly; actuator
linkage articulation, actual wheel-well openings and sequenced TPS doors remain
unmodeled. Parts are occluded by the existing opaque airframe during travel;
stow containment is not certified. All six down-lock centers, tire detail,
transverse compensation and the Y=-2.4 contact datum are retained. Tire grooves
remain within 0.02 model units of that plane.

The flight/contact model is unchanged. In particular, the previously documented
command-keyed gear drag still leads down-lock. This pass validates presentation
and walkthrough continuity, not aerodynamic, historical or full-flight fidelity.

## Reproduce

From `web/deck`, run `npm test` and `npm run build`, then serve the preview.
`python3 tests/gear-deployment-browser.py --browser-executable /usr/bin/chromium`
uses real desktop/phone F6 ARM and DOWN picks, the native checklist and existing
time-advance probe. It inspects actual rendered matrices, wheel centers and tire
bounds; it cannot assign mechanism, flight or camera state. It checks pause,
cold/cross-scenario recovery, the TRANSIT wait and DN advancement. The existing
`tests/landing-browser.py` separately checks the approach through wheel stop.
Root `tests/systems.test.ts` checks command guards and derived publication;
architecture/checkpoint telemetry checks cover root ownership and recovery.

The [fixed checkpoint](review/gear-fixture.json) was saved through actual GUI
APU/ARM/DOWN commands at `gear_t=4.08`, progress 0.51. Restore it paused, then
select the public Tower/Chase views. Fixed captures must wait for the public
camera to settle; its normal easing otherwise makes an apparent pose difference.
`tests/gear-captures-browser.py` automates that paused recovery and settled-view
capture without assigning camera or simulation state.

| Public view | Original renderer | Root-driven transit |
| --- | --- | --- |
| Tower | [Before](review/gear-tower-before.png), [readout](review/gear-tower-before.json) | [After](review/gear-tower-after.png), [readout](review/gear-tower-after.json) |
| Chase | [Before](review/gear-chase-before.png), [readout](review/gear-chase-before.json) | [After](review/gear-chase-after.png), [readout](review/gear-chase-after.json) |

Baseline replay uses the original Orbiter renderer from `6aa3119` with the new
derived publication and harmless read-only probe support. Both sides restore
the same actual fixture at GET=55.000000000003, TRANSIT, progress 0.51, viewport
1280×800 and the unchanged 48° exterior lens. Settled camera positions differ
by less than 1e-9 model units. Camera/flight/control state is never assigned.
Opaque-wing occlusion is retained; these views do not prove well clearance.
[Phone recovery](review/gear-phone-transit.png) shows the real F6/checklist
TRANSIT wait after cold reload.

## Accepted scope

Production build and strict browser TypeScript, all ten web test programs, and
targeted root systems/architecture/checkpoint telemetry checks pass. Desktop and
390×844 phone browser checks pass real F6 picks, no-command Find, TRANSIT wait,
actual matrix/center recovery, DN and phone indication/action bounds. Actual
rendered tire bounds at DN are approximately -2.4048 (nose) and -2.4066 (mains).
The landing regression also passes tall/short phone bounds and the real approach
checklist through wheel stop. These browser checks report no page, console or
resource errors. The subsequent build/drag gate below supersedes the original
electrical diagnostic limitation; Vite retains its chunk-size warning.

## Mechanism drag and build gate, 2026-10-03

The former drag path read `ctl.gear` directly. An unarmed DN command added
full gear drag while the mechanism and six rendered wheels remained UP;
releasing DN after down-lock also removed that drag. Dynamics now reads
`mech.gear.position` and `mech.gear.down_locked`. The existing full-extension
drag coefficient is scaled linearly with progress **[estimated]**. No new
mechanism clock or saved field is introduced. Root restore republishes the
saved mechanism before Dynamics recomputes legacy telemetry, preserving
paused partial-extension recovery.

`tests/gear_drag.test.ts` covers unarmed DN, partial drag, one-way down-lock,
warm/cold restoration and legacy recomputation without changing time, pose,
effectors or heat. The standalone landing test now ticks the real mechanism
and allows the estimated eight-second transit before touchdown; it no longer
treats a DN command as proof of down-lock. All twelve root programs and ten
web programs pass. Desktop/phone real F6, checkpoint and landing regressions
exercise the unchanged root-owned rendered travel and checklist wait.

The eight electrical TS2367 diagnostics came from generic reads narrowed to
their fallback literals. Explicit string and boolean/number/string channel
types preserve the existing switch semantics and remove them. Generation now
requires successful root compilation with `noEmitOnError`; browser strict
TypeScript and the production build pass. The root generation project still
uses its existing non-strict mode. An intermediate failing compile was
verified to produce no generated runtime artifact. The old reported OMS test
failure was stale: the complete root suite passed before this gate's edits.

The next historical gate needs source-supported stow directions and hinge
stations, then actual wheel-well/TPS-door geometry and articulated links.
It must preserve this root ownership/recovery behavior while checking clearance
through the full travel, rather than accepting only the final deployed pose.
