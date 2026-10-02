import * as THREE from "three";
import { CABIN } from "./cabin-layout.ts";

export type StationPose = {
  position: [number, number, number];
  rotation: [number, number, number, THREE.EulerOrder];
};

/** Joined console topology from the existing NASA baseline Figures 4/5.
 * Coordinates, slope and clearances are presentation estimates, not STS-1
 * measurements. YXZ makes the side faces slope up toward the outboard wall. */
const SIDE_X = 1.08, SIDE_Y = -0.38, SIDE_SLOPE = -0.66;
export function sideStation(side: number, z: number): StationPose {
  return { position: [side * SIDE_X, SIDE_Y, z], rotation: [SIDE_SLOPE, -side * Math.PI / 2, 0, "YXZ"] };
}
export function aftStation(x: number, y: number): StationPose {
  return { position: [x, y, CABIN.aft - 0.06], rotation: [0, Math.PI, 0, "XYZ"] };
}
export const WORKSTATIONS = {
  port: sideStation(-1, -0.27), starboard: sideStation(1, -0.27),
  aftPort: aftStation(-0.36, -0.05), aftStarboard: aftStation(0.36, -0.05),
  aftRms: aftStation(-1.09, -0.02), aftController: aftStation(-0.94, -0.27),
  aftLower: aftStation(0, -0.55),
};

export function stationMatrix(pose: StationPose) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...pose.position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.rotation)), new THREE.Vector3(1, 1, 1));
}

/** Closed opaque housings: sloped deck, side cheeks, end caps and floor
 * contact are one volume. Panel faces sit just in front of this geometry. */
export function createWorkstationGeometry() {
  const sideConsole = (side: number) => {
    const matrix = stationMatrix(sideStation(side, 0));
    const bottom = new THREE.Vector3(0, -0.275, -0.025).applyMatrix4(matrix);
    const top = new THREE.Vector3(0, 0.275, -0.025).applyMatrix4(matrix);
    const shape = new THREE.Shape([
      new THREE.Vector2(bottom.x, CABIN.floor), new THREE.Vector2(bottom.x, bottom.y),
      new THREE.Vector2(top.x, top.y), new THREE.Vector2(side * CABIN.halfWidth, top.y),
      new THREE.Vector2(side * CABIN.halfWidth, CABIN.floor),
    ]);
    return new THREE.ExtrudeGeometry(shape, { depth: CABIN.aft + 0.64, bevelEnabled: false, steps: 1, curveSegments: 1 })
      .translate(0, 0, -0.64);
  };
  return {
    port: sideConsole(-1), starboard: sideConsole(1),
    aft: new THREE.BoxGeometry(2 * CABIN.halfWidth - 0.02, 0.33 - CABIN.floor, 0.04)
      .translate(0, (0.33 + CABIN.floor) / 2, CABIN.aft - 0.02),
  };
}
