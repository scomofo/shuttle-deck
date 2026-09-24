import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sim } from "@/sim/runtime";
import { exhaustLevels } from "./exhaust-state";

const vertex = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const fragment = `
  varying vec2 vUv;
  uniform float time;
  uniform float power;
  uniform float solid;
  void main() {
    float downstream = vUv.y;
    float side = abs(vUv.x * 2.0 - 1.0);
    float flow = sin(downstream * 43.0 - time * 25.0) * sin(downstream * 17.0 + time * 13.0);
    float radius = mix(0.35, 0.92, downstream) + flow * 0.035 * downstream;
    float edge = 1.0 - smoothstep(radius * 0.40, radius, side);
    float tail = pow(1.0 - downstream, 1.65);
    float shock = pow(max(sin(downstream * 38.0), 0.0), 6.0) * (1.0 - solid) * 0.35;
    vec3 cool = mix(vec3(0.30, 0.47, 1.0), vec3(1.0, 0.88, 0.70), pow(edge, 3.0));
    vec3 warm = mix(vec3(0.75, 0.16, 0.025), vec3(1.0, 0.88, 0.57), edge);
    vec3 color = mix(cool, warm, solid) * (1.0 + shock);
    float alpha = edge * tail * (0.52 + power * 0.20) * smoothstep(0.0, 0.025, downstream);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Three soft intersecting sheets, extending aft along -Z; no opaque cone tips. */
export function Exhaust({ kind, position, radius, length }: {
  kind: "main" | "booster" | "oms"; position: [number, number, number]; radius: number; length: number;
}) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -0.5);
    return g;
  }, []);
  const uniforms = useMemo(() => ({ time: { value: 0 }, power: { value: 0 }, solid: { value: kind === "booster" ? 1 : 0 } }), [kind]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    const power = exhaustLevels(sim)[kind];
    if (!group.current) return;
    group.current.visible = power > 0.01;
    // Mission time freezes shimmer as well as geometry when paused.
    uniforms.time.value = sim.get;
    uniforms.power.value = power;
    group.current.scale.set(radius, radius, length * (0.55 + power * 0.45));
  });
  return <group ref={group} name={`exhaust-${kind}`} position={position} visible={false}>
    {[0, Math.PI / 3, Math.PI * 2 / 3].map((angle) => <mesh key={angle} geometry={geometry} rotation={[0, 0, angle]} raycast={() => null}>
      <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms}
        transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
    </mesh>)}
  </group>;
}
