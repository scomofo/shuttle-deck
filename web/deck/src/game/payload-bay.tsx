import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { sim } from "@/sim/runtime";
import { useSurfaceMaterial } from "./materials";
import { createPayloadGeometry, PAYLOAD_BAY, payloadDoorAngle } from "./payload-layout";

const inert = () => null;

/** One structural bay/door assembly for the seated and exterior presentations.
 * NASA STS001-012-0331 supports the twin DFI covers and lined curved bay.
 * Contours, equipment dimensions, braces and finishes remain estimates. */
export function PayloadBay({ id }: { id: "seated" | "exterior" }) {
  const doors = useRef<(THREE.Group | null)[]>([]);
  const geometry = useMemo(createPayloadGeometry, []);
  const blanket = useSurfaceMaterial("blanket", [2, 4]);
  const materials = useMemo(() => ({
    liner: new THREE.MeshStandardMaterial({ ...blanket, color: "#dddcd3", roughness: 0.91, side: THREE.DoubleSide }),
    skin: new THREE.MeshStandardMaterial({ ...blanket, color: "#e4e2dc", roughness: 0.86, side: THREE.DoubleSide }),
    radiator: new THREE.MeshStandardMaterial({ color: "#dce1df", roughness: 0.48, metalness: 0.22, side: THREE.DoubleSide }),
    rail: new THREE.MeshStandardMaterial({ color: "#8e9590", roughness: 0.58, metalness: 0.5 }),
    wire: new THREE.MeshStandardMaterial({ color: "#6d3732", roughness: 0.94 }),
  }), [blanket.map, blanket.bumpMap]);
  useEffect(() => () => {
    geometry.liner.dispose(); geometry.aft.dispose(); geometry.fore.dispose();
    geometry.doors.forEach(g => g.dispose()); geometry.radiators.flat().forEach(g => g.dispose());
  }, [geometry]);
  useEffect(() => () => Object.values(materials).forEach(m => m.dispose()), [materials]);
  useFrame(() => {
    // Exact root position also freezes while paused and restores on the first
    // frame. There is no local damp/elapsed-time mechanism state to drift.
    const angle = payloadDoorAngle(sim.doorPosition);
    doors.current.forEach((door, i) => { if (door) door.rotation.z = (i === 0 ? 1 : -1) * angle; });
  });
  const box = (name: string, position: [number, number, number], size: [number, number, number], material = materials.rail) =>
    <mesh key={name} name={name} position={position} material={material} raycast={inert}><boxGeometry args={size} /></mesh>;
  const { halfWidth: w, length, depth } = PAYLOAD_BAY;
  return <group name={`payload-bay-${id}`}>
    <mesh name="bay-liner" geometry={geometry.liner} material={materials.liner} raycast={inert} receiveShadow />
    <mesh name="bay-aft-bulkhead" geometry={geometry.aft} material={materials.liner} raycast={inert} />
    {/* The seated assembly already has its opaque pressure-cabin boundary
        and actual apertures. Retain a fore closure in the exterior model. */}
    {id === "exterior" ? <mesh name="bay-fore-bulkhead" geometry={geometry.fore} material={materials.liner} raycast={inert} /> : null}
    {[-1, 1].map((side, i) => <group key={side}>
      {box(`bay-sill-${side}`, [side * w, 0, length / 2], [0.06, 0.08, length])}
      {[1, 4, 7, 10, 13, 16].map(z => box(`bay-hinge-${side}-${z}`, [side * w, 0.04, z], [0.09, 0.10, 0.16]))}
      <group name={`bay-door-${side < 0 ? "port" : "starboard"}`} position={[side * w, 0, 0]}
        ref={node => { doors.current[i] = node; }}>
        <mesh name={`bay-door-skin-${side}`} geometry={geometry.doors[i]} material={materials.skin} raycast={inert} castShadow />
        {geometry.radiators[i].map((g, j) => <mesh key={j} name={`bay-radiator-${side}-${j}`} geometry={g}
          material={materials.radiator} raycast={inert} />)}
      </group>
    </group>)}
    {[2, 5, 8, 11, 14, 17].map(z => <group key={z}>
      {box(`bay-keel-seam-${z}`, [0, -depth + 0.025, z], [0.32, 0.015, 0.035])}
    </group>)}
    {/* Simplified covered DFI installation, grounded in the two white boxes
        and support rack visible in the original mission photo. */}
    <group name="bay-dfi" position={[0, -0.28, 12.2]}>
      {[-1, 1].map(side => <group key={side}>
        {box(`bay-dfi-cover-${side}`, [side * 0.65, 0, 0], [1.10, 1.10, 1.45], materials.skin)}
        {box(`bay-dfi-cover-seam-${side}`, [side * 0.65, 0, -0.733], [1.08, 0.009, 0.008])}
        {box(`bay-dfi-strut-${side}`, [side * 0.70, -1.04, 0], [0.055, 1.0, 0.055])}
        {box(`bay-dfi-rack-${side}`, [side * 0.65, -0.65, 0], [1.2, 0.07, 1.6])}
      </group>)}
      {box("bay-dfi-rack-crossbar", [0, -1.35, 0], [2.8, 0.06, 0.08])}
      {box("bay-dfi-cable-bundle", [0, -0.6, -0.78], [0.08, 1.35, 0.055], materials.wire)}
    </group>
  </group>;
}
