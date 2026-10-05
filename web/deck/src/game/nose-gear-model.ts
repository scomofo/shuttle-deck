import * as THREE from "three";
import { GEAR_PIVOT_Y, NOSE_WELL, gearFoldAngle, noseDoorAngle } from "./gear-layout.ts";
import { ORBITER_SPAN_SCALE, profile } from "./orbiter-skin.ts";

const STATION = 8.25;
const UP = new THREE.Vector3(0, 1, 0);

/** Lower fitted skin in physical model coordinates. This is the existing
 * elliptical contour, not an engineering pressure-vessel/OML section. */
export function noseSkinY(x: number, z: number) {
  const { width, top, bottom } = profile(z);
  const t = x / (width * ORBITER_SPAN_SCALE);
  return (top + bottom) / 2 - (top - bottom) / 2 * Math.sqrt(Math.max(0, 1 - t * t));
}

function skinUV(x: number, z: number) {
  const angle = Math.PI * 2 - Math.acos(x / (profile(z).width * ORBITER_SPAN_SCALE));
  return new THREE.Vector2(angle / Math.PI, (z + 10.5) / 24.8 * 6);
}

function patch(point: (u: number, v: number) => THREE.Vector3, cols: number, rows: number,
  coordinates?: (point: THREE.Vector3) => THREE.Vector2) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    const vertex = point(c / cols, r / rows);
    positions.push(...vertex.toArray());
    uv.push(...(coordinates ? coordinates(vertex).toArray() : [c / cols, r / rows]));
    if (r < rows && c < cols) {
      const a = r * (cols + 1) + c;
      indices.push(a, a + 1, a + cols + 1, a + 1, a + cols + 2, a + cols + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** Production mesh factory shared with geometric acceptance. No simulated
 * controls or time are owned here. Static materials and coordinates are fitted. */
export function createNoseGear(tps?: THREE.MeshStandardMaterialParameters) {
  const root = new THREE.Group(); root.name = "nose-gear-assembly";
  root.position.z = STATION; root.scale.x = 1 / ORBITER_SPAN_SCALE;
  const materials = {
    tps: new THREE.MeshStandardMaterial({ color: tps?.map ? "#ffffff" : "#202426", roughness: 0.91, ...tps, side: THREE.DoubleSide }),
    liner: new THREE.MeshStandardMaterial({ color: "#555c59", roughness: 0.78, metalness: 0.15, side: THREE.DoubleSide }),
    shadow: new THREE.MeshStandardMaterial({ color: "#222b2c", roughness: 0.9, side: THREE.DoubleSide }),
    metal: new THREE.MeshStandardMaterial({ color: "#b9bfc0", roughness: 0.36, metalness: 0.78 }),
    dull: new THREE.MeshStandardMaterial({ color: "#858e90", roughness: 0.48, metalness: 0.65 }),
    tire: new THREE.MeshStandardMaterial({ color: "#141516", roughness: 0.92 }),
    groove: new THREE.MeshStandardMaterial({ color: "#070809", roughness: 1 }),
    hub: new THREE.MeshStandardMaterial({ color: "#989b9c", roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide }),
  };
  const add = (parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const well = new THREE.Group(); well.name = "nose-well"; root.add(well);
  const { halfWidth: w, aft, forward, roof } = NOSE_WELL;
  const length = forward - aft;
  add(well, "nose-well-roof", new THREE.BoxGeometry(w * 2, 0.025, length), materials.shadow)
    .position.set(0, roof, (aft + forward) / 2 - STATION);
  for (const side of [-1, 1]) {
    add(well, `nose-well-side-${side}`, patch((u, v) => {
      const z = aft + u * length, x = side * w;
      return new THREE.Vector3(x, THREE.MathUtils.lerp(noseSkinY(x, z), roof, v), z - STATION);
    }, 16, 1), materials.liner);
  }
  for (const [name, z] of [["aft", aft], ["forward", forward]] as const) {
    add(well, `nose-well-${name}`, patch((u, v) => {
      const x = (u * 2 - 1) * w;
      return new THREE.Vector3(x, THREE.MathUtils.lerp(noseSkinY(x, z), roof, v), z - STATION);
    }, 12, 1), materials.liner);
  }
  // Fixed TPS thresholds close the fitted end/edge gaps around the leaves.
  const sill = (name: string, x0: number, x1: number, z0: number, z1: number) => {
    add(well, name, patch((u, v) => {
      const x = THREE.MathUtils.lerp(x0, x1, u), z = THREE.MathUtils.lerp(z0, z1, v);
      return new THREE.Vector3(x, noseSkinY(x, z) - 0.012, z - STATION);
    }, 8, 12, point => skinUV(point.x, point.z + STATION)), materials.tps);
  };
  sill("nose-well-threshold-aft", -w, w, aft, aft + 0.092);
  sill("nose-well-threshold-forward", -w, w, forward - 0.092, forward);
  for (const side of [-1, 1]) {
    sill(`nose-well-threshold-${side}`, side * (NOSE_WELL.doorHalfWidth + 0.008), side * w, aft + 0.10, forward - 0.10);
  }
  // Longitudinal ribs and a restrained conduit suggest the equipment well.
  // Their placement and finish are estimates, not an inventory claim.
  for (const x of [-0.5, 0, 0.5]) {
    add(well, `nose-well-rib-${x}`, new THREE.BoxGeometry(0.028, 0.045, length - 0.1), materials.dull)
      .position.set(x, roof - 0.045, (aft + forward) / 2 - STATION);
  }
  const hingeY = noseSkinY(NOSE_WELL.hingeX, aft) - 0.012;
  const hingeAxis = new THREE.Vector3(0, (noseSkinY(NOSE_WELL.hingeX, forward) - 0.012 - hingeY) / length, 1).normalize();
  const pins = new THREE.Group(); pins.name = "nose-door-hinges"; root.add(pins);
  for (const side of [-1, 1]) for (const fraction of [0.15, 0.5, 0.85]) {
    const z = aft + length * fraction;
    const pin = add(pins, `nose-door-pin-${side}-${fraction}`, new THREE.CylinderGeometry(0.032, 0.032, 0.10, 10), materials.dull);
    pin.position.set(side * NOSE_WELL.hingeX, hingeY + hingeAxis.y / hingeAxis.z * (z - aft), z - STATION);
    pin.quaternion.setFromUnitVectors(UP, hingeAxis);
  }
  const doors = [-1, 1].map(side => {
    const door = new THREE.Group(); door.name = `nose-door-${side}`;
    door.position.set(side * NOSE_WELL.hingeX, hingeY, aft - STATION); root.add(door);
    for (const [name, offset, material] of [
      ["tps", -0.012, materials.tps], ["inner", 0.015, materials.liner],
    ] as const) {
      add(door, `nose-door-${side}-${name}`, patch((u, v) => {
        const x = side * (0.008 + u * (NOSE_WELL.doorHalfWidth - 0.008));
        const z = aft + 0.10 + v * (length - 0.20);
        return new THREE.Vector3(x - door.position.x, noseSkinY(x, z) + offset - door.position.y, z - aft);
      }, 8, 20, name === "tps" ? point => skinUV(point.x + door.position.x, point.z + aft) : undefined), material);
    }
    return door;
  });
  const hinge = new THREE.Group(); hinge.name = "gear-hinge-nose";
  hinge.position.y = GEAR_PIVOT_Y; root.add(hinge);
  const strut = new THREE.Group(); strut.position.y = -GEAR_PIVOT_Y; hinge.add(strut);
  add(strut, "nose-oleo-sleeve", new THREE.CylinderGeometry(0.145, 0.145, 0.45, 16), materials.dull).position.y = -0.99;
  add(strut, "nose-oleo-piston", new THREE.CylinderGeometry(0.1, 0.12, 1.25, 12), materials.metal).position.y = -1.375;
  const axle = add(strut, "nose-axle", new THREE.CylinderGeometry(0.095, 0.095, 0.85, 12), materials.dull);
  axle.position.y = -2.0; axle.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const wheel = new THREE.Group(); wheel.name = `gear-wheel-nose-${side}`;
    wheel.position.set(side * 0.3, -2.0, 0); wheel.rotation.y = Math.PI / 2; strut.add(wheel);
    const radius = 0.4;
    add(wheel, `nose-tire-${side}`, new THREE.TorusGeometry(radius * 0.69, radius * 0.31, 12, 28), materials.tire);
    for (const offset of [-0.13, 0, 0.13]) {
      add(wheel, `nose-groove-${side}-${offset}`, new THREE.TorusGeometry(radius * (0.69 + Math.sqrt(0.31 ** 2 - offset ** 2)), radius * 0.012, 5, 32), materials.groove)
        .position.z = offset * radius;
    }
    const hub = add(wheel, `nose-hub-${side}`, new THREE.CylinderGeometry(radius * 0.53, radius * 0.53, radius * 0.57, 16), materials.hub);
    hub.rotation.x = Math.PI / 2;
    add(wheel, `nose-hub-face-${side}`, new THREE.CircleGeometry(radius * 0.36, 20), materials.dull)
      .position.z = side * radius * 0.3;
  }
  const brace = new THREE.Group(); brace.name = "nose-drag-brace"; root.add(brace);
  const links = [0, 1].map(i => add(brace, `nose-brace-${i}`, new THREE.CylinderGeometry(0.035, 0.035, 1, 10), materials.dull));
  const pin = add(brace, "nose-brace-knee", new THREE.SphereGeometry(0.048, 10, 6), materials.dull);
  const a = new THREE.Vector3(0, -0.28, -0.3), b = new THREE.Vector3(), mid = new THREE.Vector3(), delta = new THREE.Vector3();
  const orient = (mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) => {
    delta.subVectors(end, start); mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.scale.y = delta.length(); mesh.quaternion.setFromUnitVectors(UP, delta.normalize());
  };
  const update = (position: number) => {
    hinge.rotation.x = gearFoldAngle(position, "nose");
    doors.forEach((door, i) => { door.quaternion.setFromAxisAngle(hingeAxis, (i === 0 ? -1 : 1) * noseDoorAngle(position)); });
    b.set(0, -0.8, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), hinge.rotation.x).y += GEAR_PIVOT_Y;
    delta.subVectors(b, a);
    const distance = delta.length(), height = Math.sqrt(Math.max(0, 0.72 ** 2 - distance ** 2 / 4));
    mid.copy(a).add(b).multiplyScalar(0.5).addScaledVector(new THREE.Vector3(0, delta.z, -delta.y).normalize(), height);
    orient(links[0], a, mid); orient(links[1], mid, b); pin.position.copy(mid);
    root.updateMatrixWorld(true);
  };
  update(0);
  const dispose = () => {
    root.traverse(node => { if (node instanceof THREE.Mesh) node.geometry.dispose(); });
    Object.values(materials).forEach(material => material.dispose());
  };
  return { root, hinge, well, doors, update, dispose };
}
