import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useSurfaceMaterial } from "./materials";

type Strip = [number, number, number, number]; // x, z, length, width

/** Painted geometry remains crisp at grazing angles; coordinates retain the flight model's runway. */
function Strips({ strips, color, y, opacity = 1 }: { strips: Strip[]; color: string; y: number; opacity?: number }) {
  const mesh = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.96, transparent: opacity < 1, opacity,
      depthWrite: opacity === 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const inst = new THREE.InstancedMesh(geometry, material, strips.length);
    const matrix = new THREE.Matrix4();
    strips.forEach(([x, z, length, width], i) => {
      matrix.makeScale(length, 1, width); matrix.setPosition(x, y, z); inst.setMatrixAt(i, matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = true;
    return inst;
  }, [strips, color, y, opacity]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}

function RunwayLights() {
  const lamps = useMemo(() => {
    const points: [number, number, string][] = [];
    for (let x = -370; x <= 4770; x += 60) for (const z of [-47, 47]) points.push([x, z, "#fff4d3"]);
    for (let z = -40; z <= 40; z += 5) { points.push([-397, z, "#61d793"]); points.push([4797, z, "#e16a57"]); }
    for (let x = -450; x >= -1200; x -= 30) for (const z of [-3, 0, 3]) points.push([x, z, "#ffead0"]);
    const fixture = new THREE.SphereGeometry(0.55, 6, 4);
    const material = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 0.3, roughness: 0.35 });
    const mesh = new THREE.InstancedMesh(fixture, material, points.length);
    const matrix = new THREE.Matrix4();
    points.forEach(([x, z, color], i) => {
      matrix.makeTranslation(x, 0.8, z); mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, new THREE.Color(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }, []);
  useEffect(() => () => { lamps.geometry.dispose(); (lamps.material as THREE.Material).dispose(); lamps.dispose(); }, [lamps]);
  return <primitive object={lamps} />;
}

export function Runway() {
  const pavement = useSurfaceMaterial("panel", [80, 2]);
  const detail = useMemo(() => {
    const paint: Strip[] = [[2200, -42, 5160, 0.8], [2200, 42, 5160, 0.8]];
    for (let x = -240; x < 4630; x += 60) paint.push([x, 0, 30, 0.9]);
    for (const x of [-345, 4745]) for (let i = 0; i < 8; i++) for (const side of [-1, 1]) paint.push([x, side * (7 + i * 4.2), 38, 2]);
    for (const x of [500, 3900]) for (const z of [-17, 17]) paint.push([x, z, 45, 7]);
    for (const x of [150, 800, 1100, 3300, 3600, 4250]) for (const side of [-1, 1]) for (let i = 0; i < 2; i++) paint.push([x, side * (15 + i * 4), 23, 1.6]);
    const joints: Strip[] = [];
    for (let x = -400; x <= 4800; x += 25) joints.push([x, 0, 0.075, 90]);
    for (const z of [-30, -15, 0, 15, 30]) joints.push([2200, z, 5200, 0.075]);
    const rubber: Strip[] = [];
    // Deterministic traffic streaks at both ends; appearance does not shuffle on reload.
    for (let i = 0; i < 20; i++) for (const side of [-1, 1]) {
      const start = 200 + (i * 137) % 390;
      const z = side * (2.8 + (i % 5) * 0.34);
      rubber.push([start, z, 240 + (i * 79) % 600, 0.12 + (i % 3) * 0.12]);
      rubber.push([4400 - start, z, 240 + (i * 79) % 600, 0.12 + (i % 3) * 0.12]);
    }
    return { paint, joints, rubber };
  }, []);
  return <group name="runway">
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2200, 0.12, 0]} receiveShadow>
      <planeGeometry args={[5600, 220]} /><meshStandardMaterial color="#5a6053" roughness={1} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2200, 0.22, 0]} receiveShadow>
      <planeGeometry args={[5200, 90]} />
      <meshStandardMaterial color="#777b76" roughness={0.95} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} bumpMap={pavement.bumpMap} bumpScale={0.018} />
    </mesh>
    <Strips strips={detail.joints} color="#42463f" y={0.226} opacity={0.28} />
    <Strips strips={detail.paint} color="#e5e2d5" y={0.23} />
    <Strips strips={detail.rubber} color="#1c211e" y={0.235} opacity={0.18} />
    <RunwayLights />
  </group>;
}
