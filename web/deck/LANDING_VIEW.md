# STS-1 landing presentation

The selected historical target is **OV-102 Columbia on STS-1 (1981)**.
The repository's [mission identity](../../assets/data/missions/sts1/mission.json)
names Edwards AFB runway 23 on Rogers Dry Lake. The browser previously showed
generated wetlands, a concrete strip, paved shoulders and permanent airport
lights. That environment contradicted the selected landing site.

## Source boundary

| Item | Evidence | Implementation boundary |
| --- | --- | --- |
| Rogers Dry Lake, runway 23 | STS-1 mission `identity.landing_site` and `runway.id/name` | Dry-clay appearance and runway identifier. |
| Runway anchor and bearing | Mission `runway._note` explicitly marks geographical coordinates and heading as estimates | The browser retains its synthetic final-approach scenario; it does not place surveyed Edwards geography. |
| Surface finish and paint | No dimensioned historical surface/marking record is bundled | Procedural clay color, mottling, seams, paint shapes and locations are artistic estimates. The existing 5200 × 90 m footprint remains estimated. |
| Seated view | Actual cabin/window meshes and simulated body attitude | The threshold ray passes through the estimated main window opening. This is an internal sightline check, not a reference-photo camera solve. |

NASA web retrieval returned HTTP 403 under the current cloud network policy.
The environment draft now includes `www.nasa.gov` and `ntrs.nasa.gov`; saving
that draft has not applied its network policy. No external simulator geometry,
textures or code were copied into this repository.

## Behavior

The terminal scene uses procedural dry-clay shading with stable local coordinates
and distance-filtered fine seams. The wetland asset is retained as an unused
original; it is no longer downloaded by the application. White broken markings
and the runway number sit directly on the lakebed. Concrete, slab joints, paved
shoulders, tire deposits and permanent airport lights have been removed.

The entire landing layout rotates along the heading recorded when the scenario
enters terminal flight. It stays fixed as the vehicle steers. The anchor accounts
for both along-track and lateral offsets; optional glide-slope lights use those
same runway-local coordinates. This repairs a presentation transform, with no
changes to flight guidance, vehicle dynamics or mission data.

**Approach guides** in the cockpit toolbar enables the existing simulator HAC
gates and ten-degree glide-slope lights. It defaults off, saves as a display
preference, and works while paused. These are training aids, not historical
Edwards equipment. Checklist actions and progression remain available without
them.

The estimated main window openings now straddle the commander and pilot eye
stations. Previously the commander's straight-ahead runway ray hit the shared
W2/W3 post. Six forward openings remain, and the coordinates remain estimates.
**Esc** also returns forward when the panel-light range input has focus.

Mobile checklist layout now overrides the more specific desktop grid rule,
and the header controls wrap within a bounded column. Previously both could
extend past the phone edge despite `scrollWidth` reporting no overflow. Actual
header, checklist, indication and action bounds are checked at 390 × 844;
the scrolling card and resume action are also checked at 390 × 600.

## Review and acceptance

Review images: [initial approach](review/dry-lake-forward.png),
[configured final](review/dry-lake-final.png), and
[mobile checklist](review/dry-lake-mobile.png). These show the synthetic browser
approach, not a reconstructed STS-1 trajectory or historical photograph match.

`tests/landing-browser.py` uses actual buttons/keyboard inputs and the existing
time-advance probe. The new landing probe only reads the actual scene threshold
projection and its intersection with a window's clear glazing geometry. It does
not position the vehicle or camera, and this ray check does not establish that
every cockpit mesh or DOM element leaves the whole runway unobstructed.

The regression checks default/persisted guide state, unchanged pause state,
range-focused Esc, desktop/portrait rendering, asset/shader errors, and the
final-approach checklist through APU spool, gear ARM/DN and wheel stop. The root
adapter frame test checks the actual Three.js runway transform at cardinal and
oblique headings, including lateral HAC placement. The cockpit and orbit-to-entry
walkthrough regressions remain separate acceptance checks.

The production build, four web test programs and all three browser regressions
pass on Linux Chromium with SwiftShader. The landing run reports no page,
console/shader or resource errors; the other two report no page errors. The
existing root generator emits eight electrical.ts TS2367 diagnostics, and Vite
retains its large-chunk warning. These results do not establish root-source
type cleanliness or native/headset acceptance.

The major remaining cockpit gate is a dimensioned STS-1 instrument/cabin record
and matched camera evidence. The current flight deck still has later MEDS
displays; selecting STS-1 and fixing the landing scene does not close that gap.
Surveyed lake contours, historical markings, weather/exposure matching, full
mission flight calibration and headset acceptance remain unverified.
