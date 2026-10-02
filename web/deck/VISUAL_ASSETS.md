# Photorealism asset pass

This pass replaces the placeholder globe and flat surface finishes, adds
physical cockpit hardware, and improves the orbiter silhouette. It is a
foundation for photorealism; the station and orbiter geometry remain estimated.
It does not claim an exact orbiter, mission-era panel layout, or flight-certified trainer.

## Assets

All images are bundled from `src/assets/visuals/`. No remote texture CDN is
required during play. Generated sources were encoded as WebP at quality 88
without changing dimensions or painting over the content.

| Asset | Resolution | Use | Origin |
| --- | --- | --- | --- |
| `tile-color.webp` | 1254 × 1254 | Black heat shield, nose and wing underside | Generated; Scott approved the black tile appearance during this pass |
| `blanket-color.webp` | 1254 × 1254 | White thermal cloth; tinted cabin upholstery | Generated artistic approximation |
| `panel-color.webp` | 1254 × 1254 | Coated cockpit metal and control faces | Generated artistic approximation |
| `foam-color.webp` | 1254 × 1254 | External tank foam | Generated artistic approximation |
| `terrain-color.webp` | 1254 × 1254 | Retained original; no longer used by the runtime | Generated illustrative wetlands, not a factual map |
| `earth-day-2048.jpg` | 2048 × 1024 | Global land/ocean surface | NASA Blue Marble observation composite |
| `earth-clouds-2048.jpg` | 2048 × 1024 | Cloud opacity | NASA Blue Marble observation composite |

The five surface/terrain images were generated with the built-in image generation
tool. Exact prompts are preserved in [texture-prompts.json](texture-prompts.json).
They are visual material references, not measured PBR scans. Repetition is
intended, but they are not certified seamless scans and should be checked
when changing UV density. The black tile image should retain its approved
appearance in future refinements.

NASA source URLs, credits, original-file checksums, and media terms are in
[EARTH_SOURCES.md](src/assets/visuals/EARTH_SOURCES.md). The surface map includes
shaded relief; clouds are a static composite, not current weather.

## Rendering

- Surface color is sRGB. Cloud opacity and inferred bump data use no color-space conversion.
- Each surface use owns its repeat transform; the cached source texture is never mutated.
- Bump relief is intentionally small and inferred from the color image, not a measured height map.
- Materials distinguish rough ceramic, cloth, coated metal, foam, glass and exposed hardware.
- A directional sun, restrained fill, ACES tone mapping, local shadows and a thin atmospheric limb replace the flat lighting and thick blue shell.
- The Earth/cloud shells retain the simulator's illustrative position/scale; this is not a georeferenced orbital renderer.
- Cockpit display graphics remain code-rendered so telemetry and labels stay live and legible.
- Instrument texture updates are limited to 15 Hz; fasteners and switch banks use instancing.
- The new exterior retains bay doors, separation, gear and plume state from the existing browser model.
- Asset failures have a reload screen; loading does not leave a silent empty canvas.

## Exhaust and runway follow-up

