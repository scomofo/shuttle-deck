import assert from "node:assert/strict";
import * as THREE from "three";
import { createNoseGear } from "../src/game/nose-gear-model.ts";
import { ORBITER_SPAN_SCALE, fuselageGeometry } from "../src/game/orbiter-skin.ts";

// Exercise the production meshes in the actual compensated airframe hierarchy.
const frame = new THREE.Group(); frame.scale.x = ORBITER_SPAN_SCALE;
const skin = new THREE.Mesh(fuselageGeometry(), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
frame.add(skin);
const nose = createNoseGear(); frame.add(nose.root); frame.updateMatrixWorld(true);
const raycaster = new THREE.Raycaster();
const shoot = (x: number, z: number, object: THREE.Object3D) => {
  raycaster.set(new THREE.Vector3(x, -3, z), new THREE.Vector3(0, 1, 0));
  return raycaster.intersectObject(object, true);
};
assert.equal(shoot(0, 8.5, skin).filter(h => h.point.y < 0).length, 0, "actual nose skin must have an opening");
assert.ok(shoot(0.9, 8.5, skin).some(h => h.point.y < 0), "adjacent skin must remain opaque");
assert.ok(shoot(0, 7.5, skin).some(h => h.point.y < 0), "aft skin retained");
assert.ok(shoot(0, 10.3, skin).some(h => h.point.y < 0), "forward skin retained");

const closedHits = shoot(0.25, 8.8, nose.root);
assert.ok(closedHits[0].object.name.includes("door") && closedHits[0].point.y < -0.85, "UP closes the actual opening with TPS leaves");

type Face = { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; box: THREE.Box3; name: string };
const faces = (object: THREE.Object3D): Face[] => {
  const out: Face[] = [];
  object.traverse(mesh => {
    if (!(mesh instanceof THREE.Mesh)) return;
    const p = mesh.geometry.getAttribute("position"), index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      const [a, b, c] = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(p, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld));
      if (new THREE.Triangle(a, b, c).getArea() < 1e-10) continue;
      out.push({ a, b, c, box: new THREE.Box3().setFromPoints([a, b, c]), name: mesh.name });
    }
  });
  return out;
};
const epsilon = 1e-6, ray = new THREE.Ray(), direction = new THREE.Vector3(), hit = new THREE.Vector3();
function edgesCross(a: Face, b: Face) {
  for (const [start, end] of [[a.a, a.b], [a.b, a.c], [a.c, a.a]]) {
    direction.subVectors(end, start); const length = direction.length();
    if (length < epsilon) continue;
    direction.divideScalar(length); ray.set(start, direction);
    if (ray.intersectTriangle(b.a, b.b, b.c, false, hit)) {
      const distance = hit.distanceTo(start);
      if (distance > epsilon && distance < length - epsilon) return true;
    }
  }
  return false;
}
const staticFaces = [...faces(skin).filter(f => f.box.min.z < 10.5 && f.box.max.z > 7.4 && f.box.min.y < 0.5), ...faces(nose.well)];
for (const face of [...faces(nose.hinge), ...faces(nose.root.getObjectByName("nose-drag-brace")!)]) {
  for (const point of [face.a, face.b, face.c]) {
    assert.ok(Math.abs(point.x) < 0.72 && point.z > 7.74 && point.z < 10.10 && point.y > -1.05 && point.y < 0.38,
      `stowed ${face.name} must fit inside the independently checked well envelope`);
  }
}
let checks = 0;
for (let step = 0; step <= 100; step++) {
  nose.update(step / 100); frame.updateMatrixWorld(true);
  const moving = [...faces(nose.hinge), ...faces(nose.root.getObjectByName("nose-drag-brace")!)];
  const doors = nose.doors.flatMap(door => faces(door));
  for (const face of moving) for (const obstacle of [...staticFaces, ...doors]) {
    if (!face.box.intersectsBox(obstacle.box)) continue;
    checks++;
    assert.ok(!edgesCross(face, obstacle) && !edgesCross(obstacle, face), `progress ${step / 100}: ${face.name} intersects ${obstacle.name}`);
  }
  // The doors themselves must clear the original skin and well through travel.
  for (const door of doors) for (const obstacle of staticFaces) {
    if (!door.box.intersectsBox(obstacle.box)) continue;
    checks++;
    assert.ok(!edgesCross(door, obstacle) && !edgesCross(obstacle, door), `progress ${step / 100}: ${door.name} intersects ${obstacle.name}`);
  }
}
const wheels = [-1, 1].map(side => nose.root.getObjectByName(`gear-wheel-nose-${side}`)!.getWorldPosition(new THREE.Vector3()));
for (const [i, point] of wheels.entries()) {
  assert.ok(point.distanceTo(new THREE.Vector3(i === 0 ? -0.3 : 0.3, -2, 8.25)) < 1e-12, "unchanged down-lock wheel centers after compensated matrix multiplication");
}
const openHits = shoot(0, 9.65, nose.root);
assert.ok(openHits[0].object.name.includes("well"), "open leaves reveal a real recessed well");
assert.ok(openHits[0].point.y > 0.3, "well has depth rather than a black skin decal");
// Negative control: the mesh-intersection check must detect a door deliberately
// placed in the tire's travel. This mutation affects only this test assembly.
nose.doors[0].position.x += 0.35; nose.update(0.4); frame.updateMatrixWorld(true);
const intrusion = faces(nose.doors[0]);
assert.ok(faces(nose.hinge).some(part => intrusion.some(door => part.box.intersectsBox(door.box)
  && (edgesCross(part, door) || edgesCross(door, part)))), "clearance detector rejects an intrusive door");
nose.dispose(); skin.geometry.dispose(); (skin.material as THREE.Material).dispose();
console.log(`Nose well: real skin opening, closed TPS leaves, contained stow, deep open well, retained wheel centers and ${checks} overlapping triangle-pair clearance checks at 101 travel poses pass; intrusive-door negative control rejected.`);
