import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { bodyBasis, sim } from "@/sim/runtime";
import { AFT_WINDOWS } from "./cabin-layout";

/** Read actual rendered hinges and nearest opaque bay hits through actual
 * glazing. This probe cannot change a camera, crew command or vehicle state. */
export function PayloadReadout() {
  const { camera, scene } = useThree();
  useFrame(({ clock }) => {
    if (clock.elapsedTime - (window.__payloadReadout?.sampleTime ?? -1) < 0.25) return;
    scene.updateMatrixWorld(true);
    const cabin = scene.getObjectByName("cockpit-interior");
    const seated = scene.getObjectByName("payload-bay-seated");
    const exterior = scene.getObjectByName("payload-bay-exterior");
    if (!cabin || !seated || !exterior) return;
    const eye = camera.getWorldPosition(new THREE.Vector3());
    const ray = new THREE.Raycaster();
    const meshes: THREE.Mesh[] = [], opaque: THREE.Mesh[] = [];
    seated.traverse(node => { if (node instanceof THREE.Mesh) meshes.push(node); });
    cabin.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      if (node.name.startsWith("cabin-opaque-") || node.name === "cabin-panel-opaque") opaque.push(node);
      for (let parent = node.parent; parent && parent !== cabin; parent = parent.parent) {
        if (parent.name === "workstation-housings" || parent.name === "crew-seat") { opaque.push(node); break; }
      }
    });
    const hitsOf = (objects: THREE.Mesh[]) => {
      const hits: THREE.Intersection[] = [];
      objects.forEach(mesh => THREE.Mesh.prototype.raycast.call(mesh, ray, hits));
      return hits.sort((a, b) => a.distance - b.distance);
    };
    const hardware: Record<string, number> = {};
    const points: Record<string, { x: number; y: number }[]> = {};
    const through = (point: THREE.Vector3) => {
      const projected = point.clone().project(camera);
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1) return;
      ray.set(eye, point.clone().sub(eye).normalize());
      const glass = hitsOf(AFT_WINDOWS.map(p => cabin.getObjectByName(`cabin-window-${p.id}`) as THREE.Mesh))[0];
      if (!glass || hitsOf(opaque).some(hit => hit.distance < glass.distance - 0.001)) return;
      const hit = hitsOf(meshes)[0];
      if (!hit || hit.distance <= glass.distance) return;
      hardware[hit.object.name] = (hardware[hit.object.name] ?? 0) + 1;
      (points[hit.object.name] ??= []).push({ x: (projected.x + 1) * window.innerWidth / 2,
        y: (1 - projected.y) * window.innerHeight / 2 });
    };
    if (cabin.visible) {
      for (const p of AFT_WINDOWS) {
        const pane = cabin.getObjectByName(`cabin-window-${p.id}`)!;
        for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++)
          through(pane.localToWorld(new THREE.Vector3(x / 7 * p.width, y / 7 * p.height, 0)));
      }
      // Small distant DFI faces can fall between a coarse aperture grid.
      // Sample their actual box faces, still requiring the closest opaque hit.
      for (const mesh of meshes.filter(m => m.name.startsWith("bay-dfi-cover-") && !m.name.includes("seam"))) {
        mesh.geometry.computeBoundingBox();
        const bounds = mesh.geometry.boundingBox!;
        for (const x of [-0.4, 0, 0.4]) for (const y of [-0.4, 0, 0.4])
          through(mesh.localToWorld(new THREE.Vector3(x * (bounds.max.x - bounds.min.x), y * (bounds.max.y - bounds.min.y), bounds.min.z)));
      }
    }
    const hinges = (bay: THREE.Object3D) => ["port", "starboard"].map(side => {
      const node = bay.getObjectByName(`bay-door-${side}`)!;
      return { side, angle: node.rotation.z, matrix: node.matrixWorld.toArray() };
    });
    const craft = scene.getObjectByName("orbiter-airframe")!;
    const nose = new THREE.Vector3(0, 0, 1).transformDirection(craft.matrixWorld);
    const basis = bodyBasis(sim.yaw, sim.pitch, sim.bank);
    const fore = exterior.getObjectByName("bay-fore-bulkhead") as THREE.Mesh | undefined;
    const foreClosureRays = [-1.7, -0.5, 0, 0.9].map(y => {
      const origin = exterior.localToWorld(new THREE.Vector3(0, y, 1));
      const point = exterior.localToWorld(new THREE.Vector3(0, y, 0));
      ray.set(origin, point.sub(origin).normalize());
      return !!fore && hitsOf([fore]).length > 0;
    });
    window.__payloadReadout = { sampleTime: clock.elapsedTime, get: sim.get, position: sim.doorPosition,
      talkback: sim.doorTalkback, paused: sim.paused, view: sim.view,
      eye: cabin.worldToLocal(eye.clone()).toArray(), hardware, points,
      seated: hinges(seated), exterior: hinges(exterior),
      noseAlignment: nose.dot(new THREE.Vector3(basis.nx, basis.ny, basis.nz)),
      exteriorVisible: craft.visible, foreClosureRays };
  });
  return null;
}

declare global {
  interface Window {
    __payloadReadout?: { sampleTime: number; get: number; position: number; talkback: string; paused: boolean; view: string;
      eye: number[]; hardware: Record<string, number>; points: Record<string, { x: number; y: number }[]>; noseAlignment: number;
      exteriorVisible: boolean; foreClosureRays: boolean[];
      seated: { side: string; angle: number; matrix: number[] }[];
      exterior: { side: string; angle: number; matrix: number[] }[] };
  }
}
