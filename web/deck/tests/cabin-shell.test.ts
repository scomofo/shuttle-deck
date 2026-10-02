import assert from "node:assert/strict";
import * as THREE from "three";
import { AFT_WINDOWS, CABIN, createCabinShellGeometry, FORWARD_PANES, OVERHEAD_WINDOWS } from "../src/game/cabin-layout.ts";

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const geometry = createCabinShellGeometry();
const walls = Object.values(geometry).map(g => new THREE.Mesh(g, material));
const glass: THREE.Mesh[] = [];
const centers: THREE.Vector3[] = [];
for (const pane of FORWARD_PANES) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pane.map(p => new THREE.Vector2(...p))));
  g.translate(0, 0, CABIN.forward);
  glass.push(new THREE.Mesh(g, material));
  centers.push(new THREE.Vector3(pane.reduce((s, p) => s + p[0], 0) / pane.length, pane.reduce((s, p) => s + p[1], 0) / pane.length, CABIN.forward));
}
for (const p of OVERHEAD_WINDOWS) {
  const g = new THREE.PlaneGeometry(p.width, p.height).rotateX(Math.PI / 2).translate(p.x, CABIN.roof, p.z);
  glass.push(new THREE.Mesh(g, material)); centers.push(new THREE.Vector3(p.x, CABIN.roof, p.z));
}
for (const p of AFT_WINDOWS) {
  const g = new THREE.PlaneGeometry(p.width, p.height).translate(p.x, p.y, CABIN.aft);
  glass.push(new THREE.Mesh(g, material)); centers.push(new THREE.Vector3(p.x, p.y, CABIN.aft));
}
[...walls, ...glass].forEach(m => m.updateMatrixWorld());
const eye = new THREE.Vector3(-0.6, 0, 0);
const ray = new THREE.Raycaster();
function toward(point: THREE.Vector3) { ray.set(eye, point.clone().sub(eye).normalize()); }
for (const [i, center] of centers.entries()) {
  toward(center);
  assert.equal(ray.intersectObjects(walls).length, 0, `W${i + 1}: the aperture must be open from the commander seat`);
  assert.ok(ray.intersectObject(glass[i]).length > 0, `W${i + 1}: clear-view glazing lies on the ray`);
}

// The old roof plate hid W7/W8. Nearby roof and aft bulkhead must remain
// opaque while the window centers are genuinely open, not invisible walls.
for (const p of OVERHEAD_WINDOWS) {
  toward(new THREE.Vector3(p.x, CABIN.roof, p.z + p.height / 2 + 0.06));
  assert.ok(ray.intersectObjects(walls).length > 0, "Roof beyond the window frame is solid");
}
for (const p of AFT_WINDOWS) {
  toward(new THREE.Vector3(p.x, p.y - p.height / 2 - 0.06, CABIN.aft));
  assert.ok(ray.intersectObjects(walls).length > 0, "Aft bulkhead below the window is solid");
}
for (const point of [
  new THREE.Vector3(-1.5, 0, 0.1), new THREE.Vector3(1.5, 0, 0.1),
  new THREE.Vector3(-0.6, CABIN.floor, 0), new THREE.Vector3(-0.6, 0, CABIN.aft),
  new THREE.Vector3(-0.6, 0.55, CABIN.forward),
]) { toward(point); assert.ok(ray.intersectObjects(walls).length > 0, "Former open cabin gap is enclosed"); }

// A full sphere of sightlines must hit either opaque cabin or actual glazing.
// This catches cracks between the sloped brow, sidewalls, roof and floor.
let windowRays = 0;
for (let i = 0; i < 2400; i++) {
  const y = 1 - 2 * (i + 0.5) / 2400;
  const angle = i * Math.PI * (3 - Math.sqrt(5)), r = Math.sqrt(1 - y * y);
  ray.set(eye, new THREE.Vector3(r * Math.cos(angle), y, r * Math.sin(angle)));
  if (ray.intersectObjects(walls).length === 0) {
    windowRays++;
    assert.ok(ray.intersectObjects(glass).length > 0, `Unenclosed sightline ${i}`);
  }
}
assert.ok(windowRays > 50, "The solid enclosure must retain substantial exterior sightlines");
Object.values(geometry).forEach(g => g.dispose()); glass.forEach(m => m.geometry.dispose()); material.dispose();
console.log("Cabin geometry: 10 open glazed apertures, opaque surrounding walls and 2400 continuous seat rays passed.");
