import * as THREE from "three";
import { NOSE_WELL } from "./gear-layout.ts";

// Visual reconstruction in the simulator's existing local coordinates: +Z is the
// nose and the wheel contact plane is Y=-2.4. NASA three-view overall dimensions
// constrain span/length; section contours remain estimates. See ORBITER_GEOMETRY.md.
// Model nose 14.3 to engine lip -11.78 gives 26.08 units over NASA's 37.24 m.
export const ORBITER_SPAN_SCALE = (23.79 / 37.24 * 26.08) / 21.98;
const sections = [
  [-10.5, 1.85, 1.25, -0.85], [-8.6, 2.3, 1.7, -1.05],
  [-5, 2.25, 1.8, -1.12], [0, 2.2, 1.85, -1.12],
  [4.7, 2.14, 1.95, -1.08], [6.3, 2.08, 2.0, -1.06],
  [7.5, 1.99, 2.0, -1.02], [8.65, 1.89, 1.93, -0.94],
  [9.65, 1.72, 1.55, -0.85], [11.3, 1.23, 0.52, -0.69],
  [13, 0.79, 0.14, -0.5], [13.85, 0.35, -0.08, -0.4],
  [14.2, 0.08, -0.23, -0.34], [14.3, 0.002, -0.29, -0.3],
];

export function profile(z: number) {
  let i = 0;
  while (i < sections.length - 2 && z > sections[i + 1][0]) i++;
  const a = sections[i], b = sections[i + 1];
  const t = THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  // Cubic interpolation keeps the body smooth without changing the endpoints.
  const at = (k: number) => {
    const prev = sections[Math.max(0, i - 1)], next = sections[Math.min(sections.length - 1, i + 2)];
    const m0 = (b[k] - prev[k]) / (b[0] - prev[0]);
    const m1 = (next[k] - a[k]) / (next[0] - a[0]);
    return (2 * t ** 3 - 3 * t ** 2 + 1) * a[k] + (t ** 3 - 2 * t ** 2 + t) * m0 * (b[0] - a[0])
      + (-2 * t ** 3 + 3 * t ** 2) * b[k] + (t ** 3 - t ** 2) * m1 * (b[0] - a[0]);
  };
  return { width: Math.max(0.002, at(1)), top: at(2), bottom: at(3) };
}

export function skinPoint(z: number, angle: number, lift = 0) {
  const { width, top, bottom } = profile(z);
  const center = (top + bottom) * 0.5;
  return [Math.cos(angle) * (width + lift), center + Math.sin(angle) * ((top - bottom) * 0.5 + lift), z];
}

function uncutFuselageGeometry() {
  const position: number[] = [], uv: number[] = [], white: number[] = [], black: number[] = [];
  const rows = 96, sides = 48;
  for (let row = 0; row <= rows; row++) {
    const z = THREE.MathUtils.lerp(-10.5, 14.3, row / rows);
    for (let side = 0; side <= sides; side++) {
      position.push(...skinPoint(z, (side / sides) * Math.PI * 2));
      uv.push(side / sides * 2, row / rows * 6);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let side = 0; side < sides; side++) {
      const z = THREE.MathUtils.lerp(-10.5, 14.3, (row + 0.5) / rows);
      const angle = ((side + 0.5) / sides) * Math.PI * 2;
      // Leave an actual opening beneath the independently animated payload doors.
      if (row >= 14 && row < 58 && angle > Math.PI / 6 && angle < Math.PI * 5 / 6) continue;
      const lower = Math.sin(angle) < -0.36;
      const indices = lower || z > 12.65 ? black : white;
      const a = row * (sides + 1) + side, b = a + sides + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([...white, ...black]);
  geo.addGroup(0, white.length, 0);
  geo.addGroup(white.length, black.length, 1);
  geo.computeVertexNormals();
  return geo;
}

type Vertex = { position: THREE.Vector3; normal: THREE.Vector3; uv: THREE.Vector2 };
function split(polygon: Vertex[], axis: "x" | "z", edge: number, sign: number) {
  const result: Vertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = sign * (a.position[axis] - edge), db = sign * (b.position[axis] - edge);
    if (da >= 0) result.push(a);
    if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
      const t = da / (da - db);
      result.push({ position: a.position.clone().lerp(b.position, t),
        normal: a.normal.clone().lerp(b.normal, t).normalize(), uv: a.uv.clone().lerp(b.uv, t) });
    }
  }
  return result;
}

/** Subtract a real rectangular nose opening from the original triangular
 * skin. Clipping retains interpolated normals/UVs and the existing bay cutout;
 * it does not place a black decal over an intact fuselage. */
export function fuselageGeometry() {
  const source = uncutFuselageGeometry();
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  const materialCounts = [0, 0];
  const at = (index: number): Vertex => ({
    position: new THREE.Vector3().fromBufferAttribute(source.getAttribute("position"), index),
    normal: new THREE.Vector3().fromBufferAttribute(source.getAttribute("normal"), index),
    uv: new THREE.Vector2(source.getAttribute("uv").getX(index), source.getAttribute("uv").getY(index)),
  });
  const emit = (polygon: Vertex[], material: number) => {
    for (let i = 1; i + 1 < polygon.length; i++) {
      for (const vertex of [polygon[0], polygon[i], polygon[i + 1]]) {
        positions.push(...vertex.position.toArray()); normals.push(...vertex.normal.toArray());
        uvs.push(...vertex.uv.toArray()); materialCounts[material]++;
      }
    }
  };
  const edges: ["x" | "z", number, number][] = [
    ["x", -NOSE_WELL.halfWidth / ORBITER_SPAN_SCALE, 1],
    ["x", NOSE_WELL.halfWidth / ORBITER_SPAN_SCALE, -1],
    ["z", NOSE_WELL.aft, 1], ["z", NOSE_WELL.forward, -1],
  ];
  for (const group of source.groups) {
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const triangle = [0, 1, 2].map(j => at(source.index!.getX(i + j)));
      const box = new THREE.Box3().setFromPoints(triangle.map(v => v.position));
      if (box.min.y >= 0 || box.max.x <= edges[0][1] || box.min.x >= edges[1][1]
        || box.max.z <= NOSE_WELL.aft || box.min.z >= NOSE_WELL.forward) {
        emit(triangle, group.materialIndex!); continue;
      }
      let inside = triangle;
      for (const [axis, edge, sign] of edges) {
        emit(split(inside, axis, edge, -sign), group.materialIndex!);
        inside = split(inside, axis, edge, sign);
        if (!inside.length) break;
      }
      // The remaining polygon lies inside the opening and is deliberately omitted.
    }
  }
  source.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.addGroup(0, materialCounts[0], 0);
  geometry.addGroup(materialCounts[0], materialCounts[1], 1);
  return geometry;
}
