# Earth texture sources

These files are bundled locally so the simulation does not depend on a live
NASA image server. The 2K files are unchanged downloads from NASA's Blue Marble 2002
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

## 4K desktop derivatives

The 4096 × 2048 JPEGs are downsampled from NASA's 8192 × 4096 TIFF
sources, retrieved 2026-09-24. They are not enlarged versions of the 2K maps.
No geography or weather was generated. Existing provenance and media terms apply.

- Surface: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_8192.tif
- Clouds: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif

ImageMagick conversion: resize to 4096x2048, strip metadata, JPEG quality 88;
surface uses 4:4:4 sampling. No sharpening or color grading was applied.
Both maps use the same orientation as the 2K files.

The renderer selects 4K when the initial viewport is at least 900 CSS pixels
wide and MAX_TEXTURE_SIZE is at least 4096. Smaller screens retain the 2K
pair. Selection stays fixed until the scene remounts, so resizing does not
load both sets. Only the selected pair is requested. Estimated RGBA texture
storage with mipmaps is about 85 MiB for the 4K pair versus 21 MiB for 2K;
this excludes decoded source images and all other scene resources.

SHA-256:

```text
fec3cb8e729347d1c57807cf66b7867c1f3c669bb2f1fc3a8ad1625562591b36  NASA surface TIFF
d137775d8966ab8d443fd5126dc6e7ad72072bc1ed50555c5818d221735daf0f  NASA clouds TIFF
ec1bdfd3c56ec55edcc8f4c83598c5cb782bc7b4638fa82d375e0db2d97c8d38  earth-day-4096.jpg
1b8907b9481f93f2ee54ce0b97269b1df920b94a99c8a83ea1c4a00e550d1bca  earth-clouds-4096.jpg
```
