import { useEffect, useMemo } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import panelUrl from "@/assets/visuals/panel-color.webp";
import tileUrl from "@/assets/visuals/tile-color.webp";
import blanketUrl from "@/assets/visuals/blanket-color.webp";
import foamUrl from "@/assets/visuals/foam-color.webp";

const surfaces = {
  panel: { url: panelUrl, roughness: 0.73, metalness: 0.08, bumpScale: 0.0015 },
  tile: { url: tileUrl, roughness: 0.91, metalness: 0, bumpScale: 0.012 },
  blanket: { url: blanketUrl, roughness: 0.94, metalness: 0, bumpScale: 0.006 },
  foam: { url: foamUrl, roughness: 0.96, metalness: 0, bumpScale: 0.014 },
} as const;

/** Generated color scans, with deliberately subtle inferred relief, not measured PBR scans. */
export function useSurfaceMaterial(kind: keyof typeof surfaces, repeat: [number, number] = [1, 1]) {
  const surface = surfaces[kind];
  const source = useLoader(THREE.TextureLoader, surface.url);
  const { gl } = useThree();
  const [u, v] = repeat;
  const textures = useMemo(() => {
    // Per-use UV transforms: a panel and a wing must not mutate each other's cached map.
    const map = source.clone();
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(u, v);
    map.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    map.needsUpdate = true;
    const bumpMap = map.clone();
    bumpMap.colorSpace = THREE.NoColorSpace;
    bumpMap.needsUpdate = true;
    return { map, bumpMap };
  }, [source, u, v, gl]);
  useEffect(() => () => {
    textures.map.dispose();
    textures.bumpMap.dispose();
  }, [textures]);
  return { ...textures, roughness: surface.roughness, metalness: surface.metalness, bumpScale: surface.bumpScale };
}
