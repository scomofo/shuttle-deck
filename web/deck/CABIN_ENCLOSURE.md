# Enclosed Columbia presentation

The seated cabin previously consisted of floating panels with large gaps to
Earth/sky. A solid bar hid the overhead panel and overlapped nearly vertical
roof glazing. The cabin now has a continuous opaque floor, sidewalls, forward
surround, sloped brow, roof and aft bulkhead. Six forward, two overhead and two
aft openings are actual holes in those surfaces. The overhead controls are
exposed, roof glazing faces downward, and aft glazing sits in the bulkhead.
The nearby A8/RMS plate is moved into the estimated aft-console area so it
clears both aft windows from the commander eye.

This closes a visible presentation defect. The numerical envelope, finishes,
seams, window frames and workstation positions remain estimates. It does not
establish a dimensioned Columbia/STS-1 reconstruction.

## Evidence and limits

| Source | Supported use | Limit |
| --- | --- | --- |
| [NASA crew-station section, News Reference p. 5-5](https://www.nasa.gov/history/SP-4225/diagrams/shuttle/shuttle-diagram-10.htm) | Continuous flight-deck volume around forward panels and seats. | A general cutaway, not a calibrated 1981 crew-eye view. |
| [NASA crew arrangement, News Reference p. 3-9](https://www.nasa.gov/history/SP-4225/diagrams/shuttle/shuttle-diagram-7.htm) | Enclosed aft station with two viewing windows, surrounding consoles and floor. | General Shuttle arrangement, including later operational stations; not an STS-1 hardware inventory. |
| [NTRS 19960050290, existing baseline Figure 5 / printed p. 12-11](https://ntrs.nasa.gov/api/citations/19960050290/downloads/19960050290.pdf) | Existing floor-plan boundary and rising forward cabin section. | October 1995 mockup/Rockwell baseline. Its measured dimensions have not been transferred into this estimated seated rig. Proposed redesigns are not used. |
| [STS-1 and October 1980 crew photographs](HISTORICAL_INSTRUMENTS.md#evidence) | Early panel family and overall cockpit density. | Oblique/obscured photos without eye/lens calibration; the shell materials are artistic choices. |
| Later SCOM §1.2, retained source record | Six forward, two 20×20-inch overhead and two 14.5×11-inch aft clear-view windows. | The later-source overhead/aft sizes are retained; their positions and original 1981 dimensions are not certified. |

Review reference copies: [crew arrangement](review/crew-arrangement-reference.jpg)
and [existing baseline Figure 5](review/pre-meds-baseline-figure5.png). The
crew-arrangement image was retrieved from NASA's public
[image endpoint](https://www.nasa.gov/wp-content/uploads/static/history/SP-4225/imagery/diagrams/shuttle/3-9_m.jpg)
through the session proxy with verified HTTPS on 2026-10-02 UTC. It is reference
evidence, not a new runtime texture. The Figure 5 render uses the previously
retrieved baseline PDF; its downloaded-byte hash is in the instrument record.

```text
NASA crew arrangement JPEG  2c688a5d3bdeb6062c3902fc64922d5ddbc7629a085741133fef17afa6eae5c2
Local Figure 5 PNG render   3492fe433d365077fba3cacaebdeee60e1e375ea033c102085fe13b0e303bd27
```

## Geometry and crew paths

`cabin-layout.ts` shares the exact forward polygons between glazing and wall
cutouts. It preserves the prior landing sightline. The estimated envelope is
3 m wide, 1.86 m high at the roof and 2.38 m long; its forward brow rises into
the roof. Window centers, wall seams, gaskets and frame hardware are estimated.
The existing generated panel/blanket textures are reused, with quiet matte
metal and fabric finishes. There are no new runtime asset requests.

Opaque surfaces use triangulated apertures rather than transparent wall
patches. Read-only scene evidence raycasts their actual rendered geometry,
including clearance to all named instruments and physical crew targets. A
separate ray check verifies that overhead/aft window centers also clear the
actual panel plates, rather than merely lying inside the camera frustum. The
landing probe now checks both actual forward glazing and absence of an opaque
shell hit before it. These probes cannot move the camera, change the vehicle
or issue a command.

The fixed commander eye, seven-degree baseline, physical Find views, paired
APU/door/gear command paths and paused checkpoint recovery are retained.
Pointer look reaches both roof and aft window pairs without a screenshot-only
camera. The short-phone instrument reader keeps all four commander instrument
centers exposed and the whole Resume action inside the checklist card.

## Recovery telemetry

The fixed-state comparison exposed a root-owner checkpoint gap: dynamics saved
position/attitude/effectors but omitted its completed aero and g-load sample.
A warm restore reused a previous sample; a fresh-page restore showed zero
alpha until the next physics tick. This could give a misleading instrument
reading while the checklist correctly reported PAUSED.

New root checkpoints include an optional, copied telemetry sample and restore
it exactly before publication. Older schema-2 saves recompute aero telemetry
from saved owner state while paused; orbital/non-entry legacy restores clear
stale entry telemetry. Recovery advances neither time nor trajectory, effectors
or accumulated heat. Invalid/nonfinite samples are rejected, and the browser
retains its rollback and feedback behavior. The optional field preserves old
save compatibility. The repair belongs to Dynamics, not the cockpit painter.

## Fixed-state review

The committed [fixture](review/cabin-fixture.json) contains actual GUI-saved
approach and orbit checkpoints. Both before and after use GUI Restore, paused
vehicle state, 100% panel light, the same navigation targets and 1600×900
viewport, with 390×600 for phone recovery. Nine matching captures retain the
same GET, altitude, vertical speed, attitude and heading. The approach
angle-of-attack reading differs because the comparison exposed and this pass
fixes missing aero telemetry on a fresh paused restore; that value is not
claimed identical. The recorded legacy approach changes from the warm cached
0.2658206° to the recovered-state 0.3364454°; the pre-fix cold restore incorrectly
showed 0°. New checkpoints preserve their completed sample exactly. Root state is never directly assigned by the
capture harness. The additional roof/aft window views use recorded pointer
motions from the same seated eye.

- Overhead: [before](review/cabin-before-overhead.png), [after](review/cabin-overhead.png).
- Aft station on orbit: [before](review/cabin-before-aft.png), [after](review/cabin-aft.png).
- [Forward approach](review/cabin-forward.png) and [short-phone recovery](review/cabin-phone.png).
- [Roof pair](review/cabin-roof-windows.png) and [aft pair](review/cabin-aft-windows.png).
- [Recorded baseline states](review/cabin-before-capture-state.json) and
  [final states](review/cabin-capture-state.json).

These compare the defect against a fixed simulated seat state and the source
**topology**. NASA's drawings/photos do not provide a matched camera fixture,
so the captures establish neither photographic alignment nor historical
reflectance or dimensions.

## Validation

The final production build and all seven web test programs pass, including
ten aperture rays, opaque surrounding surfaces and a 2,400-direction complete
seat sphere. Six targeted root test programs pass: checkpoint telemetry,
architecture, aero, entry, presentation and systems. These cover exact warm/cold
instrument samples, legacy fallback, unchanged time/pose/effectors/heat,
non-aliasing and invalid-sample rejection. Whole-root `npm test` is not claimed.
Strict browser TypeScript passes. The supported generator retains its eight
pre-existing electrical.ts TS2367 diagnostics; Vite retains its chunk warning.

All six Chromium/SwiftShader browser regressions pass: cabin enclosure,
checkpoint recovery, legacy instruments, landing acceptance, physical cockpit
picks and flight walkthrough. The walkthrough reaches entry from orbit and
wheel stop from a separate approach; it does not calibrate a full historical
mission. Fixed cabin acceptance checks all ten shell apertures, crew-target and
instrument shell clearance, roof/aft panel clearance, actual pointer look,
unchanged commander eye/paused GET, exact new Save/reload/Restore alpha,
landing visibility and bounded short-phone recovery.

Cabin, checkpoint and landing checks report no page, console/shader or resource
errors. Instrument acceptance reports no page/console errors; cockpit and
walkthrough checks report no page errors. Checkpoint notification dismissal
uses native keyboard focus/Space and verifies it disappears, avoiding a race
with automatically expiring success feedback during software rendering.
Final review captures were visually inspected.

## Remaining gate

The next visual gap is the panel assembly itself: side/aft workstations still
float within the enclosed volume, their mounting and support geometry is
estimated, and several panels remain section-level placeholders. Reconstruct
those assemblies against the existing baseline and mission-specific 1981
inventory, then complete the original gauge set and overhead/side/aft panel
era conversion. Exterior bay/door sightlines through aft glazing also need
reconstruction; the seated renderer still hides the exterior orbiter. The real forward structure wraps in three dimensions; this
planar windshield estimate remains unresolved. Middeck access, ejection-seat
hardware, measured crew eye/reach, calibrated complete flight and headset
acceptance remain open.
