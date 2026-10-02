# Columbia instrument conversion

The selected target is Columbia on STS-1 (1981). The cabin now has **four
monochrome CRTs** rather than eleven MEDS displays, with separate estimated ADI,
HSI, alpha/Mach and altitude/vertical-speed instruments at the forward crew
stations. The additional aft flat display is removed, and an estimated
discrete ADI is on the existing A6U panel group. This is a partial era conversion,
not a complete 1981 panel inventory or a dimensionally accepted reconstruction.

## Evidence

| NASA source | What it establishes | Boundary |
| --- | --- | --- |
| [Columbia OV-102 fact sheet, p. 1](https://www.nasa.gov/wp-content/uploads/2023/04/flights-columbia-03.pdf) | Columbia's 1999–2001 modification replaced 32 analog gauges and four CRTs with 11 MEDS displays. | Counts/era, not original instrument locations or dimensions. |
| [STS-1 photo S81-30419](https://www.nasa.gov/wp-content/uploads/2021/04/sts-1_launch_26_fd_2_sts1-1066-s81-30419_1.jpg), in [NASA's flight history](https://www.nasa.gov/history/40-years-ago-columbia-takes-flight/) | John Young at the forward station; discrete ball/tape instruments and the early panel finish are visible. | Oblique crew photograph, with documents and a person obscuring the panel; not a calibrated eye view. |
| [October 1980 Columbia photograph](https://www.nasa.gov/wp-content/uploads/2020/10/sts1-0459-noid-10.10.80.jpg), in [NASA's preparation history](https://www.nasa.gov/history/40-years-ago-six-months-until-the-sts-1-launch/) | Young/Crippen in Columbia before STS-1; physical display housings and cockpit density. | Oblique/partially obscured view; no measurement calibration. |
| [NTRS 19960050290, Figures 2 and 4 / printed pp. 12-8 and 12-10](https://ntrs.nasa.gov/api/citations/19960050290/downloads/19960050290.pdf) | The **existing baseline**, not the proposed redesign, labels three CRTs on F7 and ADI/gear on F6, with a corresponding pilot station; the aft baseline associates ADI with A6. | October 1995 report using Rockwell drawings and mockup measurements; it does not certify Columbia's exact 1981 arrangement. Proposed layouts in Figures 6–7 are not adopted. |

The source photos are credited to NASA. Local review copies: [STS-1](review/sts1-young-reference.jpg),
[October 1980](review/sts1-columbia-reference.jpg), and the report's
[baseline Figure 2](review/pre-meds-baseline-figure2.png) and
[aft Figure 4](review/pre-meds-baseline-figure4.png). These are reference
evidence, not new cockpit textures.

Downloaded-byte SHA-256 values (public endpoints retrieved 2026-10-01,
America/Edmonton):

```text
Columbia fact sheet  8c986ede4f6362446a0d2ce1a9b8ada84a6f2e62ba6c2071bf9b6ecaa27e128b
S81-30419            f3a68a14398ae55bc793a01e5a52832f94a1af0082667f744be4dbdeff56b4db
October 1980 photo  57894674f240412d59f4786c4ac15b374f77ba4af6edb21896dfd59b25383c8f
NTRS baseline PDF  843854be1f8fdbeb48776ab2de48b0f35d9efa6219b83c848317647b8027f419
```

## Live behavior and usability

The faces read the existing root-backed deck facade. Altitude converts to feet;
vertical speed converts metres/second to feet/minute, with positive climb and
negative descent. Mechanical-style pointers stop at the estimated face limits
and show **OFF SCALE** while numerical telemetry retains the real value. An
orbital altitude cannot wrap into a plausible landing indication.

ADI graphics use the modeled local pitch/bank. HSI shows local heading without
invented ILS/course/deviation needles. Source selectors remain inert because
their real inertial/reference behavior is not modeled. The CRTs explicitly
say **SIM DATA**: flight, systems and trajectory readouts are simulator aids,
not reconstructed GPC SPEC/DISP or BFS software. Clicking a CRT cycles these
readouts; dragging looks around without issuing a command or changing format.
The four CRTs share the panel-light preference with the discrete instruments.

**Flight instruments** reads F6; **Center CRTs** reads F7. Portrait reading
views fit the station between the actual checklist and navigation bounds.
This changes the estimated lens/crop, not the eye or vehicle. Physical Find
views keep their closer framing. Esc returns forward, including from dimmer
focus. The estimated center console is lower so it clears CRT3 from the seat.
The former MEDS HUD combiner and six-edgekey display housings are removed;
their earlier source record did not establish STS-1 hardware.

Bay-door, fuel-cell, APU and gear controls retain the root crew-command paths.
Checkpoints still restore paused with held inputs released and the current
checklist open. The faces repaint while paused after scenario or checkpoint
changes; they do not depend on vehicle time advancing.

## Rendering review

`tests/legacy-instruments-browser.py` captures 1600×900 seated forward,
instrument, center and aft views, plus 390×844 and 390×600 portrait readings.
The captures use actual GUI scenario starts, Pause, navigation, panel-light
controls and checkpoint restore. `capture-state.json` records their actual
GET, source/converted telemetry, reading FOV, viewport and scene projections.
Simulation start-to-pause timing is recorded rather than asserted identical
between runs. Default commander eye, seven-degree baseline and cabin
coordinates remain the existing estimates; portrait reading crops vary with
the available screen area.

The qualitative comparison checks the early CRT/discrete-instrument family
and the three-forward/one-aft CRT count. NASA's crew photos are not matched
eye/lens fixtures, so these captures do **not** establish photographic
alignment, original panel dimensions or a completed full-flight visual gate.

Final review renders: [forward](review/sts1-instruments-forward.png),
[commander instruments](review/sts1-instruments-reading.png),
[three center CRTs](review/sts1-instruments-center.png),
[390×844](review/sts1-instruments-mobile.png) and
[390×600](review/sts1-instruments-mobile-600.png). Their
[recorded states](review/sts1-instruments-capture-state.json) use the original
capture names described above.

## Validation, 2026-10-01

The production build and all six web test programs pass. Instrument tests cover
known SI conversions/signs, heading wrap, off-scale behavior, portrait framing
and real approach/orbit root states. Strict browser TypeScript passes; the root
generator still emits eight pre-existing electrical.ts TS2367 diagnostics,
and Vite retains its large-chunk warning. Root-source type cleanliness is not
claimed.

All five Chromium/SwiftShader browser regressions pass: physical cockpit picks,
orbit-to-entry and separate landing walkthrough, checkpoint recovery, strict
landing acceptance and legacy instruments. The instrument check ray-picks
CRT1 and CRT3, distinguishes drag/format selection, checks all four commander
instrument centers against real phone DOM occlusion, confirms the complete
short-phone Resume button, verifies paused scenario/restore updates and leaves
and returns to an outside view. It reports no page or console/shader errors.
Checkpoint and landing checks also report no resource errors; cockpit and
walkthrough checks report no page errors. Captures were visually inspected.
This does not establish full-mission historical calibration or native/headset
acceptance.

## Remaining gate

Obtain a mission-specific 1981 panel inventory and dimensioned cabin/crew-eye
record; reconstruct the remaining original gauges, overhead and side/aft
sections; then compare fixed views against references with known camera/eye
parameters. The current nine discrete instrument faces do not reproduce all
32 original analog gauges. Their housing sizes, positions, face scales,
reflectance and labels are estimates. Other panel sections and C/W legends
still derive from later JSC-26419/SCOM sources. Real ADI source switching,
display-driver/GPC selection, radar-altitude inputs, switch-level replication,
individual instrument power/failure behavior, headset sightlines/reach and
historical dimensional acceptance remain open.
