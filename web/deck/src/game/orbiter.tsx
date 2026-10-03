import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sim } from "@/sim/runtime";
import { useSurfaceMaterial } from "./materials";
import { Exhaust } from "./exhaust";
import { PayloadBay } from "./payload-bay";
import { PAYLOAD_BAY } from "./payload-layout";
import { GEAR_LAYOUT, GEAR_PIVOT_Y, gearFoldAngle } from "./gear-layout";

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

// Trapezoidal outlines are sampled onto the skin to avoid glazing/skin
// intersections. Pane outlines remain estimates from NASA's structural view.
function cockpitPane(corners: number[][], inset: number, lift: number) {
  const center = corners.reduce((a,p)=>[a[0]+p[0]/4,a[1]+p[1]/4],[0,0]);
  const pts=corners.map(p=>p.map((v,i)=>THREE.MathUtils.lerp(v,center[i],inset)));
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  const steps=8;
  for(let r=0;r<=steps;r++)for(let c=0;c<=steps;c++){
    const u=c/steps,v=r/steps;
    const at=(i:number)=>THREE.MathUtils.lerp(THREE.MathUtils.lerp(pts[0][i],pts[1][i],u),THREE.MathUtils.lerp(pts[3][i],pts[2][i],u),v);
    positions.push(...skinPoint(at(1),at(0),lift));uvs.push(u,v);
    if(r<steps&&c<steps){const k=r*(steps+1)+c;indices.push(k,k+1,k+steps+1,k+steps+1,k+1,k+steps+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function omsPodGeometry() {
  // Broad aft shoulder, a short flat nozzle face and tapered forward fairing.
  // Unlike an ellipsoid, the pod retains volume around the aft RCS cluster.
  const stations = [[-10.8,0.69,0.65],[-10.3,0.98,0.88],[-9.1,1.04,0.91],[-7.5,0.89,0.80],[-6.3,0.60,0.60],[-5.5,0.10,0.16]];
  const vertices:number[]=[], uvs:number[]=[], indices:number[]=[];
  const sides=32;
  stations.forEach(([z,w,h],r)=>{
    for(let j=0;j<=sides;j++) {
      const a=j/sides*Math.PI*2;
      vertices.push(Math.cos(a)*w, Math.sin(a)*h,z);
      uvs.push(j/sides*2,r/(stations.length-1)*3);
      if(r<stations.length-1&&j<sides){const k=r*(sides+1)+j;indices.push(k,k+1,k+sides+1,k+sides+1,k+1,k+sides+2);}
    }
  });
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
  g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
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
    <group position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[size / ORBITER_SPAN_SCALE, size, size]}>
      <mesh geometry={bell} castShadow>
        <meshStandardMaterial color="#62666a" metalness={0.84} roughness={0.42} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.33, 24]} />
        <meshStandardMaterial color="#101214" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {[ [0.5, 0.6], [0.72, 1.02] ].map(([radius, along]) => (
        <mesh key={along} position={[0, along, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[radius, 0.014, 6, 32]} />
          <meshStandardMaterial color="#888e90" metalness={0.78} roughness={0.44} />
        </mesh>
      ))}
      <mesh position={[0, 1.38, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.85, 0.036, 8, 32]} />
        <meshStandardMaterial color="#a1a4a5" metalness={0.88} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Recessed black apertures suggest the visible forward/aft RCS jet clusters.
 * Positions are photo-matched presentation estimates, not thruster geometry. */
function RcsPorts() {
  const aperture = <>
    <circleGeometry args={[0.105, 14]} />
    <meshStandardMaterial color="#080a0b" roughness={0.9} metalness={0.18} side={THREE.DoubleSide} />
  </>;
  return <>
    {[-1, 1].flatMap(side => [0, 1, 2].map((row) => (
      <mesh key={`forward-${side}-${row}`} position={[side * (0.47 + row * 0.08), 1.44 - row * 0.17, 9.72 - row * 0.2]}
        rotation={[-0.32, side * 0.22, 0]} scale={[1.25, 0.72, 1]}>
        {aperture}
      </mesh>
    )))}
    {[-1, 1].flatMap(side => [-0.24, 0, 0.24].map((x, i) => (
      <mesh key={`aft-${side}-${i}`} position={[side * 2.39 + x, 1.52, -9.18 - Math.abs(x) * 0.7]}
        rotation={[-Math.PI / 2, 0, 0]}>
        {aperture}
      </mesh>
    )))}
  </>;
}

function LandingGear({ id, x, z, radius }: { id: string; x: number; z: number; radius: number }) {
  const hinge = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!hinge.current) return;
    hinge.current.rotation.x = gearFoldAngle(sim.gearPosition);
    hinge.current.visible = sim.gearPosition > 0;
  });
  const y = -2.4 + radius;
  const braces = useMemo(() => [
    tubeBetween(new THREE.Vector3(0, -0.72, -0.65), new THREE.Vector3(0, y + 0.22, 0), 0.055),
    tubeBetween(new THREE.Vector3(0.17, -1.05, 0), new THREE.Vector3(0.17, -1.3, 0.2), 0.035),
    tubeBetween(new THREE.Vector3(0.17, -1.3, 0.2), new THREE.Vector3(0.17, y + 0.16, 0), 0.035),
  ], [y]);
  useEffect(() => () => braces.forEach(g => g.dispose()), [braces]);
  return (
    <group position={[x, 0, z]} scale={[1 / ORBITER_SPAN_SCALE, 1, 1]}>
      <group name={`gear-hinge-${id}`} ref={hinge} position={[0, GEAR_PIVOT_Y, 0]} visible={false}>
        <group position={[0, -GEAR_PIVOT_Y, 0]}>
          {braces.map((g, i) => <mesh key={i} geometry={g} castShadow>
            <meshStandardMaterial color="#858e90" metalness={0.72} roughness={0.4} />
          </mesh>)}
          <mesh position={[0, -0.99, 0]} castShadow>
            <cylinderGeometry args={[0.145, 0.145, 0.45, 16]} />
            <meshStandardMaterial color="#c0c4bf" metalness={0.45} roughness={0.54} />
          </mesh>
          <mesh position={[0, (-0.75 + y) / 2, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.12, -0.75 - y, 12]} />
            <meshStandardMaterial color="#c2c5c5" metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, y, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.095, 0.095, 0.85, 12]} />
            <meshStandardMaterial color="#969da2" metalness={0.85} roughness={0.35} />
          </mesh>
          {[-1, 1].map((side) => (
            <group name={`gear-wheel-${id}-${side}`} key={side} position={[side * 0.3, y, 0]} rotation={[0, Math.PI / 2, 0]}>
              <mesh castShadow>
                <torusGeometry args={[radius * 0.69, radius * 0.31, 12, 28]} />
                <meshStandardMaterial color="#141516" roughness={0.92} />
              </mesh>
              {[-0.13, 0, 0.13].map(offset => <mesh key={offset} position={[0, 0, offset * radius]}>
                <torusGeometry args={[radius * (0.69 + Math.sqrt(0.31 ** 2 - offset ** 2)), radius * 0.012, 5, 32]} />
                <meshStandardMaterial color="#070809" roughness={1} />
              </mesh>)}
              <mesh position={[0, 0, side * radius * 0.3]}>
                <circleGeometry args={[radius * 0.36, 20]} />
                <meshStandardMaterial color="#444e52" metalness={0.65} roughness={0.5} side={THREE.DoubleSide} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[radius * 0.53, radius * 0.53, radius * 0.57, 16]} />
                <meshStandardMaterial color="#989b9c" metalness={0.7} roughness={0.45} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
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
  const srbL = useRef<THREE.Group>(null), srbR = useRef<THREE.Group>(null), et = useRef<THREE.Group>(null);
  const blanket = useSurfaceMaterial("blanket"), tile = useSurfaceMaterial("tile"), foam = useSurfaceMaterial("foam", [6, 10]);
  const geometry = useMemo(() => {
    const rightPanes = [
      [[1.50,10.85],[1.05,10.60],[1.03,9.17],[1.50,9.05]],
      [[0.97,10.47],[0.55,9.95],[0.54,8.70],[0.95,9.13]],
      [[0.47,9.75],[0.14,8.95],[0.17,7.78],[0.47,8.59]],
    ];
    const windows = [-1,1].flatMap(side=>rightPanes.map(pane=>{
      const corners=pane.map(([angle,z])=>[side<0?Math.PI-angle:angle,z]);
      return {frame:cockpitPane(corners,0,0.025),glass:cockpitPane(corners,0.13,0.045)};
    }));
    const tankProfile = new THREE.SplineCurve([
      new THREE.Vector2(0, -17.1), new THREE.Vector2(2.2, -16.3), new THREE.Vector2(3.3, -14.2),
      new THREE.Vector2(3.3, 10.8), new THREE.Vector2(3.0, 13.8), new THREE.Vector2(1.8, 18), new THREE.Vector2(0, 21.5),
    ]).getPoints(96).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
    return {
      pod: omsPodGeometry(), body: fuselageGeometry(), leftWing: sweptWing(-1), rightWing: sweptWing(1), fin: finGeometry(), windows,
      tank: new THREE.LatheGeometry(tankProfile, 48),
      wingEdges: [-1, 1].map((side) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 1.68, -0.46, 6.5), new THREE.Vector3(side * 3.4, -0.46, 0.25), new THREE.Vector3(side * 10.9, -0.46, -6.5),
      ], false, "catmullrom", 0.05), 32, 0.115, 10, false)),
      elevonSeams: [-1, 1].flatMap(side => [[2.6, 6.35], [6.43, 10.15]].flatMap(([inner, outer]) => {
        const aft = (x: number) => -8.75 + (x - 2) * 0.5 / 8.7;
        const a = new THREE.Vector3(side * inner, -0.365, aft(inner) + 1.05);
        const b = new THREE.Vector3(side * outer, -0.365, aft(outer) + 1.05);
        return [tubeBetween(a, b, 0.014),
          tubeBetween(a, new THREE.Vector3(side * inner, -0.365, aft(inner) + 0.05), 0.012),
          tubeBetween(b, new THREE.Vector3(side * outer, -0.365, aft(outer) + 0.05), 0.012)];
      })),
      rudderSeam: tubeBetween(new THREE.Vector3(0.18, 1.6, -9.7), new THREE.Vector3(0.18, 6.8, -9.9), 0.018),
    };
  }, []);
  useEffect(() => () => {
    geometry.pod.dispose(); geometry.body.dispose(); geometry.leftWing.dispose(); geometry.rightWing.dispose(); geometry.fin.dispose(); geometry.tank.dispose(); geometry.rudderSeam.dispose();
    geometry.elevonSeams.forEach(g => g.dispose());
    geometry.wingEdges.forEach((g) => g.dispose());
    geometry.windows.forEach(({ frame, glass }) => { frame.dispose(); glass.dispose(); });
  }, [geometry]);

  useFrame(() => {
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
  });

  return (
    <group>
    <group name="orbiter-airframe" scale={[ORBITER_SPAN_SCALE, 1, 1]}>
      <mesh geometry={geometry.body} castShadow receiveShadow>
        <meshStandardMaterial attach="material-0" {...blanket} color="#e4e2db" />
        <meshStandardMaterial attach="material-1" {...tile} />
      </mesh>
      {geometry.windows.map(({ frame, glass }, i) => (
        <group key={i}>
          <mesh geometry={frame}><meshStandardMaterial color="#191e22" roughness={0.78} side={THREE.DoubleSide} /></mesh>
          <mesh geometry={glass}><meshPhysicalMaterial color="#273d48" roughness={0.13} metalness={0.34} clearcoat={1} clearcoatRoughness={0.1} side={THREE.DoubleSide} /></mesh>
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
      {geometry.elevonSeams.map((g, i) => <mesh key={i} geometry={g}>
        <meshStandardMaterial color="#515552" roughness={0.9} />
      </mesh>)}
      <mesh geometry={geometry.fin} castShadow><meshStandardMaterial {...blanket} color="#deded6" /></mesh>
      <mesh geometry={geometry.rudderSeam}><meshStandardMaterial color="#424446" roughness={0.8} /></mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} geometry={geometry.pod} position={[side * 2.36, 1.04, 0]} castShadow>
          <meshStandardMaterial {...blanket} color="#d5d4cc" />
        </mesh>
      ))}
      <RcsPorts />
      <mesh position={[0, 0.1, -10.49]} rotation={[0, Math.PI, 0]} scale={[1, 0.58, 1]}>
        <circleGeometry args={[1.95, 40]} /><meshStandardMaterial {...tile} />
      </mesh>
      <EngineBell x={0} y={0.7} /><EngineBell x={-0.95} y={-0.55} /><EngineBell x={0.95} y={-0.55} />
      {/* Shared bay fitted into the existing exterior presentation envelope.
          It reads the same root travel position as the seated assembly. */}
      <group position={[0, 1.16, 4.51]} rotation={[0, Math.PI, 0]}
        scale={[3.84 / (PAYLOAD_BAY.halfWidth * 2), 0.70 / PAYLOAD_BAY.rise, 11.42 / PAYLOAD_BAY.length]}>
        <PayloadBay id="exterior" />
      </group>
      <group name="landing-gear">
        {GEAR_LAYOUT.map(g => <LandingGear key={g.id} {...g} />)}
      </group>
      {[[0, 0.7], [-0.95, -0.55], [0.95, -0.55]].map(([x, y], i) => (
        <Exhaust key={i} kind="main" position={[x, y, -11.78]} radius={2.1} length={10} />
      ))}
      {[-1, 1].map((side) => <group key={side}>
        <EngineBell x={side * 2.36} y={1.04} z={-10.8} size={0.52} />
        <Exhaust kind="oms" position={[side * 2.36, 1.04, -11.52]} radius={1.1} length={4.5} />
      </group>)}
    </group>
      <group name="booster-left" ref={srbL} position={[-6.2, -4.2, -2]}><Booster /></group>
      <group name="booster-right" ref={srbR} position={[6.2, -4.2, -2]}><Booster /></group>
      <group name="external-tank" ref={et} position={[0, -6.4, -1]}>
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
