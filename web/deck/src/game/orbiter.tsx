import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sim } from "@/sim/runtime";
import { useSurfaceMaterial } from "./materials";
import { Exhaust } from "./exhaust";

// Visual reconstruction in the simulator's existing local coordinates: +Z is the
// nose and the wheel contact plane is Y=-2.4. These are estimated proportions,
// not a dimensionally calibrated orbiter model or collision geometry.
const sections = [
  [-10.5, 1.85, 1.25, -0.85], [-8.6, 2.3, 1.7, -1.05],
  [-5, 2.25, 1.8, -1.12], [0, 2.2, 1.85, -1.12],
  [4.7, 2.14, 1.95, -1.08], [6.6, 2.02, 2.3, -1.02],
  [8, 1.84, 2.1, -0.95], [9.4, 1.52, 1.48, -0.83],
  [11.3, 1.07, 0.69, -0.68], [13, 0.6, 0.1, -0.53],
  [14.2, 0.08, -0.23, -0.34], [14.3, 0.002, -0.29, -0.3],
];

function profile(z: number) {
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

function skinPoint(z: number, angle: number, lift = 0) {
  const { width, top, bottom } = profile(z);
  const center = (top + bottom) * 0.5;
  return [Math.cos(angle) * (width + lift), center + Math.sin(angle) * ((top - bottom) * 0.5 + lift), z];
}

function fuselageGeometry() {
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

function sweptWing(side: number) {
  const points = [[1.68, 6.5], [3.4, 0.25], [10.9, -6.5], [10.7, -8.25], [2.0, -8.75]];
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(side * x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.08, bevelThickness: 0.055 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -0.65, 0);
  return geo;
}

function finGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-4.8, 1.25);
  shape.lineTo(-8.1, 6.9);
  shape.lineTo(-10.6, 7.3);
  shape.lineTo(-10.6, 1.0);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 2 });
  // Shape X is longitudinal Z; extrusion becomes lateral X.
  geo.rotateY(-Math.PI / 2);
  geo.translate(0.12, 0, 0);
  return geo;
}

function windowGeometry(a0: number, a1: number, z0: number, z1: number, lift: number, steps = 3) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let r = 0; r <= steps; r++) {
    for (let c = 0; c <= steps; c++) {
      positions.push(...skinPoint(THREE.MathUtils.lerp(z0, z1, r / steps), THREE.MathUtils.lerp(a0, a1, c / steps), lift));
      uvs.push(c / steps * (steps > 3 ? 0.75 : 1), r / steps * (steps > 3 ? 2.84 : 1));
    }
  }
  for (let r = 0; r < steps; r++) for (let c = 0; c < steps; c++) {
    const a = r * (steps + 1) + c, b = a + steps + 1;
    indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function tubeBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number) {
  return new THREE.TubeGeometry(new THREE.LineCurve3(start, end), 1, radius, 8, false);
}

function EngineBell({ x, y, z = -10.4, size = 1 }: { x: number; y: number; z?: number; size?: number }) {
  const bell = useMemo(() => new THREE.LatheGeometry([
    new THREE.Vector2(0.3, 0), new THREE.Vector2(0.34, 0.22),
    new THREE.Vector2(0.5, 0.6), new THREE.Vector2(0.72, 1.02), new THREE.Vector2(0.85, 1.38),
  ], 32), []);
  useEffect(() => () => bell.dispose(), [bell]);
  return (
    <group position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} scale={size}>
      <mesh geometry={bell} castShadow>
        <meshStandardMaterial color="#62666a" metalness={0.84} roughness={0.42} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.33, 24]} />
        <meshStandardMaterial color="#101214" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.85, 0.036, 8, 32]} />
        <meshStandardMaterial color="#a1a4a5" metalness={0.88} roughness={0.3} />
      </mesh>
    </group>
  );
}

