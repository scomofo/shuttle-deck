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
| `terrain-color.webp` | 1254 × 1254 | Aerial wetlands around the runway | Generated illustrative terrain, not a factual map |
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

## Validation and limits

`npm run build` includes strict TypeScript checking. Desktop browser checks
covered orbit, cockpit, tower, entry and approach, door controls, pause/rate,
and F5/F9 restoration. At 390 × 844, the console scrolls to the lower controls
and panel descriptions remain accessible. Normal flows produced no browser
errors or failed asset requests. An intentionally blocked tile asset produced
the reload screen and recovered after unblocking.

Review captures: [orbit](review/orbit.jpg) and [cockpit](review/cockpit.jpg).

The root simulation tests have an existing failure in
`test_oms_retrograde_drops_periapsis` (`start periapsis 0`), reproduced before
any visual edits. All other 26 root checks pass when run individually. This
pass leaves the core simulation and its tests unchanged.

Next visual work should use sourced orbiter dimensions/UVs and a calibrated
cockpit, replace the illustrative runway and repeated terrain with a sourced landing-site model, and add a true
height/roughness texture set. The 2K Earth maps improve geography but do not
provide close-range orbital ground detail. Current plumes remain stylized.
