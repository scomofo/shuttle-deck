import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { sim } from "@/sim/runtime";
import { GEAR_LAYOUT } from "./gear-layout";

/** Read actual fitted hinges and wheel centers. No camera, commands or
 * mechanism state can be assigned through this inspection probe. */
export function GearReadout() {
  const { camera, scene } = useThree();
  useFrame(({ clock }) => {
    if (clock.elapsedTime - (window.__gearReadout?.sampleTime ?? -1) < 0.25) return;
    scene.updateMatrixWorld(true);
    const gear = scene.getObjectByName("landing-gear");
    if (!gear || !gear.getObjectByName("gear-hinge-nose")) return;
    const visible = (node: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = node; p; p = p.parent) if (!p.visible) return false;
      return true;
    };
    const assemblies = GEAR_LAYOUT.map(g => {
      const hinge = gear.getObjectByName(`gear-hinge-${g.id}`)!;
      const wheels = [-1, 1].map(side => {
        const node = gear.getObjectByName(`gear-wheel-${g.id}-${side}`)!;
        const world = node.getWorldPosition(new THREE.Vector3());
        const screen = world.clone().project(camera);
        let lowest = Infinity;
        node.traverse(mesh => {
          if (!(mesh instanceof THREE.Mesh)) return;
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          const b = mesh.geometry.boundingBox!;
          for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
            const p = gear.worldToLocal(mesh.localToWorld(new THREE.Vector3(x, y, z)));
            lowest = Math.min(lowest, p.y);
          }
        });
        return { side, center: gear.worldToLocal(world.clone()).toArray(),
          lowest,
          screen: [(screen.x + 1) * window.innerWidth / 2, (1 - screen.y) * window.innerHeight / 2],
          inFrame: Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1 && Math.abs(screen.z) <= 1 };
      });
      return { id: g.id, angle: hinge.rotation.x, visible: visible(hinge), matrix: hinge.matrix.toArray(), wheels };
    });
    const nose = gear.getObjectByName("nose-gear-assembly");
    const noseState = nose ? {
      doors: [-1, 1].map(side => {
        const door = nose.getObjectByName(`nose-door-${side}`)!;
        return { side, quaternion: door.quaternion.toArray(), matrix: door.matrix.toArray() };
      }),
      brace: ["nose-brace-0", "nose-brace-1", "nose-brace-knee"].map(name => {
        const part = nose.getObjectByName(name)!;
        return { name, matrix: part.matrix.toArray() };
      }),
    } : null;
    window.__gearReadout = { sampleTime: clock.elapsedTime, get: sim.get, position: sim.gearPosition,
      talkback: sim.gearTalkback, downLocked: sim.gear, paused: sim.paused, view: sim.view,
      camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
        fov: (camera as THREE.PerspectiveCamera).fov }, assemblies, nose: noseState };
  });
  return null;
}

declare global {
  interface Window {
    __gearReadout?: { sampleTime: number; get: number; position: number; talkback: string; downLocked: boolean;
      paused: boolean; view: string; camera: { position: number[]; quaternion: number[]; fov: number };
      assemblies: { id: string; angle: number; visible: boolean; matrix: number[];
        wheels: { side: number; center: number[]; lowest: number; screen: number[]; inFrame: boolean }[] }[];
      nose: { doors: { side: number; quaternion: number[]; matrix: number[] }[]; brace: { name: string; matrix: number[] }[] } | null };
  }
}
