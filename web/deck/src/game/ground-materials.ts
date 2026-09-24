import * as THREE from "three";

/** Code-native surface detail; stable UVs avoid swimming as the world recenters. */
export function terrainMaterial(map: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({ map, roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec2 uv = vMapUv;
        vec4 broad = texture2D(map, uv);
        // Different scale/orientation breaks the single aerial-image repeat near the ground.
        vec4 detail = texture2D(map, vec2(-uv.y, uv.x) * 9.0 + vec2(0.37, 0.61));
        float nearMix = 1.0 - smoothstep(600.0, 6500.0, length(vViewPosition));
        diffuseColor *= mix(broad, detail, nearMix * 0.55);
      #endif
    `);
  };
  material.customProgramCacheKey = () => 'wetland-multiscale-v1';
  return material;
}

/** Subtle concrete aggregate and slab variation, not a generated texture asset. */
export function pavementMaterial(bumpMap: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({ color: '#777b76', roughness: 0.95,
    bumpMap, bumpScale: 0.018, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 vPavementUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vPavementUv = uv;');
    shader.fragmentShader = 'varying vec2 vPavementUv;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 metres = vPavementUv * vec2(5200.0, 90.0);
      vec2 slab = floor(metres / vec2(25.0, 15.0));
      float variation = fract(sin(dot(slab, vec2(12.9898,78.233))) * 43758.5453);
      // Fade subpixel grain rather than aliasing at grazing approach angles.
      float footprint = max(length(dFdx(metres)), length(dFdy(metres)));
      float grain = sin(metres.x * 43.0) * sin(metres.y * 39.0);
      diffuseColor.rgb *= 0.94 + variation * 0.12 + grain * 0.035 * (1.0 - smoothstep(0.02, 0.15, footprint));
    `);
  };
  material.customProgramCacheKey = () => 'runway-aggregate-v1';
  return material;
}
