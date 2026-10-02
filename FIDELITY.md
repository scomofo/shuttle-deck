# Fidelity Statement

What this project honestly is, and what it is not yet. Updated as the
roadmap below is implemented; each claim names the axis it belongs to.

**Supportable description:** an interactive Shuttle mission visualization
and procedural trainer with simplified flight dynamics, now driven by a
single unified simulation with an STS-1 reference baseline. It is not
currently a realistic end-to-end Shuttle simulator, and it should not be
described as one.

## The five axes

### Visual fidelity — moderate
The browser flight deck is visually coherent and readable, with
recognizable Shuttle stations (F2/F6/F7/F8, R1/R2/R13), controllers,
fuel-cell/bus controls, APU state, payload bay doors, and gear
sequencing. The panel arrangement is a stylized dashboard, not a
dimensionally reconstructed flight deck with historically located panels,
switches, guards, talkbacks, breakers, sightlines, or crew reach
constraints.

The 3D cabin uses the later MEDS configuration, while the reference mission
data uses STS-1. These are different eras. New scenarios now begin in the
commander-seat view; the flat console is an optional simulator aid. Forward
window, overhead/side-console and seat overlaps have been corrected within
the estimated geometry, and checklist Find actions locate real scene controls.
This establishes desktop usability, not a measured historical cabin.

The selected reconstruction target is Columbia on STS-1 (1981). The landing
presentation now uses a dry lakebed and runway 23, consistent with the mission
identity, and rotates the estimated layout along the recorded approach heading.
Simulator HAC/glide-slope guides are optional. Lakebed finish, paint coordinates
and the synthetic scenario placement remain estimates; the early cockpit
reconstruction still needs source evidence. See `web/deck/LANDING_VIEW.md`.

### Procedural fidelity — improving
Phase-specific procedure cards exist and the procedure runner enforces
real rules (it rejects writes to state channels and momentary misuse).
Crew actions previously performed by adapter automation (deorbit burn,
gear, ET sep) are now explicit crew steps — e.g. the deorbit card says
"Lower orbital periapsis" and its APU step starts APUs 2+3 per the STS-1
sequence. Ascent is still a scripted trajectory through MECO rather than
a force-integrated stack simulation, which is acceptable for a procedural
trainer and is documented as such.

The deorbit card separates held burn, cutoff, deliberate coast selection and
entry-interface monitoring. Its burn input is a simulator helper, not a
reconstruction of THC translation commanding. Physical bay-door, fuel-cell,
APU and gear controls operate the existing crew-command paths; their grouped
presentation and exact locations remain estimates.

Browser checkpoints now preserve the render origin/landing anchor and verified
procedure history alongside the root snapshot. The root controls registry saves
explicit persistent switch commands, leaving untouched channels at their owner
defaults. Recovery releases held OMS, hand, momentary and button inputs, opens
the checklist paused and requires an explicit Resume. This repairs interrupted
walkthrough continuity; it does not add mechanism or trajectory fidelity.
Older v3 saves omitted this information and require crew verification before
resuming. See `web/deck/CHECKPOINT_RECOVERY.md` for evidence and limits.

### Systems fidelity — shallow but honest
The electrical system models genuine causality: switch command →
contactor latch → powered bus → talkback, with breakers and individual
loads. P4 added the same treatment to the mission systems behind the
deck's visible switches: three hydrazine APUs (spool-up transit,
hydrazine inventory, 3000 psi hydraulic systems with pressure ramp),
payload bay doors (latch sequence → drive transit → CL/OP/TRANSIT
talkback), landing gear (ARM latches the extend valves, DN drives an
extend transit to a down-lock talkback), per-engine OMS independence,
RCS consumption by actual usage, fuel-cell cryo reactant depletion, and
breaker-powered smoke detection. The deck adapter keeps no vehicle
state: it is a view-model plus a ctl.* writer, and the controls that
cannot receive honest causality (ADI source select, ATT REF, CSS) are
rendered inert rather than faked. Known approximation: gear drag keys
off the crew command while the down-lock talkback trails by the extend
transit. Known gap: RCS depletion is reported but the (untouchable)
guidance keeps publishing torque. Many other cockpit controls imply
more interconnected behavior than is currently modeled (GPC redundancy,
ECLSS depth, comms, aerosurface servo gating on hydraulic power —
`hyd.servo_ok` is published truth waiting for its reader). Per project
policy, every visible control must either have modeled causality or be
hidden/disabled — no decorative switches.