function LandingGear({ x, z, radius }: { x: number; z: number; radius: number }) {
  const y = -2.4 + radius;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, (-0.75 + y) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.12, -0.75 - y, 12]} />
        <meshStandardMaterial color="#c2c5c5" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.095, 0.095, 0.85, 12]} />
        <meshStandardMaterial color="#969da2" metalness={0.85} roughness={0.35} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.3, y, 0]} rotation={[0, Math.PI / 2, 0]}>
          <mesh castShadow>
            <torusGeometry args={[radius * 0.69, radius * 0.31, 12, 28]} />
            <meshStandardMaterial color="#141516" roughness={0.92} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[radius * 0.53, radius * 0.53, radius * 0.57, 16]} />
            <meshStandardMaterial color="#989b9c" metalness={0.7} roughness={0.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Booster() {
  const panel = useSurfaceMaterial("panel");
  return (
    <>
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[1.15, 1.15, 27, 32]} />
        <meshStandardMaterial bumpMap={panel.bumpMap} bumpScale={panel.bumpScale} color="#efeee9" metalness={0.12} roughness={0.65} />
      </mesh>
      <mesh position={[0, 0, 15.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <coneGeometry args={[1.15, 3.2, 32]} />
        <meshStandardMaterial bumpMap={panel.bumpMap} bumpScale={panel.bumpScale} color="#eeede7" roughness={0.7} />
      </mesh>
      {[-12.3, -7.1, -1.5, 4.1, 9.5, 12.4].map((z) => (
        <mesh key={z} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.18, 1.18, 0.14, 32]} />
          <meshStandardMaterial color="#4d5152" roughness={0.65} metalness={0.25} />
        </mesh>
      ))}
      <mesh position={[0, 0, -13.4]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.0, 1.4, 1.6, 32, 1, true]} />
        <meshStandardMaterial color="#777b7d" metalness={0.7} roughness={0.45} side={THREE.DoubleSide} />
      </mesh>
      <Exhaust kind="booster" position={[0, 0, -14.2]} radius={3.4} length={19} />
    </>
  );
}

