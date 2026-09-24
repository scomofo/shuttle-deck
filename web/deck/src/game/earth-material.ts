import * as THREE from "three";

/** Approximate cloud occlusion and aerial haze over the existing NASA composite.
 * The offset is illustrative; this is not a weather or atmospheric solver.
 */
export function earthSurfaceMaterial(map: THREE.Texture, cloudMap: THREE.Texture) {
  const cloudLongitude = { value: 0 };
  const material = new THREE.MeshStandardMaterial({
    map, roughness: 1, metalness: 0, envMapIntensity: 0,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.cloudMap = { value: cloudMap };
    shader.uniforms.cloudLongitude = cloudLongitude;
    shader.fragmentShader = `
      uniform sampler2D cloudMap;
      uniform float cloudLongitude;
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
      #include <map_fragment>
      // Match the independent cloud shell's longitude, wrap at the dateline,
      // and clamp latitude so the poles never sample across the texture.
      vec2 cloudUv = vec2(fract(vMapUv.x + cloudLongitude + 0.0015),
                          clamp(vMapUv.y - 0.001, 0.001, 0.999));
      float cover = texture2D(cloudMap, cloudUv).g;
      diffuseColor.rgb *= 1.0 - smoothstep(0.15, 0.85, cover) * 0.28;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
      vec3 earthNormal = inverseTransformDirection(normal, viewMatrix);
      float daylight = smoothstep(-0.08, 0.35,
        dot(earthNormal, normalize(vec3(40.0, 24.0, -30.0))));
      float grazing = pow(1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0), 3.0);
      // Thin, sunlit blue haze softens surface contrast toward the limb.
      outgoingLight = mix(outgoingLight, vec3(0.18, 0.36, 0.60),
                          grazing * daylight * 0.24);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => "earth-cloud-occlusion-haze-v1";
  return { material, cloudLongitude };
}
