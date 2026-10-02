import assert from "node:assert/strict";
import * as THREE from "three";
import { AFT_WINDOWS, CABIN, OVERHEAD_WINDOWS } from "../src/game/cabin-layout.ts";
import { aftStation, createWorkstationGeometry, sideStation, stationMatrix, WORKSTATIONS, type StationPose } from "../src/game/workstation-layout.ts";

const geometry = createWorkstationGeometry();
const material = new THREE.MeshBasicMaterial();
const housings = Object.values(geometry).map(g => new THREE.Mesh(g, material));
housings.forEach(m => m.updateMatrixWorld());
const ray = new THREE.Raycaster();
const eye = new THREE.Vector3(-0.6, 0, 0);

// Closed volumes, including caps and undersides. Coincident vertices from
// flat-shaded faces must still join each triangle edge exactly twice.
for (const [name, g] of Object.entries(geometry)) {
  const p = g.getAttribute("position"), index = g.index;
  const vertex = (i: number) => {
    const n = index ? index.getX(i) : i;
    return [p.getX(n), p.getY(n), p.getZ(n)].map(v => Math.round(v * 1e6)).join(",");
  };
  const edges = new Map<string, number>();
  for (let i = 0; i < (index?.count ?? p.count); i += 3) {
    const vs = [vertex(i), vertex(i + 1), vertex(i + 2)];
    for (let j = 0; j < 3; j++) {
      const key = [vs[j], vs[(j + 1) % 3]].sort().join("|");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  assert.ok([...edges.values()].every(n => n === 2), `${name}: housing must have no open edge`);
  g.computeBoundingBox();
  assert.ok(Math.abs(g.boundingBox!.min.y - CABIN.floor) < 1e-6, `${name}: housing joins the cabin floor`);
}

const faces: [StationPose, number, number][] = [
  [WORKSTATIONS.port, 0.42, 0.55], [WORKSTATIONS.starboard, 0.42, 0.55],
  [WORKSTATIONS.aftPort, 0.62, 0.72], [WORKSTATIONS.aftStarboard, 0.62, 0.72],
  [WORKSTATIONS.aftRms, 0.4, 0.3], [WORKSTATIONS.aftController, 0.2, 0.16],
  [WORKSTATIONS.aftLower, 1.34, 0.16],
  [sideStation(-1, 0.62), 0.22, 0.5], [sideStation(1, 0.62), 0.22, 0.5],
  [aftStation(-0.94, 0.25), 0.3, 0.16], [aftStation(0.94, 0.25), 0.3, 0.16],
];
// Center and corners of every mounted face have physical backing within
// 5 cm, rather than a thin plate floating ahead of a remote wall.
for (const [pose, width, height] of faces) {
  const matrix = stationMatrix(pose);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
  for (const x of [-0.49, 0, 0.49]) for (const y of [-0.49, 0, 0.49]) {
    const point = new THREE.Vector3(x * width, y * height, 0.02).applyMatrix4(matrix);
    ray.set(point, normal.clone().negate());
    const hit = ray.intersectObjects(housings)[0];
    assert.ok(hit && hit.distance < 0.05, `Mounted face at ${pose.position}: missing backing near ${x},${y}`);
    ray.set(eye, point.clone().sub(eye).normalize());
    assert.ok(ray.intersectObjects(housings).every(h => h.distance > point.distanceTo(eye)), `Face at ${pose.position}, sample ${x},${y}: console must stay behind the face from the commander eye`);
  }
}

// Supports must never seal the roof/aft windows, even though the wall and
// floor connection now fills the former gaps behind the panels.
for (const p of [...OVERHEAD_WINDOWS.map(p => new THREE.Vector3(p.x, CABIN.roof, p.z)),
  ...AFT_WINDOWS.map(p => new THREE.Vector3(p.x, p.y, CABIN.aft))]) {
  ray.set(eye, p.clone().sub(eye).normalize());
  assert.ok(ray.intersectObjects(housings).every(h => h.distance > p.distanceTo(eye)), "Window center must clear the console assembly");
}
Object.values(geometry).forEach(g => g.dispose()); material.dispose();
console.log("Workstations: closed floor-connected housings, backing at 99 face samples, exposed panels and clear roof/aft sightlines passed.");
