import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { CabinInterior } from "@/game/cabin";
import { syncAudio } from "@/game/audio";
import { bodyBasis, HAC, sim } from "@/sim/runtime";

const _right = new THREE.Vector3();
const _dorsal = new THREE.Vector3();
const _nose = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _cam = new THREE.Vector3();
const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();

function earthTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  if (!g) return new THREE.Texture();
  const ocean = g.createLinearGradient(0, 0, 0, 512);
  ocean.addColorStop(0, "#16365f");
  ocean.addColorStop(0.45, "#1f6d86");
  ocean.addColorStop(1, "#16365f");
  g.fillStyle = ocean;
  g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 36; i++) {
    g.fillStyle = i % 4 === 0 ? "#c6b48a" : "#2d6a48";
    g.beginPath();
    g.ellipse(
      Math.random() * 1024,
      50 + Math.random() * 410,
      30 + Math.random() * 130,
      16 + Math.random() * 48,
      Math.random() * 3,
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  g.fillStyle = "#e7eef2";
  g.fillRect(0, 0, 1024, 26);
  g.fillRect(0, 486, 1024, 26);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function cloudTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (!g) return new THREE.Texture();
  g.clearRect(0, 0, 512, 256);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.35})`;
    g.beginPath();
    g.ellipse(Math.random() * 512, Math.random() * 256, 20 + Math.random() * 70, 8 + Math.random() * 16, 0, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function runwayTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (!g) return new THREE.Texture();
  g.fillStyle = "#4a4e55";
  g.fillRect(0, 0, 2048, 256);
  for (let i = 0; i < 1800; i++) {
    const shade = 40 + Math.floor(Math.random() * 28);
    g.fillStyle = `rgba(${shade},${shade},${shade + 4},0.18)`;
    g.fillRect(Math.random() * 2048, Math.random() * 256, 3, 2);
  }
  g.strokeStyle = "#f4f0e6";
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(40, 22);
  g.lineTo(2008, 22);
  g.moveTo(40, 234);
  g.lineTo(2008, 234);
  g.stroke();
  g.lineWidth = 5;
  g.beginPath();
  for (let x = 80; x < 1980; x += 64) {
    g.moveTo(x, 128);
    g.lineTo(x + 34, 128);
  }
  g.stroke();
  g.lineWidth = 10;
  for (let i = 0; i < 8; i++) {
    g.strokeRect(70 + i * 28, 48, 10, 160);
  }
  g.fillStyle = "#f4f0e6";
  g.fillRect(24, 36, 18, 184);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  return tex;
}

function fieldTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const g = canvas.getContext("2d");
  if (!g) return new THREE.Texture();
  const base = g.createLinearGradient(0, 0, 1024, 1024);
  base.addColorStop(0, "#1a4a44");
  base.addColorStop(0.45, "#24584c");
  base.addColorStop(1, "#163e3c");
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 1024);
  g.fillStyle = "#1c6e86";
  g.beginPath();
  g.ellipse(180, 820, 260, 90, -0.4, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 48; i++) {
    g.fillStyle = i % 5 === 0 ? "#c6b48a" : i % 2 === 0 ? "#1d5a40" : "#2f6d52";
    g.beginPath();
    g.ellipse(
      Math.random() * 1024,
      Math.random() * 1024,
      18 + Math.random() * 70,
      10 + Math.random() * 28,
      Math.random() * 2,
      0,
      Math.PI * 2,
    );
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.anisotropy = 8;
  return tex;
}

function deltaWing() {
  const shape = new THREE.Shape();
  shape.moveTo(0.4, 4.6);
  shape.lineTo(11.6, -0.2);
  shape.lineTo(10.6, -4.4);
  shape.lineTo(0.55, -6.8);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false, steps: 1 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0.3, 0);
  geo.computeVertexNormals();
  return geo;
}

function Orbiter() {
  const bay = useRef<THREE.Group>(null);
  const srbL = useRef<THREE.Group>(null);
  const srbR = useRef<THREE.Group>(null);
  const et = useRef<THREE.Group>(null);
  const plume = useRef<THREE.Mesh>(null);
  const srbPlumeL = useRef<THREE.Mesh>(null);
  const srbPlumeR = useRef<THREE.Mesh>(null);
  const gear = useRef<THREE.Group>(null);
  const wing = useMemo(() => deltaWing(), []);
  const tile = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e4dfd3", roughness: 0.55, metalness: 0.06, side: THREE.DoubleSide }),
    [],
  );

  useFrame(({ clock }) => {
    const flicker = 0.85 + Math.sin(clock.elapsedTime * 37) * 0.15;
    if (bay.current) bay.current.rotation.z = sim.doorsOpen ? 1.15 : 0;
    if (srbL.current && srbR.current) {
      const age = sim.srbAttached ? 0 : Math.min(sim.srbSepAge, 12);
      const flyingOff = sim.srbSepAge > 0 && age < 12;
      srbL.current.visible = sim.srbAttached || flyingOff;
      srbR.current.visible = srbL.current.visible;
      srbL.current.position.set(-6.2 - age * 3.2, -4.2 - age * 2.4, -2);
      srbR.current.position.set(6.2 + age * 3.2, -4.2 - age * 2.4, -2);
    }
    if (et.current) {
      const age = sim.etAttached ? 0 : Math.min(sim.etSepAge, 14);
      et.current.visible = sim.etAttached || (sim.etSepAge > 0 && age < 14);
      et.current.position.set(0, -6.4 - age * 2.1, -1 - age * 4);
    }
    const p = sim.plume * flicker;
    if (plume.current) {
      plume.current.visible = p > 0.05;
      plume.current.scale.set(1, 1 + p * 6, 1);
    }
    const booster = sim.srbAttached ? p : 0;
    if (srbPlumeL.current) srbPlumeL.current.visible = booster > 0.05;
    if (srbPlumeR.current) srbPlumeR.current.visible = booster > 0.05;
    if (gear.current) gear.current.visible = sim.gear || sim.phase === "rollout" || sim.phase === "landed";
  });

  return (
    <group>
      <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[2.15, 2.35, 18, 16]} />
        <meshStandardMaterial color="#e7e2d6" roughness={0.55} metalness={0.08} />
      </mesh>
      <mesh position={[0, -1.15, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[2.2, 2.4, 16, 16]} />
        <meshStandardMaterial color="#16181c" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.35, 11.2]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[2.15, 7.2, 16]} />
        <meshStandardMaterial color="#1a1c20" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.5, 6.2]}>
        <boxGeometry args={[2.2, 1.1, 3.4]} />
        <meshStandardMaterial color="#d9d4c8" roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.72, 7.1]}>
        <boxGeometry args={[1.5, 0.35, 1.2]} />
        <meshStandardMaterial color="#9fd0ff" emissive="#6aa4d4" emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 0.15, -1.2]} geometry={wing} material={tile} />
      <mesh position={[0, 0.15, -1.2]} geometry={wing} material={tile} scale={[-1, 1, 1]} />
      <mesh position={[0, -0.2, 0.6]}>
        <boxGeometry args={[3.6, 0.18, 9]} />
        <meshStandardMaterial color="#111318" roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.4, -8.6]}>
        <boxGeometry args={[0.35, 6.2, 4.2]} />
        <meshStandardMaterial color="#e7e2d6" />
      </mesh>
      <mesh position={[-2.3, 0.4, -9]}>
        <boxGeometry args={[2.2, 1.6, 3.2]} />
        <meshStandardMaterial color="#ece7db" />
      </mesh>
      <mesh position={[2.3, 0.4, -9]}>
        <boxGeometry args={[2.2, 1.6, 3.2]} />
        <meshStandardMaterial color="#ece7db" />
      </mesh>
      <group ref={bay} position={[1.15, 2.15, -1]}>
        <mesh position={[0.7, 0, 0]}>
          <boxGeometry args={[1.3, 0.12, 8]} />
          <meshStandardMaterial color="#f3eee4" />
        </mesh>
      </group>
      <group ref={gear} position={[0, -2.3, 1]}>
        <mesh position={[0, -0.8, 0]}>
          <boxGeometry args={[0.35, 1.6, 0.35]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <mesh position={[-3.2, -0.7, -1]}>
          <boxGeometry args={[0.3, 1.4, 0.3]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <mesh position={[3.2, -0.7, -1]}>
          <boxGeometry args={[0.3, 1.4, 0.3]} />
          <meshStandardMaterial color="#222" />
        </mesh>
      </group>
      <mesh ref={plume} position={[0, 0, -12.5]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1.3, 7, 12]} />
        <meshBasicMaterial color="#ffb15a" transparent opacity={0.85} />
      </mesh>
      <group ref={srbL}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.15, 1.15, 28, 12]} />
          <meshStandardMaterial color="#f4f1ea" />
        </mesh>
        <mesh ref={srbPlumeL} position={[0, 0, -16]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[1.4, 8, 10]} />
          <meshBasicMaterial color="#ffd2a0" transparent opacity={0.8} />
        </mesh>
      </group>
      <group ref={srbR}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[1.15, 1.15, 28, 12]} />
          <meshStandardMaterial color="#f4f1ea" />
        </mesh>
        <mesh ref={srbPlumeR} position={[0, 0, -16]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[1.4, 8, 10]} />
          <meshBasicMaterial color="#ffd2a0" transparent opacity={0.8} />
        </mesh>
      </group>
      <group ref={et}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[3.3, 3.3, 32, 18]} />
          <meshStandardMaterial color="#d4763a" roughness={0.48} />
        </mesh>
        <mesh position={[0, 0, 18]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[3.3, 8, 18]} />
          <meshStandardMaterial color="#e08a45" />
        </mesh>
      </group>
    </group>
  );
}

function World() {
  const craft = useRef<THREE.Group>(null);
  const earth = useRef<THREE.Group>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const plasma = useRef<THREE.Mesh>(null);
  const ground = useRef<THREE.Group>(null);
  const skyDome = useRef<THREE.Mesh>(null);
  const blob = useRef<THREE.Mesh>(null);
  const papi = useRef<THREE.Mesh[]>([]);
  const { camera, scene } = useThree();
  const map = useMemo(() => earthTexture(), []);
  const cloudsMap = useMemo(() => cloudTexture(), []);
  const runwayMap = useMemo(() => runwayTexture(), []);
  const fieldMap = useMemo(() => fieldTexture(), []);
  const space = useMemo(() => new THREE.Color("#07090d"), []);
  const sky = useMemo(() => new THREE.Color("#c5d6e2"), []);
  const haze = useMemo(() => new THREE.Fog(sky, 900, 16000), [sky]);

  useFrame((_, delta) => {
    const wall = Math.min(delta, 0.05);
    if (sim.running) sim.step(wall);
    syncAudio(sim.plume, sim.plasma, sim.qbar, sim.muted);

    const terminal =
      sim.running &&
      (sim.phase === "taem" ||
        sim.phase === "approach" ||
        sim.phase === "rollout" ||
        sim.phase === "landed" ||
        (sim.phase === "lost" && sim.y < 8000));
    const scale = terminal ? 1 : sim.running ? 0.24 : 0.22;
    const basis = bodyBasis(sim.yaw, sim.pitch, sim.bank);
    _right.set(basis.rx, basis.ry, basis.rz);
    _dorsal.set(basis.dx, basis.dy, basis.dz);
    _nose.set(basis.nx, basis.ny, basis.nz);
    _m.makeBasis(_right, _dorsal, _nose);
    if (craft.current) {
      craft.current.quaternion.setFromRotationMatrix(_m);
      craft.current.scale.setScalar(scale);
      craft.current.position.set(0, terminal ? 2.4 : 0, 0);
      const inCabin =
        sim.view === "cockpit" && sim.running && sim.phase !== "landed" && sim.phase !== "lost";
      craft.current.visible = !inCabin;
    }
    if (plasma.current) {
      plasma.current.visible = sim.plasma > 0.05 && !terminal;
      const s = scale * (1.8 + sim.plasma);
      plasma.current.scale.setScalar(s);
      (plasma.current.material as THREE.MeshBasicMaterial).opacity = 0.15 + sim.plasma * 0.45;
    }

    const visR = 180;
    const altVis = terminal ? 0 : Math.pow(Math.max(sim.running ? sim.y : 220000, 0) / 400000, 0.55) * 42;
    if (earth.current) {
      earth.current.visible = !terminal;
      earth.current.position.set(0, -(visR + (sim.running ? Math.max(altVis, 10) : 12)), 0);
      const spin = sim.running ? -sim.x / 6_371_000 : performance.now() * 0.00004;
      earth.current.rotation.y = spin;
    }
    if (clouds.current && sim.running) clouds.current.rotation.y = -sim.x / 6_000_000 * 1.15;

    if (ground.current) {
      ground.current.visible = terminal;
      ground.current.position.set(-sim.x, -sim.y, -sim.z);
    }
    if (papi.current.length === 4 && (sim.phase === "taem" || sim.phase === "approach")) {
      const glide = Math.atan2(Math.max(sim.y, 0), Math.max(80, -200 - sim.x));
      const err = glide - (10 * Math.PI) / 180;
      const nWhite = err > 0.02 ? 4 : err > 0.006 ? 3 : err > -0.006 ? 2 : err > -0.02 ? 1 : 0;
      papi.current.forEach((mesh, i) => {
        const mat = mesh.material as THREE.MeshBasicMaterial;
        const white = i >= 4 - nWhite;
        mat.color.set(white ? "#f4f1ea" : "#ff5a4a");
      });
    }

    scene.background = terminal ? sky : space;
    scene.fog = terminal ? haze : null;
    if (skyDome.current) skyDome.current.visible = terminal;
    if (blob.current) {
      blob.current.position.set(sim.x, 0.5, sim.z);
      const mat = blob.current.material as THREE.MeshBasicMaterial;
      mat.opacity = terminal ? THREE.MathUtils.clamp(1 - sim.y / 2200, 0, 0.45) : 0;
    }
    const persp = camera as THREE.PerspectiveCamera;
    persp.near = sim.view === "cockpit" ? 0.08 : terminal ? 0.4 : 0.08;
    persp.far = terminal ? 80000 : 4000;
    persp.fov = sim.view === "cockpit" ? 62 : 48;
    persp.updateProjectionMatrix();

    _fwd.set(-Math.sin(sim.yaw), 0, -Math.cos(sim.yaw));
    if (sim.view === "cockpit") {
      _cam.copy(_nose).multiplyScalar(8 * scale).addScaledVector(_dorsal, 2.4 * scale);
      _look.copy(_cam).add(_nose);
    } else if (sim.view === "tower") {
      _cam.set(terminal ? -40 : 10, terminal ? 18 : 8, terminal ? 30 : 24);
      _look.set(0, 2, 0);
    } else {
      const dist = terminal ? 64 : sim.running ? 12.5 : 16;
      const height = terminal ? 18 : sim.running ? 3.4 : 5.6;
      _cam.set(0, height, 0).addScaledVector(_fwd, -dist);
      if (sim.running && !terminal) _cam.addScaledVector(_right, 2.8);
      if (!sim.running) _cam.addScaledVector(_right, 7);
      if (terminal) {
        _look.copy(_fwd).multiplyScalar(36);
        _look.y = 2;
      } else {
        _look.set(0, sim.running ? -0.6 : -5, 0);
      }
    }
    const shake = sim.shake;
    if (shake > 0) {
      _cam.x += Math.sin(performance.now() * 0.05) * shake * 0.4;
      _cam.y += Math.cos(performance.now() * 0.07) * shake * 0.25;
    }
    camera.position.lerp(_cam, 1 - Math.exp(-6 * wall));
    camera.up.set(0, 1, 0);
    camera.lookAt(_look);
  });

  return (
    <>
      <hemisphereLight args={["#d7e6f2", "#3a332c", 0.85]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[40, 24, -30]} intensity={2.4} color="#fff6ea" />
      <directionalLight position={[-30, 10, 20]} intensity={0.6} color="#9ec4ea" />
      <Stars radius={800} depth={40} count={800} factor={3} fade speed={0.2} />
      <group ref={earth}>
        <mesh>
          <sphereGeometry args={[180, 48, 32]} />
          <meshPhongMaterial map={map} specular="#224455" shininess={8} />
        </mesh>
        <mesh ref={clouds} scale={1.02}>
          <sphereGeometry args={[180, 32, 24]} />
          <meshBasicMaterial map={cloudsMap} transparent opacity={0.35} depthWrite={false} />
        </mesh>
        <mesh scale={1.06}>
          <sphereGeometry args={[180, 32, 24]} />
          <meshBasicMaterial color="#7eb6e6" transparent opacity={0.12} side={THREE.BackSide} />
        </mesh>
      </group>
      <mesh ref={skyDome} visible={false}>
        <sphereGeometry args={[12000, 28, 16]} />
        <meshBasicMaterial color="#c5d6e2" side={THREE.BackSide} />
      </mesh>
      <group ref={ground}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[80000, 80000]} />
          <meshStandardMaterial map={fieldMap} roughness={1} />
        </mesh>
        <mesh ref={blob} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]}>
          <circleGeometry args={[22, 28]} />
          <meshBasicMaterial color="#06140f" transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2200, 0.15, 0]}>
          <planeGeometry args={[5600, 220]} />
          <meshStandardMaterial color="#2c3136" roughness={0.95} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2200, 0.22, 0]}>
          <planeGeometry args={[5200, 90]} />
          <meshStandardMaterial map={runwayMap} roughness={0.86} />
        </mesh>
        {Array.from({ length: 28 }, (_, i) => (
          <mesh key={i} position={[-400 - i * 180, 2, 0]}>
            <sphereGeometry args={[3.5, 8, 8]} />
            <meshBasicMaterial color="#ffd9a0" />
          </mesh>
        ))}
        {Array.from({ length: 8 }, (_, i) => {
          const t = ((i + 1) / 9) * Math.PI;
          const x = HAC.cx - Math.sin(t) * HAC.r;
          const z = HAC.cz - Math.cos(t) * HAC.r;
          const alt = 3600 + (2000 - 3600) * ((1 - Math.cos(t)) / 2);
          return (
            <group key={`hac-gate-${i}`} position={[x, alt, z]} rotation={[0, t + Math.PI / 2, 0]}>
              <mesh position={[-110, -18, 0]}>
                <boxGeometry args={[14, 96, 14]} />
                <meshBasicMaterial color="#e8a15a" />
              </mesh>
              <mesh position={[110, -18, 0]}>
                <boxGeometry args={[14, 96, 14]} />
                <meshBasicMaterial color="#e8a15a" />
              </mesh>
              <mesh position={[0, 26, 0]}>
                <boxGeometry args={[234, 12, 12]} />
                <meshBasicMaterial color="#ffd7a1" />
              </mesh>
            </group>
          );
        })}
        <group position={[-200, 8, 70]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              ref={(el) => {
                if (el) papi.current[i] = el;
              }}
              position={[0, 0, i * 16]}
            >
              <boxGeometry args={[5, 3.2, 7]} />
              <meshBasicMaterial color="#ff5a4a" />
            </mesh>
          ))}
        </group>
      </group>
      <group ref={craft}>
        <Orbiter />
        <mesh ref={plasma}>
          <sphereGeometry args={[16, 20, 16]} />
          <meshBasicMaterial color="#ff6a3d" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

export function FlightScene() {
  return (
    <Canvas camera={{ position: [0, 8, -24], fov: 48, near: 0.1, far: 4000 }} dpr={[1, 1.25]}>
      <World />
      <CabinInterior />
    </Canvas>
  );
}

