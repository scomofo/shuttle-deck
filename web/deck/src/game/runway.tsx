import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { LANDING_STRIP } from "./landing-layout";

type Strip = [number, number, number, number]; // x, z, length, width

/** Estimated white paint on a dry-lake strip, rather than a paved airport. */
function Paint({ strips }: { strips: Strip[] }) {
  const mesh = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color: "#eee8d8", roughness: 1,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const inst = new THREE.InstancedMesh(geometry, material, strips.length);
    const matrix = new THREE.Matrix4();
    strips.forEach(([x, z, length, width], i) => {
      matrix.makeScale(length, 1, width); matrix.setPosition(x, 0.025, z); inst.setMatrixAt(i, matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = true;
    return inst;
  }, [strips]);
  useEffect(() => () => { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); }, [mesh]);
  return <primitive object={mesh} />;
}

// Stroke lettering avoids external fonts/textures. Shape and paint positions
// are illustrative; "23" comes from the STS-1 mission record.
const DIGITS: Record<string, number[][]> = {
  "0": [[0,0,0,16],[0,16,9,16],[9,16,9,0],[9,0,0,0]],
  "2": [[0,16,9,16],[9,16,9,8],[9,8,0,8],[0,8,0,0],[0,0,9,0]],
  "3": [[0,16,9,16],[9,16,9,0],[0,8,9,8],[0,0,9,0]],
  "5": [[9,16,0,16],[0,16,0,8],[0,8,9,8],[9,8,9,0],[9,0,0,0]],
};
function RunwayNumber({ number, x, reverse = false }: { number: string; x: number; reverse?: boolean }) {
  return <group position={[x, 0.03, 0]} rotation={[0, reverse ? Math.PI : 0, 0]}>
    {number.split("").flatMap((digit, i) => DIGITS[digit].map(([a,b,c,d], j) => {
      // Reading from the approach: local +X goes up each character,
      // local +Z goes to the reader's right.
      const z = i * 15 - 12;
      const length = Math.hypot(c-a, d-b);
      return <mesh key={`${i}-${j}`} position={[(b+d)/2, 0, z+(a+c)/2]} rotation={[-Math.PI/2, 0, Math.atan2(d-b, c-a)-Math.PI/2]}>
        <planeGeometry args={[length+1.8, 1.8]} />
        <meshStandardMaterial color="#eee8d8" roughness={1} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>;
    }))}
  </group>;
}

export function Runway() {
  const { start, end, width } = LANDING_STRIP;
  const strips = useMemo(() => {
    const paint: Strip[] = [];
    for (let x = start + 45; x < end; x += 90) {
      for (const side of [-1, 1]) paint.push([x, side*width/2, 55, 1.25]);
      if (x > start+160 && x < end-160) paint.push([x, 0, 40, 1.2]);
    }
    for (const x of [start+20,end-20]) for (const side of [-1,1]) paint.push([x,side*25,3,32]);
    return paint;
  }, [start, end, width]);
  return <group name="runway-23">
    <Paint strips={strips} />
    <RunwayNumber number={LANDING_STRIP.number} x={start+90} />
    <RunwayNumber number={LANDING_STRIP.reciprocal} x={end-90} reverse />
    <object3D name="runway-threshold" position={[start,0.03,0]} />
    <object3D name="runway-aim" position={[500,0.03,0]} />
  </group>;
}
