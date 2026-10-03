import * as THREE from "three";
import { CABIN } from "./cabin-layout.ts";

/** NASA's STS-1 press kit: 4.6 m × 18 m bay. Vertical contour, hinges,
 * opening angle and crew-module registration are fitted estimates. */
export const PAYLOAD_BAY = { halfWidth: 2.3, length: 18, rise: 1.28, depth: 1.94, openAngle: 1.7 };
export const SEATED_BAY_ORIGIN: [number, number, number] = [0, -0.30, CABIN.aft + 0.04];
export const BAY_OBSERVER: [number, number, number] = [0.30, 0.58, 0.85];

/** Pure display mapping of root mechanism position, not an animation owner. */
export function payloadDoorAngle(position: number) {
  return THREE.MathUtils.clamp(Number.isFinite(position) ? position : 0, 0, 1) * PAYLOAD_BAY.openAngle;
}

function curvedSurface(side: number, theta0: number, theta1: number, z0: number, z1: number, inset = 0) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const { halfWidth, rise } = PAYLOAD_BAY;
  const segments = 24;
  for (let row = 0; row <= 4; row++) for (let col = 0; col <= segments; col++) {
    const theta = THREE.MathUtils.lerp(theta0, theta1, col / segments);
    positions.push(side * ((halfWidth - inset) * Math.cos(theta) - halfWidth),
      (rise - inset) * Math.sin(theta), THREE.MathUtils.lerp(z0, z1, row / 4));
    uvs.push(col / segments, row / 4 * (z1 - z0) / 3);
    if (row < 4 && col < segments) {
      const a = row * (segments + 1) + col, b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export function createPayloadGeometry() {
  const { halfWidth: w, length, depth } = PAYLOAD_BAY;
  const liner = new THREE.BufferGeometry();
  const p: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 12; row++) for (let col = 0; col <= 32; col++) {
    const angle = col / 32 * Math.PI;
    p.push(w * Math.cos(angle), -depth * Math.sin(angle), row / 12 * length);
    uv.push(col / 32 * 3, row / 12 * 6);
    if (row < 12 && col < 32) { const a = row * 33 + col; indices.push(a, a + 1, a + 33, a + 33, a + 1, a + 34); }
  }
  liner.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  liner.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); liner.setIndex(indices); liner.computeVertexNormals();
  const aftShape = new THREE.Shape();
  aftShape.moveTo(w, 0);
  aftShape.absellipse(0, 0, w, depth, Math.PI * 2, Math.PI, true, 0);
  aftShape.lineTo(-w, 0);
  aftShape.absellipse(0, 0, w, PAYLOAD_BAY.rise, Math.PI, 0, true, 0);
  aftShape.closePath();
  const aft = new THREE.ShapeGeometry(aftShape, 32).translate(0, 0, length);
  return {
    liner, aft, fore: aft.clone().translate(0, 0, -length),
    doors: [-1, 1].map(side => curvedSurface(side, 0, Math.PI / 2, 0, length)),
    radiators: [-1, 1].map(side => Array.from({ length: 4 }, (_, i) =>
      curvedSurface(side, 0.09, Math.PI / 2 - 0.075, 0.18 + i * 4.5, 4.30 + i * 4.5, 0.022))),
  };
}
