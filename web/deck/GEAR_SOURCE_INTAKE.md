# Gear installation source intake

The next exterior fidelity gate is a visible wheel well and TPS-door assembly,
starting with the nose gear. The current renderer rotates each complete leg
through the same fitted 90-degree travel behind opaque skin. The root-owned
mechanism, drag, down-lock indication and checkpoint continuity work; that does
not establish physical clearance or historical installation geometry.

## Primary engineering reference

[NASA-CR-151370 / DMS-DR-2361, Volume I](https://ntrs.nasa.gov/citations/19770026309),
R. C. Mennell, July 1977, reports landing-gear loads on a 0.0405-scale 140C
orbiter model tested in September 1976. The
[original PDF](https://ntrs.nasa.gov/api/citations/19770026309/downloads/19770026309.pdf)
has 813 PDF pages and SHA-256
`25552f6e3052ef907743df1762e092b603fb1e7c4117cdf710de26d38e33463a`.
Its full-scale column describes the geometry represented by the test model;
it is not a measurement of Columbia as flown on STS-1.

The relevant pages were rendered directly from the PDF and visually inspected.
The scan has no useful embedded text. OCR is a reading aid, not the accepted
transcription: it misread drawing numbers, scale and lateral coordinates.
The [intake record](review/gear-source-intake.json) binds the retained page
images to their hashes and records the candidate source revision.

| Printed / PDF page | Retained evidence | What it supplies |
| --- | --- | --- |
| 23 / 28 | [Nose dimensions](review/gear-loads-1977-page23.png), Table III | G20 gear configuration, updated drawings V070-510001 and V070-510501; separate full/model-scale columns; strut pivot, axle and door hinge coordinates. |
| 24 / 29 | [Main dimensions](review/gear-loads-1977-page24.png), Table III continued | Main strut, wheel and door geometry in the same source coordinate system. |
| 34 / 39 | [Deployment diagram](review/gear-loads-1977-page34.png), Figure 1(d) | Separate nose/main gear and door sign conventions and both stowed/deployed outlines. The diagram labels full travel as theta_N=108 degrees and theta_M=98 degrees, rather than a common 90 degrees. |

The dimensional pages identify the G20 update from G17. Figure 1 is the
report's sign-convention illustration. Its angles must be reconciled with
the applicable model configuration and original drawing revisions before
being installed as Columbia values. Its source angle zero is the closed
position; the renderer's zero is down-lock. Those are different conventions.

## Comparison with this candidate

At `aaab1431054dd2651529d8fded32482399425610`:

- `src/game/gear-layout.ts` supplies one transverse pivot height, a shared
  90-degree smooth travel and three estimated deployed axle stations.
- `src/game/orbiter.tsx` rotates the braces, strut, axle and tires as one
  rigid assembly, and hides it at zero progress. Neither the nose skin nor
  wing mesh has a gear opening or a gear door.
- `src/game/gear-readout.tsx` measures actual hinges and tire bounds. It
  establishes recovery and the retained contact plane; it does not measure
  well clearance, door clearance or articulated linkage.
- The 2005 Discovery seal report retained in `GEAR_DEPLOYMENT.md` supports
  later TPS/seal topology. It cannot establish Columbia's 1981 installation.

The new report makes the engineering-source lead concrete. It does not
graduate the existing pivot, radius, travel curve or contact plane to sourced
historical values. No geometry, mechanism timing or coefficients change in
this intake.

## Next bounded implementation: nose well and two doors

1. Register the drawing's station axes and origin against the exterior
   reconstruction. Record drawing/configuration applicability and distinguish
   source-supported topology from any fitted dimensions. Preserve the existing
   tire contact datum until an independently checked replacement is available.
2. Cut an actual opening in the nose skin, add its recessed well and two
   hinged TPS-faced leaves, and check the complete rendered assembly through
   travel. Drive presentation only from `mech.gear.position`; estimated
   door/leg sequencing must remain labelled and must not add a second timer.
3. Reuse the real F6 ARM/DOWN path. Capture UP, intermediate extension and DN
   from fixed inspection poses with GET, camera, root progress and transforms
   recorded. Inspect the well internally as well as from Tower/Chase: opaque
   skin cannot serve as a clearance check.
4. Pass root gear-drag/mechanism checks, browser typecheck/build, the real
   desktop/phone gear and checkpoint recovery harnesses, and the landing
   regression through wheel stop. The checklist must still wait through
   TRANSIT, advance only at DN, and recover the same partial pose paused.

Completion means a reviewed, bounded nose assembly with no demonstrated
mesh interference and preserved walkthrough recovery. Main wells, real
actuator linkage, calibrated aerodynamics, full STS-1 reconstruction and
physical headset acceptance remain separate gates. This source intake is
complete; that implementation and historical acceptance have not been run.
