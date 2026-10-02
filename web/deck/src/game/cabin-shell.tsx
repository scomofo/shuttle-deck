import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSurfaceMaterial } from "./materials";
import { AFT_WINDOWS, CABIN, createCabinShellGeometry, OVERHEAD_WINDOWS } from "./cabin-layout";

const inert = () => null;

/** Continuous estimated pressure-cabin interior. Surface finish, seams and
 * framing are artistic estimates; source limits are in CABIN_ENCLOSURE.md. */
export function CabinShell({ glazing }: { glazing: THREE.Material }) {
  const geometries = useMemo(createCabinShellGeometry, []);
  const panel = useSurfaceMaterial("panel", [1.2, 1.2]);
  const cloth = useSurfaceMaterial("blanket", [2, 2]);
  const materials = useMemo(() => ({
    structure: new THREE.MeshStandardMaterial({ ...panel, color: "#aeb3ae", roughness: 0.86, metalness: 0.08, side: THREE.DoubleSide }),
    liner: new THREE.MeshStandardMaterial({ ...cloth, color: "#b5b6ad", roughness: 1, bumpScale: 0.0015, side: THREE.DoubleSide }),
    floor: new THREE.MeshStandardMaterial({ ...panel, color: "#565d60", roughness: 0.98, metalness: 0, side: THREE.DoubleSide }),
    gasket: new THREE.MeshStandardMaterial({ color: "#24292a", roughness: 0.94 }),
    rail: new THREE.MeshStandardMaterial({ ...panel, color: "#818987", roughness: 0.65, metalness: 0.16 }),
    fastener: new THREE.MeshStandardMaterial({ color: "#686f70", roughness: 0.65, metalness: 0.45 }),
  }), [panel.map, panel.bumpMap, cloth.map, cloth.bumpMap]);
  useEffect(() => () => Object.values(geometries).forEach(g => g.dispose()), [geometries]);
  useEffect(() => () => Object.values(materials).forEach(m => m.dispose()), [materials]);

  const bar = (name: string, position: [number, number, number], size: [number, number, number], material = materials.rail) =>
    <mesh key={name} name={name} position={position} material={material} raycast={inert}><boxGeometry args={size} /></mesh>;
  const frame = (id: string, width: number, height: number) => <>
    {bar(`${id}-gasket-top`, [0, height / 2 + 0.009, 0.007], [width + 0.048, 0.018, 0.025], materials.gasket)}
    {bar(`${id}-gasket-bottom`, [0, -height / 2 - 0.009, 0.007], [width + 0.048, 0.018, 0.025], materials.gasket)}
    {bar(`${id}-gasket-left`, [-width / 2 - 0.009, 0, 0.007], [0.018, height, 0.025], materials.gasket)}
    {bar(`${id}-gasket-right`, [width / 2 + 0.009, 0, 0.007], [0.018, height, 0.025], materials.gasket)}
    {bar(`${id}-frame-top`, [0, height / 2 + 0.027, 0.01], [width + 0.08, 0.024, 0.025])}
    {bar(`${id}-frame-bottom`, [0, -height / 2 - 0.027, 0.01], [width + 0.08, 0.024, 0.025])}
    {bar(`${id}-frame-left`, [-width / 2 - 0.027, 0, 0.01], [0.024, height + 0.054, 0.025])}
    {bar(`${id}-frame-right`, [width / 2 + 0.027, 0, 0.01], [0.024, height + 0.054, 0.025])}
    {[-1, 1].flatMap(x => [-1, 1].map(y => <mesh key={`${x}-${y}`} position={[x * (width / 2 + 0.027), y * (height / 2 + 0.027), 0.025]} rotation={[Math.PI / 2, 0, 0]} material={materials.fastener} raycast={inert}>
      <cylinderGeometry args={[0.004, 0.004, 0.003, 8]} />
    </mesh>))}
  </>;
  return <group name="cabin-shell">
    {Object.entries(geometries).map(([name, geometry]) => <mesh key={name} name={`cabin-opaque-${name}`} geometry={geometry} raycast={inert}
      material={name === "floor" ? materials.floor : name === "port" || name === "starboard" ? materials.liner : materials.structure} />)}

    {OVERHEAD_WINDOWS.map(p => <group key={p.id} position={[p.x, CABIN.roof, p.z]} rotation={[Math.PI / 2, 0, 0]}>
      <mesh name={`cabin-window-${p.id}`} material={glazing} raycast={inert}><planeGeometry args={[p.width, p.height]} /></mesh>
      {frame(p.id, p.width, p.height)}
    </group>)}
    {AFT_WINDOWS.map(p => <group key={p.id} position={[p.x, p.y, CABIN.aft]} rotation={[0, Math.PI, 0]}>
      <mesh name={`cabin-window-${p.id}`} material={glazing} raycast={inert}><planeGeometry args={[p.width, p.height]} /></mesh>
      {frame(p.id, p.width, p.height)}
    </group>)}

    {/* Continuous header/sill rails and restrained liner seams. No invented
        switch labels, hatch or load-bearing dimensional claims. */}
    {bar("forward-header", [0, 0.395, CABIN.forward + 0.015], [2.98, 0.045, 0.04])}
    {bar("forward-sill", [0, -0.07, CABIN.forward + 0.02], [2.98, 0.05, 0.045])}
    {bar("aft-header", [0, 0.88, CABIN.aft - 0.015], [2.98, 0.05, 0.04])}
    {bar("aft-window-sill", [0, 0.38, CABIN.aft - 0.015], [2.98, 0.04, 0.04])}
    {bar("roof-center-seam", [0, CABIN.roof - 0.003, 0.55], [0.008, 0.008, 1.5], materials.gasket)}
    {[-1, 1].map(side => <group key={side}>
      {bar(`roof-edge-${side}`, [side * (CABIN.halfWidth - 0.016), CABIN.roof - 0.016, 0.475], [0.04, 0.04, 1.65])}
      {bar(`floor-edge-${side}`, [side * (CABIN.halfWidth - 0.018), CABIN.floor + 0.025, 0.11], [0.04, 0.05, 2.38])}
      {bar(`aft-corner-${side}`, [side * (CABIN.halfWidth - 0.018), 0.05, CABIN.aft - 0.018], [0.045, 1.86, 0.045])}
      {[-0.1, 0.72].map(z => bar(`liner-seam-${side}-${z}`, [side * (CABIN.halfWidth - 0.002), 0.06, z], [0.006, 1.75, 0.006], materials.rail))}
    </group>)}
  </group>;
}

