import * as THREE from "three";

/** Procedural dry-lake presentation. STS-1's landing-site identity is sourced;
 * clay color, mottling and crack scale are artistic estimates, not aerial data.
 * Coordinates stay in the fixed landing frame as the camera recenters. */
export function dryLakeMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: "#b9a78b", roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 vLakeMetres;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLakeMetres = position.xy;');
    shader.fragmentShader = `
      varying vec2 vLakeMetres;
      float lakeHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float lakeNoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(lakeHash(i),lakeHash(i+vec2(1.0,0.0)),f.x),
          mix(lakeHash(i+vec2(0.0,1.0)),lakeHash(i+vec2(1.0,1.0)),f.x),f.y);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 metres=vLakeMetres;
      float broad=lakeNoise(metres*0.0008);
      float silt=lakeNoise(metres*0.016+vec2(27.0,43.0));
      diffuseColor.rgb *= 0.88+broad*0.19+silt*0.035;
      // Fine dry-clay seams fade with pixel footprint to avoid flickering.
      vec2 warped=metres*0.6+vec2(lakeNoise(metres*0.4),lakeNoise(metres*0.4+7.0))*0.6;
      vec2 cell=abs(fract(warped)-0.5);
      float footprint=max(length(dFdx(metres)),length(dFdy(metres)));
      float seam=smoothstep(0.475,0.49,max(cell.x,cell.y));
      diffuseColor.rgb *= 1.0-seam*0.075*(1.0-smoothstep(0.2,2.0,footprint));
    `);
  };
  material.customProgramCacheKey = () => 'dry-lake-clay-v1';
  return material;
}
