# Commander-view refinement

## Sources and limits

NASA's [Shuttle overview](https://www.nasa.gov/reference/the-space-shuttle/)
identifies the commander on the left, pilot on the right and six forward
windshields. The [forward-fuselage structural drawing, p. 3-7](https://www.nasa.gov/history/SP-4225/diagrams/shuttle/shuttle-diagram-5.htm)
provides the wrapping window topology; the [crew arrangement, p. 3-9](https://www.nasa.gov/history/SP-4225/diagrams/shuttle/shuttle-diagram-7.htm)
locates the seats. Its large perspective is the **aft** station, not a forward
window reference.

These references support the layout, not the numerical window coordinates,
eye point or field of view. All remain visual estimates. This pass does not
claim photogrammetric alignment, measured sightlines or a mission-specific
cockpit reconstruction. The six-pane opening is a planar presentation
approximation; the real forward structure wraps in three dimensions.

## Changes

- Replace six repeated narrow frames with differentiated trapezoidal openings,
  positioning the principal forward pane ahead of the commander and the
  center post to the right of the view.
- Lower and deepen the glare shield and add restrained local fill to the
  physical framing. Existing interactive instrument panels remain in place.
- Offset the world eye toward the commander side; snap the seated camera to
  its target rather than interpolating toward a look target only one unit away.
  This removes sideways view transients when changing cameras.
- Use the body dorsal vector as camera up, so banking tilts the outside horizon.
- Use an estimated seven-degree downward viewing angle to keep the approach
  touchdown area visible above the glare shield. The camera-relative cabin
  remains a presentation rig, not an independently calibrated rigid cabin.

- Portrait layouts (up to 600 px wide, at least 650 px tall) use a compact
  header and a separate outside-view region above the scrollable console.

## Review evidence

[Before](review/cockpit-before.jpg) and [after](review/cockpit.jpg) use the same
paused level approach setup: x=-700, altitude 65, gear down, yaw=-pi/2.
[Bank](review/cockpit-bank.jpg) adds 0.3 rad of bank; the cabin stays fixed while
the outside horizon rotates. [Portrait](review/cockpit-mobile.jpg) uses 390×844.
These are controlled rendering states, not a completed landing flight.

Browser verification checks APU off/on, camera cycling and a reachable mobile
APU control after console scrolling. Production build includes TypeScript;
existing exhaust tests are also checked. Historical dimensions, headset eye
positions and full-flight acceptance remain outside this pass.

## Materials and panel lighting

The follow-up adds a keyboard-accessible **PANEL LIGHT** slider, saved separately
from mission checkpoints as a local display preference. It ranges from 25–100%.
The minimum intentionally retains readable telemetry; it is not an electrical
power switch. Warning lamps and control labels stay undimmed. If browser storage
is blocked, adjustment still works for the current session.

The 3D display housings now have raised perimeter lips and a subtle physical
glass layer over the live telemetry. Coated panels use a restrained clear coat;
seat fabric uses a rough sheen response. A small blue-green light spill follows
the dimmer. These are artistic material settings, not measured reflectance data.
No new image assets, external texture requests, or changes to the approved tile
texture are introduced.

Review renders: [dim](review/panel-dim.jpg), [bright](review/panel-bright.jpg),
and [portrait](review/panel-mobile.jpg). Browser checks cover keyboard endpoints,
preference restoration after reload, APU interaction, and the portrait dimmer.
