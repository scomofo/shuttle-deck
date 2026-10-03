# Joined side and aft workstations

The enclosed cabin still had isolated side and aft plates. Their exposed backs,
unsupported lower edges and near-eye placement did not resemble the console
assemblies in NASA's existing baseline. Side faces now sit on closed sloped
housings that join the floor and outer walls. The aft faces mount to continuous
backing beneath the two aft windows, with side-console returns joining that
bulkhead. The lower strip and previously floating position plates share the
mounting. Unattested blank sections retain their panel codes without adding
operational controls.

This resolves the floating side/aft assembly defect. The coordinates, slope,
surface finish, seams and hardware remain estimates. It does not establish
the original Columbia/STS-1 panel inventory or measured crew reach.

## Reference evidence

- [NASA NTRS 19960050290, existing baseline Figure 4 / printed p. 12-10](https://ntrs.nasa.gov/api/citations/19960050290/downloads/19960050290.pdf)
  shows the aft panels below the window pair, adjoining side consoles and
  lower faces. [Local reference render](review/pre-meds-baseline-figure4.png).
- Figure 5 / printed p. 12-11 shows continuous consoles at the floor boundary
  in the existing plan and section. [Local reference render](review/pre-meds-baseline-figure5.png).
- [NASA News Reference crew arrangement, p. 3-9](https://www.nasa.gov/history/SP-4225/diagrams/shuttle/shuttle-diagram-7.htm)
  shows the aft station as a joined assembly around its two windows.
  [Local reference image](review/crew-arrangement-reference.jpg).

These establish assembly topology. The NTRS report describes an October 1995
mockup/Rockwell baseline, and the News Reference includes later operational
stations. Neither is a mission-specific 1981 hardware inventory. The existing
baseline is used; its proposed redesign is not. Source byte hashes and STS-1
photograph limits remain in [the instrument record](HISTORICAL_INSTRUMENTS.md)
and [the enclosure record](CABIN_ENCLOSURE.md).

## Geometry and crew access

`workstation-layout.ts` shares the mounting transforms with the actual rendered
panel groups. Side faces slope upward toward the outer walls. The closed
extrusions include deck, inboard face, side cheeks, end caps and floor contact.
The aft backing ends below the aft-window sill. Existing generated panel
textures provide matte metal finishes; there are no new runtime assets.

Fuel-cell/APU and paired bay-door commands move with their panel groups and
retain their existing root-command paths. Find still aims at the real control;
reading and dragging do not issue a command. The commander eye, baseline pitch,
forward landing geometry and flight-instrument positions remain fixed.

The read-only cabin probe now distinguishes shell clearance from assembly
clearance. It raycasts actual housing and trim meshes, all named panel plates
and the rendered seats to each of the six physical command targets and thirteen
instrument centers. It checks the same assembly against the roof/aft window
centers. These are center-sightline checks, not whole-face visibility, reach or
collision acceptance. The retained commander headrest still occupies part of
the lower aft reading view; these captures do not hide it or move the eye.

## Fixed-state captures

Before uses merged baseline `b5eb383` (the rendered tree of `88cb857`); after
uses this workstation implementation. Both reuse the committed
[GUI checkpoint fixture](review/cabin-fixture.json) through actual Restore,
Pause, navigation and pointer look, with 100% panel lighting.

All thirteen matching views retain exactly the same recorded telemetry,
including GET, source altitude/vertical speed, Mach, alpha, heading, pitch and
bank. Viewports and commander eye are identical. The pointer-look aft-window
comparison also uses the same recorded drag motions and default 62-degree
lens. The **Aft station** navigation aims at the relocated station, so its
before/after orientation changes; it is not claimed to be an identical camera
orientation. No simulation or camera truth is assigned by the capture harness.

- Fixed pointer look: [before](review/workstation-before-aft-windows.png),
  [after](review/workstation-aft-windows.png).
- Aft station navigation: [before](review/workstation-before-aft.png),
  [after](review/workstation-aft.png).
- [Forward approach](review/workstation-forward.png) and
  [390×600 instrument/checklist recovery](review/workstation-phone.png).
- Actual command views: [bay-door Find](review/workstation-find-doors.png) and
  [phone APU starting](review/workstation-mobile-apu.png). These use live GUI
  scenarios rather than the fixed checkpoint; they demonstrate usable command
  paths, not matched-state reference calibration.
- [Baseline state record](review/workstation-before-capture-state.json) and
  [final state record](review/workstation-capture-state.json).

NASA's references do not supply matching crew-eye/lens fixtures. This is a
qualitative topology comparison, not photographic or dimensional calibration.

## Validation

The production build and all eight web test programs pass. The new geometry
test checks closed triangle edges, floor contact, backing and unobstructed
seat rays at 99 samples across eleven mounted faces, and roof/aft clearance.
Existing enclosure acceptance retains its 2,400-direction seat sphere. Strict
browser TypeScript passes. The supported root generator still emits its eight
pre-existing electrical.ts TS2367 diagnostics; Vite retains its chunk warning.

Chromium/SwiftShader cabin acceptance passes on approach and orbit with all
nineteen control/instrument assembly rays clear, four roof/aft centers clear,
unchanged eye and paused GET, exact Save/reload/Restore telemetry, landing
visibility, pointer look and bounded short-phone recovery. It reports no page,
console/shader or resource errors. Captures are original screenshot bytes.

All six browser regressions pass: cabin assembly, physical cockpit picks,
legacy instruments, landing, checkpoint recovery and flight walkthrough.
The physical tests exercise relocated bay-door, fuel-cell and APU controls on
desktop/phone, gear sequencing, Find without a command, drag versus click and
held-input cancellation. Instrument reading/CRT picks and paused/cold recovery
remain intact. The walkthrough reaches entry from orbit and wheel stop from a
separate approach; it does not establish a complete historical trajectory.
Cabin, landing and checkpoint checks report no page/console/resource errors;
instruments report no page/console errors; cockpit and walkthrough report no
page errors. Final review captures were visually inspected.

## Remaining reconstruction gate

The original 1981 overhead/side/aft inventory and complete gauge set still need
mission-specific evidence and conversion. Existing later-source communication,
RMS and section grouping remain unverified for STS-1. Exact console dimensions,
mounting hardware, forward three-dimensional structure, middeck access and
ejection-seat reconstruction are open. The subsequent
[payload bay pass](PAYLOAD_BAY.md) adds selected aft exterior geometry through
the actual apertures, a public observation view and root-position door hinges.
The full exterior hull remains hidden in the seated renderer.
Full historical flight, measured eye/reach and headset acceptance are not
established by these browser checks.
