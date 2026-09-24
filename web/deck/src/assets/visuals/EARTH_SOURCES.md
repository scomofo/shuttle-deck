# Earth texture sources

These files are bundled locally so the simulation does not depend on a live
NASA image server. Both are unchanged downloads from NASA's Blue Marble 2002
collection, retrieved on 2026-09-24. No AI-generated geography is included.

| Repository file | Source file | Dimensions | Bytes | Intended use |
| --- | --- | --- | ---: | --- |
| `earth-day-2048.jpg` | [NASA surface map](https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg) | 2048 × 1024 | 238,676 | sRGB surface color |
| `earth-clouds-2048.jpg` | [NASA cloud composite](https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg) | 2048 × 1024 | 829,367 | Linear grayscale cloud opacity |

## Provenance and credit

[NASA's collection description and credits](https://science.nasa.gov/earth/earth-observatory/the-blue-marble-true-color-global-imagery-at-1km-resolution/)
identify these as satellite observation composites, rather than single
photographs or present-day weather. Surface observations cover June–September
2001. The cloud layer combines two days of visible imagery with a third day
of thermal infrared polar imagery.

Credit: NASA Goddard Space Flight Center; Reto Stöckli and Robert Simmon.
NASA identifies MODIS science teams as data/technical contributors and USGS
and NOAA sources for topography and Antarctic observations.

[NASA's media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
permit informational uses, including graphical simulations, subject to those
guidelines. Acknowledge NASA as the source. This project is independent and
does not imply NASA review, sponsorship, or endorsement. The software's
license does not supersede the source's media terms.

## Rendering notes

- Both files are global 2:1 equirectangular maps. Keep their shared UV orientation.
- The day map includes shaded relief; it is not a measured PBR albedo or height map.
- The cloud JPEG has no alpha channel. Its brightness is the opacity mask;
  use it as `alphaMap` on a white cloud shell with no color-space conversion.
- This is a static illustrative cloud composite, not a live weather layer.
- Texture dimensions are appropriate for the lightweight in-app globe; they
  do not provide close-up orbital terrain detail.

## Integrity

SHA-256 of the original downloaded bytes:

```text
5b54cc586c6cbf2b28762ef4d4011f6cf4227a8b93a637b818a0c54090ce6c2c  earth-day-2048.jpg
daddaad84d7a33bbbc86cdda3f591099f57cee8607b7bcf3b67eb7e4f7a1c793  earth-clouds-2048.jpg
```