/** Read actual geometry after the cabin has placed the rig and camera.
 * This evidence probe can neither move the eye nor issue a crew command. */
export function CabinReadout() {
  const { camera, scene } = useThree();
  const vectors = useMemo(() => ({ eye: new THREE.Vector3(), point: new THREE.Vector3(), direction: new THREE.Vector3(), projected: new THREE.Vector3() }), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const hits = useMemo<THREE.Intersection[]>(() => [], []);
  useFrame(({ clock }) => {
    const cabin = scene.getObjectByName("cockpit-interior");
    if (!cabin?.visible) { window.__cabinReadout = undefined; return; }
    // Sample at instrument cadence; ray evidence does not need render cadence.
    if (clock.elapsedTime - (window.__cabinReadout?.sampleTime ?? -1) < 1 / 15) return;
    cabin.updateWorldMatrix(true, true);
    camera.getWorldPosition(vectors.eye);
    const windows: NonNullable<Window["__cabinReadout"]>["windows"] = [];
    const crewRays: Record<string, boolean> = {};
    const surfaces: THREE.Mesh[] = [];
    const panels: THREE.Mesh[] = [];
    cabin.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.name.startsWith("cabin-opaque-")) surfaces.push(node);
      if (node.name === "cabin-panel-opaque") panels.push(node);
    });
    const clearTo = (distance: number) => {
      ray.set(vectors.eye, vectors.direction.copy(vectors.point).sub(vectors.eye).normalize());
      hits.length = 0;
      for (const surface of surfaces) THREE.Mesh.prototype.raycast.call(surface, ray, hits);
      return hits.every(hit => hit.distance > distance + 0.001);
    };
    cabin.traverse(node => {
      if (node.name.startsWith("control-") || node.name.startsWith("instrument-")) {
        node.getWorldPosition(vectors.point);
        crewRays[node.name] = clearTo(vectors.eye.distanceTo(vectors.point));
      }
      if (!(node instanceof THREE.Mesh) || !(node.name.startsWith("cabin-window-") || node.name === "forward-glazing")) return;
      node.geometry.computeBoundingBox();
      node.geometry.boundingBox!.getCenter(vectors.point); node.localToWorld(vectors.point);
      const distance = vectors.eye.distanceTo(vectors.point);
      const clear = clearTo(distance);
      hits.length = 0;
      for (const panel of panels) THREE.Mesh.prototype.raycast.call(panel, ray, hits);
      const panelClear = hits.every(hit => hit.distance > distance + 0.001);
      vectors.projected.copy(vectors.point).project(camera);
      windows.push({ id: node.name === "forward-glazing" ? `W${windows.filter(w => w.family === "forward").length + 1}` : node.name.slice("cabin-window-".length),
        family: node.name === "forward-glazing" ? "forward" : node.name === "cabin-window-W7" || node.name === "cabin-window-W8" ? "overhead" : "aft",
        clear, panelClear, visible: Math.abs(vectors.projected.x) <= 1 && Math.abs(vectors.projected.y) <= 1 && Math.abs(vectors.projected.z) <= 1 });
    });
    window.__cabinReadout = { sampleTime: clock.elapsedTime, surfaces: surfaces.map(s => s.name), crewRays,
      eye: cabin.worldToLocal(vectors.eye).toArray(), windows };
  });
  return null;
}

declare global {
  interface Window {
    __cabinReadout?: { sampleTime: number; surfaces: string[]; eye: number[]; crewRays: Record<string, boolean>;
      windows: { id: string; family: "forward" | "overhead" | "aft"; clear: boolean; panelClear: boolean; visible: boolean }[] };
  }
}