export function Orbiter() {
  const bayL = useRef<THREE.Group>(null), bayR = useRef<THREE.Group>(null);
  const srbL = useRef<THREE.Group>(null), srbR = useRef<THREE.Group>(null), et = useRef<THREE.Group>(null);
  const gear = useRef<THREE.Group>(null);
  const blanket = useSurfaceMaterial("blanket"), tile = useSurfaceMaterial("tile"), foam = useSurfaceMaterial("foam", [6, 10]);
  const geometry = useMemo(() => {
    const windows = [
      [0.18, 0.65, 6.4, 7.8], [0.72, 1.06, 7.25, 8.7], [1.14, 1.49, 7.8, 9.05],
      [1.65, 2.0, 7.8, 9.05], [2.08, 2.42, 7.25, 8.7], [2.49, 2.96, 6.4, 7.8],
    ].map(([a, b, z0, z1]) => ({ frame: windowGeometry(a - 0.035, b + 0.035, z0 - 0.1, z1 + 0.1, 0.025), glass: windowGeometry(a, b, z0, z1, 0.045) }));
    const tankProfile = new THREE.SplineCurve([
      new THREE.Vector2(0, -17.1), new THREE.Vector2(2.2, -16.3), new THREE.Vector2(3.3, -14.2),
      new THREE.Vector2(3.3, 10.8), new THREE.Vector2(3.0, 13.8), new THREE.Vector2(1.8, 18), new THREE.Vector2(0, 21.5),
    ]).getPoints(96).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
    return {
      doorL: windowGeometry(Math.PI / 2 + 0.006, Math.PI * 5 / 6 + 0.02, -6.91, 4.51, 0.025, 24).translate(1.92, -1.16, 1.2),
      doorR: windowGeometry(Math.PI / 6 - 0.02, Math.PI / 2 - 0.006, -6.91, 4.51, 0.025, 24).translate(-1.92, -1.16, 1.2),
      body: fuselageGeometry(), leftWing: sweptWing(-1), rightWing: sweptWing(1), fin: finGeometry(), windows,
      tank: new THREE.LatheGeometry(tankProfile, 48),
      wingEdges: [-1, 1].map((side) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 1.68, -0.46, 6.5), new THREE.Vector3(side * 3.4, -0.46, 0.25), new THREE.Vector3(side * 10.9, -0.46, -6.5),
      ], false, "catmullrom", 0.05), 32, 0.115, 10, false)),
      rudderSeam: tubeBetween(new THREE.Vector3(0.18, 1.6, -9.7), new THREE.Vector3(0.18, 6.8, -9.9), 0.018),
    };
  }, []);
  useEffect(() => () => {
    geometry.doorL.dispose(); geometry.doorR.dispose(); geometry.body.dispose(); geometry.leftWing.dispose(); geometry.rightWing.dispose(); geometry.fin.dispose(); geometry.tank.dispose(); geometry.rudderSeam.dispose();
    geometry.wingEdges.forEach((g) => g.dispose());
    geometry.windows.forEach(({ frame, glass }) => { frame.dispose(); glass.dispose(); });
  }, [geometry]);

  useFrame((_, delta) => {
    const doorAngle = sim.doorsOpen ? 1.7 : 0;
    if (bayL.current) bayL.current.rotation.z = THREE.MathUtils.damp(bayL.current.rotation.z, doorAngle, 3, delta);
    if (bayR.current) bayR.current.rotation.z = THREE.MathUtils.damp(bayR.current.rotation.z, -doorAngle, 3, delta);
    if (srbL.current && srbR.current) {
      const age = sim.srbAttached ? 0 : Math.min(sim.srbSepAge, 12);
      // Direct orbit/entry/approach starts never carried a launch stack.
      const flyingOff = sim.mode === "launch" && sim.srbSepAge > 0 && age < 12;
      srbL.current.visible = sim.srbAttached || flyingOff;
      srbR.current.visible = srbL.current.visible;
      srbL.current.position.set(-6.2 - age * 3.2, -4.2 - age * 2.4, -2);
      srbR.current.position.set(6.2 + age * 3.2, -4.2 - age * 2.4, -2);
    }
    if (et.current) {
      const age = sim.etAttached ? 0 : Math.min(sim.etSepAge, 14);
      et.current.visible = sim.etAttached || (sim.mode === "launch" && sim.etSepAge > 0 && age < 14);
      et.current.position.set(0, -6.4 - age * 2.1, -1 - age * 4);
    }
    if (gear.current) gear.current.visible = sim.gear || sim.phase === "rollout" || sim.phase === "landed";
  });

  return (
    <group>
      <mesh geometry={geometry.body} castShadow receiveShadow>
        <meshStandardMaterial attach="material-0" {...blanket} color="#e4e2db" />
        <meshStandardMaterial attach="material-1" {...tile} />
      </mesh>
      {geometry.windows.map(({ frame, glass }, i) => (
        <group key={i}>
          <mesh geometry={frame}><meshStandardMaterial color="#191e22" roughness={0.78} /></mesh>
          <mesh geometry={glass}><meshPhysicalMaterial color="#273d48" roughness={0.13} metalness={0.34} clearcoat={1} clearcoatRoughness={0.1} /></mesh>
        </group>
      ))}
      {[geometry.leftWing, geometry.rightWing].map((wing, i) => (
        <mesh key={i} geometry={wing} castShadow receiveShadow>
          <meshStandardMaterial {...blanket} color="#d8d7d0" />
        </mesh>
      ))}
      {[geometry.leftWing, geometry.rightWing].map((wing, i) => (
        <mesh key={i} geometry={wing} position={[0, -0.61, 0]} scale={[1, 0.18, 1]} castShadow>
          <meshStandardMaterial {...tile} />
        </mesh>
      ))}
      {geometry.wingEdges.map((edge, i) => <mesh key={i} geometry={edge}><meshStandardMaterial {...tile} /></mesh>)}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 6.25, -0.35, -7.98]} rotation={[0, side * 0.07, 0]}>
          <boxGeometry args={[6.0, 0.025, 0.035]} /><meshStandardMaterial color="#343738" roughness={0.8} />
        </mesh>
      ))}
      <mesh geometry={geometry.fin} castShadow><meshStandardMaterial {...blanket} color="#deded6" /></mesh>
      <mesh geometry={geometry.rudderSeam}><meshStandardMaterial color="#424446" roughness={0.8} /></mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 2.22, 0.95, -8.7]} scale={[0.92, 0.82, 2.35]} castShadow>
          <sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial {...blanket} color="#d5d4cc" />
        </mesh>
      ))}
      <mesh position={[0, 0.1, -10.49]} rotation={[0, Math.PI, 0]} scale={[1, 0.58, 1]}>
        <circleGeometry args={[1.95, 40]} /><meshStandardMaterial {...tile} />
      </mesh>
      <EngineBell x={0} y={0.7} /><EngineBell x={-0.95} y={-0.55} /><EngineBell x={0.95} y={-0.55} />
      {/* Curved thermal blankets open about the longitudinal bay hinges. */}
      <mesh position={[0, 0, -1.2]} receiveShadow>
        <boxGeometry args={[3.75, 0.15, 11.4]} /><meshStandardMaterial {...blanket} color="#c3c2b9" />
      </mesh>
      {[-6.91, 4.51].map((z) => (
        <mesh key={z} position={[0, 0.62, z]}>
          <boxGeometry args={[3.7, 1.3, 0.12]} /><meshStandardMaterial {...blanket} color="#d3d2c9" />
        </mesh>
      ))}
      {[-5, -2.5, 0, 2.5].map((z) => (
        <mesh key={z} position={[0, 0.1, z]}>
          <boxGeometry args={[3.7, 0.1, 0.12]} /><meshStandardMaterial color="#858b8b" metalness={0.65} roughness={0.45} />
        </mesh>
      ))}
      <group ref={bayL} position={[-1.92, 1.16, -1.2]}>
        <mesh geometry={geometry.doorL} castShadow><meshStandardMaterial {...blanket} color="#ebe9e2" side={THREE.DoubleSide} /></mesh>
      </group>
      <group ref={bayR} position={[1.92, 1.16, -1.2]}>
        <mesh geometry={geometry.doorR} castShadow><meshStandardMaterial {...blanket} color="#ebe9e2" side={THREE.DoubleSide} /></mesh>
      </group>
      <group ref={gear} visible={false}>
        <LandingGear x={0} z={8.25} radius={0.4} />
        <LandingGear x={-3.25} z={-5.25} radius={0.55} /><LandingGear x={3.25} z={-5.25} radius={0.55} />
      </group>
      {[[0, 0.7], [-0.95, -0.55], [0.95, -0.55]].map(([x, y], i) => (
        <Exhaust key={i} kind="main" position={[x, y, -11.78]} radius={2.1} length={10} />
      ))}
      {[-1, 1].map((side) => <group key={side}>
        <EngineBell x={side * 2.22} y={0.95} z={-10.8} size={0.52} />
        <Exhaust kind="oms" position={[side * 2.22, 0.95, -11.52]} radius={1.1} length={4.5} />
      </group>)}
      <group ref={srbL} position={[-6.2, -4.2, -2]}><Booster /></group>
      <group ref={srbR} position={[6.2, -4.2, -2]}><Booster /></group>
      <group ref={et} position={[0, -6.4, -1]}>
        <mesh geometry={geometry.tank} rotation={[Math.PI / 2, 0, 0]} castShadow><meshStandardMaterial {...foam} bumpScale={0.004} /></mesh>
        <mesh position={[0, 0, 7.4]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[3.355, 3.355, 3.1, 48]} /><meshStandardMaterial {...foam} color="#d9b894" bumpScale={0.004} /></mesh>
        {[-12, 5.83, 8.98, 11].map((z) => (
          <mesh key={z} position={[0, 0, z]}><torusGeometry args={[3.31, 0.055, 8, 48]} /><meshStandardMaterial {...foam} color="#e8ceb0" bumpScale={0.004} /></mesh>
        ))}
        <mesh position={[0.5, 3.27, -3.8]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.11, 0.11, 20.2, 12]} /><meshStandardMaterial {...foam} color="#dfc5a6" bumpScale={0.004} /></mesh>
      </group>
    </group>
  );
}