The same rule applies to instruments: the F7 event timer reads the root
50 Hz simulation GET, so pause, time acceleration, scenario restart, and
checkpoint restore cannot diverge from a browser-wall-clock display.

### Flight-dynamics fidelity — simplified but unified
The root simulation propagates ECI position/velocity with point-mass
gravity, optional J2, RK4 integration, quaternion attitude, and
Earth-relative atmosphere velocity. The browser deck is now driven by
this same root `SimRuntime` through an adapter — the duplicate flat-ENU
browser physics was deleted, so there is one vehicle truth. Entry uses
a standard atmosphere with temperature-dependent speed of sound,
Mach/alpha-indexed coefficient tables, aerodynamic moments with
rigid-body response (guidance commands effectors — elevons, speed
brake, body flap, rudder — never writes attitude directly), gear drag,
and a runway contact model with braking, steering, and rollout.
Ascent timing/mass follows the sourced STS-1 event schedule; the ascent
profile itself remains scripted through MECO. Historical Shuttle DAP
behavior is not replicated; the guidance law is a stand-in with
estimated gains.

### Mission-data fidelity — one golden baseline
`assets/data/missions/sts_template` holds rounded values built for a
software handoff test, not a mission-report transcription. Alongside it,
`assets/data/missions/sts1` is a sourced STS-1 baseline (press-kit event
METs, ΔVs, orbit targets, Edwards Runway 23 anchor) with tolerance
assertions in `tests/golden_trajectory.test.ts`. Known gaps are asserted
against their real targets and skipped with reasons, never weakened:
post-OMS-2 burn targeting, deorbit ΔV shortfall from generic orbit mass,
entry-interface profile shape, closed-loop landing from the TAEM-gate
IC, and orbiter landing mass.

## Provenance discipline

Coefficients that are not sourced are tagged `[estimated]`. Sourced values
cite their origin (e.g. NASA technical reports for wing reference area,
mean aerodynamic chord, span, vertical-tail area, and published L/D
anchors in `assets/data/spacecraft/aero.json`). Estimates are never
presented as authoritative.

## Roadmap (in priority order)

- **P0** — This statement. Done.
- **P1** — One vehicle truth. Done 2026-09-26: root `SimRuntime` drives
  the browser deck through `web/deck/src/sim/root_adapter.ts`; the
  duplicate flat-ENU browser physics was deleted.
- **P2** — Golden trajectory. Done 2026-09-26: STS-1 baseline in
  `assets/data/missions/sts1/` with tolerance tests; known gaps
  documented, never weakened.
- **P3** — Entry/landing first. Done 2026-09-26: standard atmosphere,
  Mach/alpha tables, aero moments, effectors, gear drag, runway contact,
  braking/steering/rollout, thermal/blackout proxy, root flight-director.
- **P4** — Systems depth: real causality behind every visible switch. Done
  2026-09-26 (APU/hydraulics, doors, gear, OMS/RCS, reactants, smoke
  detection; adapter stopgaps removed).
- **P5** — Visual geometry: partially implemented. Local sourced/generated
  materials, estimated orbiter/cabin geometry, lighting and cockpit usability
  have rendered browser evidence. The remaining gate is a dimensioned,
  era-consistent reconstruction with reference-matched sightlines and panel
  locations; the current MEDS cabin is not an STS-1 cockpit. See
  `web/deck/COCKPIT_VIEW.md` for the current usability slice and its limits.
