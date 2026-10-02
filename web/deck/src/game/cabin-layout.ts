import * as THREE from "three";

export type Pane = [number, number][];

/** Presentation envelope around the existing commander eye and controls.
 * NASA's crew-station cutaway and pre-MEDS baseline establish the enclosed
 * volume/topology. These coordinates are estimates, not 1981 measurements. */
export const CABIN = {
  halfWidth: 1.5, floor: -0.88, roof: 0.98,
  forward: -1.08, aft: 1.3, browHeight: 0.64, roofStart: -0.35,
};

// Preserve the accepted forward sightline. Six separated openings W1–W6;
// polygon coordinates and the planar windshield remain estimates.
export const FORWARD_PANES: Pane[] = [
  [[-1.4, -0.02], [-1.24, -0.02], [-1.26, 0.34], [-1.35, 0.3]],
  [[-1.18, -0.02], [-1.02, -0.02], [-1.05, 0.34], [-1.16, 0.34]],
  [[-0.96, -0.02], [-0.1, -0.02], [-0.14, 0.34], [-0.93, 0.34]],
  [[0.1, -0.02], [0.96, -0.02], [0.93, 0.34], [0.14, 0.34]],
  [[1.02, -0.02], [1.18, -0.02], [1.16, 0.34], [1.05, 0.34]],
  [[1.24, -0.02], [1.4, -0.02], [1.35, 0.3], [1.26, 0.34]],
];

// Clear-view sizes from later SCOM §1.2, not certified STS-1 dimensions.
// Position/orientation in this estimated cabin is a presentation choice.
export const OVERHEAD_WINDOWS = [
  { id: "W7", x: 0.38, z: 0.35, width: 0.508, height: 0.508 },
  { id: "W8", x: -0.38, z: 0.35, width: 0.508, height: 0.508 },
];
export const AFT_WINDOWS = [
  { id: "W9", x: 0.3, y: 0.58, width: 0.368, height: 0.279 },
  { id: "W10", x: -0.3, y: 0.58, width: 0.368, height: 0.279 },
];

export function rectangle(x0: number, y0: number, x1: number, y1: number): Pane {
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
}

/** Triangulate real apertures; no transparent wall overlays hiding holes.
 * All geometries are in cabin coordinates, shared by rendering and ray tests. */
function surface(outline: Pane, holes: Pane[], map: (u: number, v: number) => [number, number, number]) {
  const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(...p)));
  shape.holes = holes.map(points => new THREE.Path(points.map(p => new THREE.Vector2(...p))));
  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.getAttribute("position");
  for (let i = 0; i < position.count; i++) position.setXYZ(i, ...map(position.getX(i), position.getY(i)));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createCabinShellGeometry() {
  const { halfWidth: w, floor, roof, forward, aft, browHeight, roofStart } = CABIN;
  const roofHoles = OVERHEAD_WINDOWS.map(p => rectangle(p.x - p.width / 2, p.z - p.height / 2, p.x + p.width / 2, p.z + p.height / 2));
  const aftHoles = AFT_WINDOWS.map(p => rectangle(p.x - p.width / 2, p.y - p.height / 2, p.x + p.width / 2, p.y + p.height / 2));
  const side: Pane = [[forward, floor], [aft, floor], [aft, roof], [roofStart, roof], [forward, browHeight]];
  return {
    forward: surface(rectangle(-w, floor, w, browHeight), FORWARD_PANES, (x, y) => [x, y, forward]),
    aft: surface(rectangle(-w, floor, w, roof), aftHoles, (x, y) => [x, y, aft]),
    roof: surface(rectangle(-w, roofStart, w, aft), roofHoles, (x, z) => [x, roof, z]),
    brow: surface(rectangle(-w, 0, w, 1), [], (x, t) => [x, browHeight + t * (roof - browHeight), forward + t * (roofStart - forward)]),
    port: surface(side, [], (z, y) => [-w, y, z]),
    starboard: surface(side, [], (z, y) => [w, y, z]),
    floor: surface(rectangle(-w, forward, w, aft), [], (x, z) => [x, floor, z]),
  };
}
