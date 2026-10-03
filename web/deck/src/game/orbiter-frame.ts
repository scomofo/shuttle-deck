import * as THREE from "three";

/** The exterior model's +Z points toward the nose, so its +X points port in
 * a right-handed frame. R/D/N alone is a reflection, not a rotation. */
export function orbiterModelBasis(right: THREE.Vector3, dorsal: THREE.Vector3, nose: THREE.Vector3, result = new THREE.Matrix4()) {
  return result.set(-right.x, dorsal.x, nose.x, 0,
    -right.y, dorsal.y, nose.y, 0, -right.z, dorsal.z, nose.z, 0, 0, 0, 0, 1);
}
