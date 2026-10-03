# Aft-window payload bay

The cabin previously hid all exterior geometry, leaving sky behind its aft
windows. Exterior doors also waited for the OPEN flag and then eased with wall
time, so their appearance disagreed with real transit and paused recovery.
The cabin now contains a lined bay, curved hinged doors, sill hardware,
door-mounted radiators and the two covered flight-instrumentation boxes seen
in NASA's original STS-1 photo. A shared bay component provides both cabin and
exterior presentations. Every hinge reads root `mech.plbd.position` directly.

## Sources and estimates

- [NASA, Columbia takes flight](https://www.nasa.gov/history/40-years-ago-columbia-takes-flight/):
  original [STS001-012-0331 photograph](https://www.nasa.gov/wp-content/uploads/2021/04/sts-1_launch_22_payload_bay_on_orbit_sts001-012-0331_1.jpg)
  shows the curved lined bay, two white Development Flight Instrumentation
  (DFI) covers, their support assembly and aft bulkhead. The caption identifies
  the DFI boxes and OMS pods. [Local source image](review/sts1-bay-reference.jpg).
- [NASA News Reference structural diagram, p. 3-5](https://www.nasa.gov/history/SP-4225/diagrams/shuttle/shuttle-diagram-3.htm)
  supports the fore crew module, longitudinal door hinges and aft bulkhead.
  This is a general structural reference, not a dimensioned STS-1 drawing.
  [Local source image](review/bay-structure-reference.jpg).
- The cached NASA STS-1 press kit, April 1981 / Richard Orloff January 2001
  edition, specifies a 4.6 × 18 m bay and a DFI/ACIP installation rather than
  an operational payload. Those plan dimensions anchor the cabin bay. The
  [original PDF](review/sts1-press-kit.pdf) was retained from earlier reference work; its canonical
  download URL was not resolved in this pass. The photo and structural
  diagram above were retrieved successfully through verified NASA HTTPS.
- The retained four radiator sections per door use the later
  [STS-115 investigation](https://ntrs.nasa.gov/citations/20070038939) cited in
  [VISUAL_ASSETS.md](VISUAL_ASSETS.md). Original STS-1 evidence supports
  radiators inside the doors; it does not certify these individual sections.

SHA-256 of reference bytes:

| File | SHA-256 |
| --- | --- |
| STS001-012-0331 | `f9b4a541d8b92cc6fb9be27023c37f7c0876a8e9522f39da18b6f46ac9d4a9af` |
| News Reference structure | `21ca363002ab80e0f57130f17e84156b04bf2823d3a098d625968308c37e44d9` |
| Cached STS-1 press kit | `dd94ad89ea6069aecb5d7db146eb56943b6c59d6c5e41973d06bf1c00812af61` |

Vertical contour, crew-module registration, 1.7-radian opening angle, covers,
rack, cable bundle, seams, hinge details and finishes are fitted estimates.
The ACIP is not reconstructed. The existing exterior bay envelope is shorter
in model units; it applies a presentation fit to this component. Cabin and
chase do not establish one dimensionally calibrated outer mold line.
The exterior assembly retains a fore-bulkhead closure; the cabin assembly
uses the existing pressure wall and its real apertures for that boundary.

## Crew view and mechanism continuity

**Bay windows** explicitly moves the eye to an estimated observation point
inside the pressure cabin, 45 cm ahead of W9. The actual aperture and opaque
wall/frame remain between that eye and the bay. The commander eye is below
the high aft apertures, so its seated aft look cannot reveal the bay floor.
The public observation aid makes that viewing limit explicit; it is not a
screenshot-only camera or a claim about measured astronaut posture/reach.
Finishing a door step keeps an explicitly selected observation open while
the next instruction appears. **Forward view**, **Esc**, a double-click, checklist **Find**, and Restore
return to the commander seat. Existing instrument/station views keep that
fixed eye. Observation and Find do not verify a step or issue a command.
On portrait screens the reading lens fits the bay between actual checklist
and navigation bounds, using the existing reading-aid mechanism.

Both door assemblies use the root's continuous position, including partial
travel, reversal, pause and cold recovery. There is no local eased position.
The root remains the only mechanism owner; its estimated latch/drive timings
and thermal behavior are unchanged. Radiators follow the door hinges without
independent deployment. Full exterior hull geometry remains hidden in the
cabin; only the selected aft geometry is registered behind the pressure wall.

The full exterior model also now uses a proper right-handed rotation for its
local +Z nose / +X port convention. The former right/dorsal/nose matrix was a
reflection and could not represent vehicle attitude as a quaternion. Actual
rendered +Z is checked against the root nose, including transit and recovery.

## Review and validation

Matching commander-seat captures use the committed GUI checkpoint fixture,
100% panel light and the same pointer motions as merged baseline `c35e3e8`
(rendered tree `cc74ec7`). All thirteen matching captures retain exact recorded
GET, source/converted altitude and vertical speed, Mach, alpha, heading, pitch
and bank, with the same viewport and commander eye. Instrument/CRT projections
and reading lenses are also identical.
The new public observation view has no baseline equivalent. NASA supplies no
matching calibrated crew-eye/lens fixture, so the source comparison is
qualitative. Screenshots are original browser bytes.

- Fixed seated aft look: [before](review/bay-before-seat-aft.png),
  [after](review/bay-seat-aft.png).
- Public observation: [closed](review/bay-closed.png),
  [transit](review/bay-transit.png), [open](review/bay-open.png),
  [cold restored transit](review/bay-restored-transit.png) and
  [reversing](review/bay-reversing.png).
- [Chase with open doors](review/bay-chase-open.png),
  [390×600 observation](review/bay-phone-open.png),
  [phone physical close pick](review/bay-phone-find-close.png).
- [Fixed baseline states](review/bay-before-seat-state.json),
  [fixed final states](review/bay-seat-state.json),
  [live observation/recovery states](review/bay-capture-state.json).

The read-only payload probe samples actual aperture rays and requires actual
glazing before the nearest opaque bay hit, with no cabin/support/panel/seat
hit in front of the glass. It records the rendered hinges and root position;
browser checks additionally require visible DFI pixels on the phone canvas.
This proves selected sightlines, not complete surface visibility or reach.

The geometry/owner test checks finite joined surfaces, exterior fore/aft closure,
proper airframe rotations, actual transit before OPEN, pause, reversal and
cold/cross-scenario recovery. Browser acceptance exercises public navigation,
real Find/pointer picks, keyboard direction reversal, exact saved partial
hinge transforms after reload, chase attitude and phone close sequencing.

The production build / strict browser TypeScript and all nine web test
programs pass. All seven browser suites pass: payload bay, fixed cabin views,
physical cockpit controls, legacy instruments, landing, checkpoint recovery
and walkthrough. They retain actual desktop/phone command paths, held-input
release, checkpoint history/error handling, orbit-to-entry and separate
approach-to-wheel-stop. Fixed cabin and payload acceptance report no
page/console/resource errors. This is procedural/render acceptance, not a
complete historical trajectory. The supported root generator still emits
eight pre-existing electrical.ts TS2367 diagnostics; Vite retains its chunk
warning.

The final exterior-only fore closure also passes four transformed actual-mesh
rays during cold transit and open-door chase, followed by aperture observation
and commander-seat return without page/console/resource errors. See the
[final closure state](review/bay-fore-closure-state.json) and
[chase capture](review/bay-fore-chase-open.png). The reusable payload browser
checks those boundary rays at every sampled pose.

## Remaining reconstruction gate

Mission-specific 1981 panel inventory, complete gauges, exact cabin/bay
registration and door contours, forward three-dimensional structure, middeck
access and ejection seats remain open. Aft-window OMS/fin reconstruction,
original DFI/ACIP detail and calibrated reference poses need fuller evidence.
These checks do not establish historical flight, measured crew reach or
headset acceptance.
