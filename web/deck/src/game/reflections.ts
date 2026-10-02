import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

// Linear-radiance lighting sketches, not measured HDR captures. The broad
// hemisphere gives rough metal a readable reflection without a showroom look.
function makeProbe(gl: THREE.WebGLRenderer, orbital: boolean) {
  const probe = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(10, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    toneMapped: false,
    uniforms: { orbital: { value: orbital ? 1 : 0 } },
    vertexShader: `
      varying vec3 direction;
      void main() {
        direction = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 direction;
      uniform float orbital;
      void main() {
        vec3 d = normalize(direction);
        vec3 sky = mix(vec3(0.48, 0.59, 0.69), vec3(0.09, 0.24, 0.43),
                       pow(max(d.y, 0.0), 0.4));
        vec3 ground = vec3(0.27, 0.22, 0.16);
        vec3 atmosphere = mix(ground, sky, smoothstep(-0.12, 0.12, d.y));
        float earth = (1.0 - smoothstep(-0.65, 0.05, d.y));
        vec3 space = mix(vec3(0.003, 0.004, 0.007), vec3(0.18, 0.31, 0.44), earth);
        float sun = pow(max(dot(d, normalize(vec3(40.0, 24.0, -30.0))), 0.0), 240.0);
        gl_FragColor = vec4(mix(atmosphere, space, orbital) + vec3(1.0, 0.86, 0.69) * sun * 2.0, 1.0);
      }`,
  });
  probe.add(new THREE.Mesh(geometry, material));
  const generator = new THREE.PMREMGenerator(gl);
  try {
    return generator.fromScene(probe, 0.02, 0.1, 30);
  } finally {
    generator.dispose();
    geometry.dispose();
    material.dispose();
  }
}

/** Bake once per renderer, select cheaply alongside the world's phase change. */
export function useReflectionEnvironment() {
  const { gl, scene } = useThree();
  const maps = useRef<{ ground: THREE.WebGLRenderTarget; orbit: THREE.WebGLRenderTarget } | null>(null);
  useEffect(() => {
    const previous = scene.environment;
    const intensity = scene.environmentIntensity;
    const ground = makeProbe(gl, false);
    const orbit = makeProbe(gl, true);
    maps.current = { ground, orbit };
    return () => {
      if (scene.environment === ground.texture || scene.environment === orbit.texture) {
        scene.environment = previous;
        scene.environmentIntensity = intensity;
      }
      maps.current = null;
      ground.dispose();
      orbit.dispose();
    };
  }, [gl, scene]);
  return (terminal: boolean) => {
    if (!maps.current) return;
    scene.environment = (terminal ? maps.current.ground : maps.current.orbit).texture;
    scene.environmentIntensity = terminal ? 0.38 : 0.45;
  };
}
