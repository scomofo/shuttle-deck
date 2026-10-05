# Nose well and TPS doors

The exterior now has an actual opening in its nose skin, a recessed lined well,
two TPS-faced leaves and a folded nose assembly behind them. Opening the doors
reveals the well instead of exposing tires through an opaque fuselage. The nose
drag brace has a folding knee; the down-locked wheel centers, tire radii and
contact plane retain their prior positions.

The geometry and motion are **estimated presentation fits**. This closes the
bounded software/visual nose-assembly gate; it does not close Columbia's
historical installation or kinematic calibration.

## Engineering evidence and registration limit

The [source intake](GEAR_SOURCE_INTAKE.md) retains NASA-CR-151370's printed
pp. 23, 24 and 34, with original PDF and page-image hashes. Table III identifies
a preflight G20 wind-tunnel model updated from G17 and drawings V070-510001 /
V070-510501. Its nose configuration has two side doors and a forward/up stow
direction. Figure 1(d) supplies separate gear/door sign conventions.
The 1999 NASA mechanism proceedings describe the existing nose gear's two
linked TPS-covered doors and forward/up ground retraction (NASA/CP-1999-209259,
printed pp. 374-375, [NTRS 19990053852](https://ntrs.nasa.gov/citations/19990053852)).
The later report is corroborating topology, not an STS-1 dimension authority.

A longitudinal registration was evaluated against the existing three-view
length fit. The renderer's +Z is forward; the listed source X0 station
increases from nose gear to main gear. The current 26.08-unit / 37.24-m length
conversion gives 0.01778818475 model units per source inch. Anchoring the
source nose axle X0=370.167 to rendered Z=8.25 predicts the main axle at
Z=-6.02157, versus the current fitted -5.25. This residual is approximately
1.10 m under that conversion. A full drawing-to-render datum is therefore
**not accepted**, and the report's installation coordinates are not copied
into the runtime.

The nose arc uses a fitted 108-degree stow lead guided by the diagram. Its
down-lock pose stays vertical rather than applying the source's strut lean.
The leaves use an 88-degree fitted opening to clear the existing tire envelope;
this is not the diagram's nose-door angle. Well dimensions, hinge axes,
thresholds, support links, finishes and articulation remain estimates. Main
gear still uses its prior fitted motion and has no well/door reconstruction.

## Runtime ownership and appearance

`mech.gear.position` remains the only travel input. The leaves open over the
first 18 percent of that progress; the nose leg starts after 22 percent, with
bounded acceleration, middle travel and deceleration. These fractions are
estimated sequencing, not added root states or timing. Pause, quick/cold
restore and a different scenario's restore therefore reproduce the same pose.

The old whole-assembly nose braces are replaced by a two-link fitted support
connecting a fixed well anchor to the moving strut. Intentional pin/strut
connections are not independent linkage physics. F6 ARM/DOWN, TRANSIT/DN,
one-way down-lock, root drag and the checklist's wait/advancement remain on
the existing command/owner paths.

The skin is clipped at the well opening; its UVs, interpolated normals and
existing payload-bay cutout are retained. Door TPS and thresholds share the
surrounding skin's UV scale. The original approved tile map supplies the
exterior finish. The well lining, ribs, hinge pins and metallic finishes are
estimated. The stowed nose geometry is present inside the closed well;
visibility flags alone are not proof that its tires are exposed.

## Fixed review evidence

| Observed GUI state | Underside | Internal well inspection |
| --- | --- | --- |
| UP, paused | [Closed](review/nose-well/nose-up-underside.png) | [Stowed](review/nose-well/nose-up-internal.png) |
| TRANSIT, paused | [Extending](review/nose-well/nose-transit-underside.png) | [Travel](review/nose-well/nose-transit-internal.png) |
| DN, paused | [Down-locked](review/nose-well/nose-dn-underside.png) | [Extended](review/nose-well/nose-dn-internal.png) |

These are supplementary fixed inspection cameras with their own lighting,
not historical eye matches or public gameplay camera captures. The tool uses
the production meshes at positions observed by the real F6 browser harness.
It rejects hinge/door matrices that differ from the gameplay readout by more
than 1e-12. The [capture record](review/nose-well/nose-captures.json) records
those observed GETs/positions, body camera/target, lens, viewport, source hashes
and image hashes. [Observed states](review/nose-well/observed-states.json)
retain the actual gameplay leg, door and brace matrices.

The public views separately restore the unchanged actual
[partial checkpoint](review/gear-fixture.json) and wait for normal camera
easing to settle. [Before Tower](review/nose-well/before-tower.png) /
[after Tower](review/nose-well/after-tower.png) and
[before Chase](review/nose-well/before-chase.png) /
[after Chase](review/nose-well/after-chase.png) have equal GET, root progress,
viewport and lens, with settled camera differences below 1e-8.
The [public comparison record](review/nose-well/public-comparison.json)
retains state/image hashes and the measured camera differences. The old
opaque nose and shared 90-degree fit are the baseline `e3054b1`.

## Acceptance and reproduction

`tests/nose-well.test.ts` uses the production geometry in its compensated
airframe hierarchy. Independent rays check the real skin opening, surrounding
opaque skin, closed TPS cover and depth of the open well. Actual stowed mesh
vertices fit within the independently specified well envelope. The leg,
support and leaves are checked against skin/well/door triangle surfaces at
101 progress samples. An intentionally intrusive door must fail the same
intersection detector. The check covers sampled non-coplanar surface
intersections; it is not a continuous swept-volume or historical clearance
certification. Intentional hinge hardware and joins are separate from the
well/skin obstacles.

All eleven web test programs, root gear-drag/mechanism programs and the
production/strict browser build pass. Real desktop/phone F6, paused cold and
cross-scenario recovery, checkpoint keyboard/GUI recovery and landing through
wheel stop pass. Browser checks report no page, console or resource errors.
The production build retains Vite's chunk-size warning. Native headset and
full-mission historical acceptance remain unperformed.

From `web/deck`, run `npm test` and `npm run build`, then start the preview:

```sh
python3 tests/gear-deployment-browser.py --browser-executable /usr/bin/chromium --output OUTPUT/gear
python3 tests/gear-captures-browser.py --browser-executable /usr/bin/chromium --output OUTPUT/public
python3 tests/checkpoint-browser.py --browser-executable /usr/bin/chromium
python3 tests/landing-browser.py --browser-executable /usr/bin/chromium
```

For the independent inspection page, start `npm run dev -- --host 127.0.0.1`:

```sh
python3 tools/nose-review.py OUTPUT/gear/states.json OUTPUT/inspection
```

The next exterior implementation gate is the main wells/doors with their
different installation and travel; historical station registration and real
actuator/door linkage remain calibration gates. Apollo's console enclosures
and Gemini's crew-station calibration continue on their separate repo tracks.