Soft additive exhaust sheets replace solid cones, with distinct main-engine,
booster and OMS effects. Orbital burns use the two OMS nozzles; main-engine
and booster effects are limited to attached ascent hardware. Open bay doors
and depleted OMS propellant suppress orbital exhaust, matching browser thrust
constraints. Mission time drives shimmer, so pause also freezes the effect.
NASA describes the OMS pods and orbital role in
[Preparations for STS-1](https://www.nasa.gov/history/40-years-ago-preparations-continue-for-sts-1/).
Plume color, extent and shock detail remain artistic shader approximations,
not a fluid simulation or measured vacuum exhaust model.

The earlier paved-runway pass added modern markings, pavement joints, rubber
deposits and airport lights. It has been superseded by the STS-1 dry-lake
presentation: [LANDING_VIEW.md](LANDING_VIEW.md). The estimated 5200-by-90
footprint remains; surface finish and paint are illustrative rather than a
surveyed/historically transcribed site.

## Orbiter proportions

The next geometry pass adjusts span/length from NASA's three-view drawing,
refines the nose/window belt, and replaces ellipsoid OMS pods with tapered
fairings. See [ORBITER_GEOMETRY.md](ORBITER_GEOMETRY.md) for exact sources,
estimated details, and before/after review renders.

## Commander view

The seated-view pass reshapes the forward window openings, adjusts the glare
shield and fixes camera bank alignment and view-transition drift. See
[COCKPIT_VIEW.md](COCKPIT_VIEW.md) for sources, estimated sightline settings,
comparison renders and acceptance limits.

## Validation and limits

`npm run build` includes strict TypeScript checking. Desktop browser checks
covered orbit, cockpit, tower, entry and approach, door controls, pause/rate,
and F5/F9 restoration. At 390 × 844, the console scrolls to the lower controls
and panel descriptions remain accessible. Normal flows produced no browser
errors or failed asset requests. An intentionally blocked tile asset produced
the reload screen and recovered after unblocking.

Run `npm --prefix web/deck test` for exhaust-state regression checks covering
ascent separation, orbital burns, blocked burns and non-powered phases.
The follow-up also passed the production build and browser rendering checks
for launch, orbit, runway approach and cockpit with no browser errors.

Review captures: [orbit](review/orbit.jpg), [cockpit](review/cockpit.jpg),
[launch exhaust](review/launch-exhaust.jpg) and [runway](review/runway.jpg).
These are paused, controlled visual states, not end-to-end flight evidence.

The root simulation tests have an existing failure in
`test_oms_retrograde_drops_periapsis` (`start periapsis 0`), reproduced before
any visual edits. All other 26 root checks pass when run individually. This
pass leaves the core simulation and its tests unchanged.

Next visual work should use sourced orbiter dimensions/UVs and a calibrated
cockpit, replace the illustrative runway and repeated terrain with a sourced landing-site model, and add a true
height/roughness texture set. The 2K Earth maps improve geography but do not
provide close-range orbital ground detail. Exhaust remains a shader approximation.

## Approach and exterior detail follow-ups

The earlier wetland/concrete approach shaders are superseded by procedural
dry-clay shading for the selected STS-1 landing-site identity. Coordinates stay
fixed in the landing frame, and fine seams fade by pixel footprint. The warm
ground reflection probe matches the new surface palette as an artistic lighting
estimate. No new texture downloads are introduced. The historical approach
capture [runway.jpg](review/runway.jpg) documents the older illustrative scene;
current images are linked in [LANDING_VIEW.md](LANDING_VIEW.md).

Each payload door now carries four separate smooth radiator surfaces. The count
and inside-door placement follow NASA's
[STS-115 radiator investigation](https://ntrs.nasa.gov/citations/20070038939)
and [Shuttle overview](https://www.nasa.gov/reference/the-space-shuttle/).
Panel curvature, finish and size are fitted estimates for this model. The forward
radiators do not independently deploy; they follow the existing door hinge.
Engine bells also have subtle circumferential hardware bands, an artistic
geometry detail. The approved tile image is unchanged.

Review: [open bay](review/payload-radiators.jpg) and
[closed bay](review/payload-closed.jpg). Browser checks counted eight attached
panels, verified opening and closure, and rendered the approach shaders without
browser errors. Production build/TypeScript and the existing exhaust-state tests
pass. These checks do not establish thermal-system behavior or historical
geometric accuracy.

## Environment reflection pass

Metal and glass now receive restrained, roughness-filtered environment lighting.
Two procedural linear-radiance probes represent an atmospheric sky/ground
hemisphere and dark space with broad Earth bounce. They are baked once per
renderer with PMREM and switched with the existing terminal-flight condition;
no per-frame probe capture or new texture downloads are required. Probe targets
and temporary bake resources are disposed on teardown. The approved black tile
image and its material settings are unchanged.

These are illustrative lighting sketches, not measured HDR photography,
location-correct reflections, or local cockpit reflection captures. Existing
direct sunlight remains the primary light source. Review:
[approach](review/reflections-approach.jpg) and [orbit](review/reflections-orbit.jpg).
Both runtime views rendered without browser or shader errors; TypeScript,
production build, exhaust tests and the three attitude tests pass. The root
suite still stops at the existing `test_oms_retrograde_drops_periapsis`
assertion (start periapsis 0).

This branch also carries the wing seams and landing-gear details committed after
the prior visual PR was merged. The newly merged root package manifest needed
a duplicate test entry removed and its missing comma repaired, preserving the
attitude test command.

## Earth depth follow-up

The existing NASA cloud composite now also supplies subtle cloud-shell bump
relief and approximate surface occlusion. Occlusion follows the shell's
independent longitude; wrapping is explicit at the dateline and latitude
sampling is clamped at the poles. A small fixed UV displacement suggests cloud
height but is not a sun-projected shadow calculation. Sun-facing grazing angles
receive restrained blue aerial haze, complementing the outer atmospheric rim.
The globe and cloud shell do not receive the orbiter's environment reflection
probe, avoiding an artificial Earth reflection on Earth itself.

This uses the existing 2K imagery without new downloads. It improves lighting
depth, not geographic resolution, cloud accuracy, or orbital scale. Cloud
relief and haze strengths are artistic estimates. Review:
[orbit](review/earth-depth-orbit.jpg) and [entry](review/earth-depth-entry.jpg).

## Higher-resolution Earth follow-up

Desktop scenes now use 4K surface and cloud maps derived from NASA's 8K TIFFs,
providing four times the texels of the earlier 2K pair. Small initial viewports
and GPUs limited below 4096 retain the original maps. Selection happens at
mount; the unselected JPEG pair is not fetched. Lighting, cloud shading, and
approved orbiter tile remain unchanged. Source checksums, conversion settings,
and memory estimates are in [EARTH_SOURCES.md](src/assets/visuals/EARTH_SOURCES.md).

The larger maps improve coastline and cloud detail but still do not provide
close-range terrain or historically matched weather. Review:
[orbit](review/earth-4k-orbit.jpg) and [entry](review/earth-4k-entry.jpg).
