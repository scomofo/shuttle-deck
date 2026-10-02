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
  header. The old separate outside-view region was replaced by the full cabin
  viewport and optional Controls drawer in the follow-up below.

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

## Cockpit usability follow-up, 2026-10-01

The actual cabin obscured its own forward view: overhead panels covered the
window band, an outboard console crossed a commander display, and the seats
were ahead of the eye. The local geometry now separates these assemblies,
places the seated eye at the commander station, and gives the six forward
panes separate trapezoidal openings. Coordinates, clearances, light intensity
and viewing angles remain estimates; this is an internal overlap/sightline
correction, not a measured reconstruction. The panel material and approved
exterior tile assets remain unchanged.

The cabin is the initial scenario view. A compact navigation strip provides
forward, commander-display, overhead and aft reading views, plus the existing
panel-light preference. Flat controls are closed by default and available via
Controls/X; closing them releases a held burn input. The narrow-screen viewport
uses the full scene rather than reserving most of its height for that console.

Checklist Find actions aim at named scene nodes and outline their controls.
Fuel-cell and APU representatives sit on the R1/R2 groups; bay-door OPEN/CLOSE
uses R13; ARM/DN pushbuttons use F6. These replace the invented C3 system
shortcuts and center-console gear lever. Panel-group associations are supported
by the existing source record; individual positions, switch grouping and
button/guard details are estimated. The paired-APU start and grouped fuel-cell
control are simulator representatives, not per-unit panel reconstructions.
OMS burn/coast remain named simulator helpers. The physical THC/RHC geometry
is inert and no longer moves in response to vehicle attitude.
Focused HTML buttons retain native Space/Enter activation; flight shortcuts
no longer swallow their activation keys.

The MDU painter resets text alignment after its right-aligned format header,
so live body text stays within the display. APU STARTING and door/gear TRANSIT
read actual live state; labels have contrast against the coated panel finish.
The lighting preference now also dims the physical MDU faces, with a readable
minimum; its earlier effect was confined to the flat console and light spill.
Warning lamps and engraved labels remain undimmed.

`tests/cockpit-browser.py` exercises real scene ray picks, Find without
commanding, drag versus click, mobile control exposure, navigation and held
burn cancellation. `tests/walkthrough-browser.py` retains the orbit-to-entry
and separate final-approach-to-wheel-stop coverage. Captures from this follow-up
are controlled reading states, not a calibrated full-mission flight.

Review captures: [forward approach](review/cockpit-reading-forward.png),
[F6 gear reading view](review/cockpit-reading-gear.png), and
[390×844 R13 reading view](review/cockpit-reading-mobile.png). Desktop views
use 1280×800. The images show the built app paused through GUI controls; the
gear and door figures retain the actual current instruction and live state.
They are not matched photographic overlays or measured crew-eye fixtures.

The next geometry gate needs an explicit target orbiter/era, dimensioned cabin
and panel references, a recorded eye point/lens, and matched forward/side/aft
photographs. In particular, the later MEDS panel set does not match the STS-1
mission data. Hull continuity, accurate panel hardware, switch-by-switch
causality and a surveyed landing site remain open. No headset reach or
historical dimensional acceptance is claimed here.
