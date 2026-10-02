import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useSurfaceMaterial } from "./materials";
import { CABIN } from "./cabin-layout";
import { createWorkstationGeometry, sideStation } from "./workstation-layout";

const inert = () => null;

/** Backed side consoles and bulkhead-mounted aft station. Finishes and
 * service-cover seams are estimates; no extra crew commands are fabricated. */
export function WorkstationHousings() {
  const geometries = useMemo(createWorkstationGeometry, []);
  const surface = useSurfaceMaterial("panel", [1.6, 1.6]);
  const materials = useMemo(() => ({
    housing: new THREE.MeshStandardMaterial({ ...surface, color: "#a8aea8", roughness: 0.83, metalness: 0.1 }),
    edge: new THREE.MeshStandardMaterial({ color: "#666f6c", roughness: 0.7, metalness: 0.18 }),
    seam: new THREE.MeshStandardMaterial({ color: "#3c4543", roughness: 0.98 }),
  }), [surface.map, surface.bumpMap]);
  useEffect(() => () => Object.values(geometries).forEach(g => g.dispose()), [geometries]);
  useEffect(() => () => Object.values(materials).forEach(m => m.dispose()), [materials]);
  const bar = (position: [number, number, number], size: [number, number, number], material = materials.edge) =>
    <mesh position={position} material={material} raycast={inert}><boxGeometry args={size} /></mesh>;
  return <group name="workstation-housings">
    {Object.entries(geometries).map(([id, geometry]) =>
      <mesh key={id} name={`cabin-console-opaque-${id}`} geometry={geometry} material={materials.housing} raycast={inert} />)}
    {[-1, 1].map(side => <group key={side} {...sideStation(side, 0.33)}>
      {/* One continuous inboard lip; join seams stay behind panel faces. */}
      {bar([0, -0.285, -0.023], [1.93, 0.016, 0.02])}
      {[0.02, 0.34, 0.84].map(z => <group key={z} position={[side * (z - 0.33), 0, 0]}>
        {bar([0, 0, -0.023], [0.003, 0.55, 0.004], materials.seam)}
      </group>)}
    </group>)}
    <group position={[0, 0, CABIN.aft - 0.046]}>
      {bar([0, 0.325, 0], [2.96, 0.024, 0.018])}
      {bar([0, -0.445, 0], [2.96, 0.014, 0.008])}
      {/* Lower service-cover divisions, with no invented operational label. */}
      {[-0.72, -0.24, 0.24, 0.72].map(x => <group key={x}>
        {bar([x, -0.715, 0], [0.003, 0.30, 0.004], materials.seam)}
      </group>)}
      {bar([0, CABIN.floor + 0.025, 0], [2.98, 0.05, 0.025])}
    </group>
  </group>;
}
