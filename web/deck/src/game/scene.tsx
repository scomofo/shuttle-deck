import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Stars, useProgress } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { CabinInterior } from "@/game/cabin";
import { Orbiter } from "@/game/orbiter";
import { Runway } from "./runway";
import earthUrl from "@/assets/visuals/earth-day-2048.jpg";
import cloudsUrl from "@/assets/visuals/earth-clouds-2048.jpg";
import terrainUrl from "@/assets/visuals/terrain-color.webp";
import { syncAudio } from "@/game/audio";
import { bodyBasis, HAC, sim } from "@/sim/runtime";

const _right = new THREE.Vector3();
const _dorsal = new THREE.Vector3();
const _nose = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _cam = new THREE.Vector3();
const _look = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/** Local NASA observation composites; no network dependency at runtime. */
function useEarthMaps() {
  const sources = useLoader(THREE.TextureLoader, [earthUrl, cloudsUrl]);
  const { gl } = useThree();
  const maps = useMemo(() => sources.map((source, i) => {
    const texture = source.clone();
    texture.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }), [sources, gl]);
  useEffect(() => () => maps.forEach((map) => map.dispose()), [maps]);
  return maps;
}

// A thin limb glow, not a solid blue sphere. Presentation scale remains illustrative.
const limbVertex = `
  varying vec3 vNormalWorld;
  varying vec3 vPositionWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPositionWorld = world.xyz;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;
const limbFragment = `
  varying vec3 vNormalWorld;
  varying vec3 vPositionWorld;
  void main() {
    vec3 n = normalize(vNormalWorld);
    vec3 eye = normalize(cameraPosition - vPositionWorld);
    float rim = pow(1.0 - abs(dot(n, eye)), 3.0);
    float day = smoothstep(-0.25, 0.65, dot(n, normalize(vec3(40.0, 24.0, -30.0))));
    gl_FragColor = vec4(0.12, 0.38, 0.76, rim * day * 0.34);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const skyVertex = `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const skyFragment = `
  varying vec3 vDirection;
  void main() {
    vec3 direction = normalize(vDirection);
    float elevation = max(direction.y, 0.0);
    vec3 color = mix(vec3(0.60, 0.70, 0.77), vec3(0.085, 0.25, 0.46), pow(elevation, 0.4));
    float sun = pow(max(dot(direction, normalize(vec3(40.0, 24.0, -30.0))), 0.0), 180.0);
    gl_FragColor = vec4(color + vec3(1.0, 0.79, 0.51) * sun * 0.22, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Illustrative aerial wetland material; not a surveyed map of the landing site. */
function useFieldMap() {
  const source = useLoader(THREE.TextureLoader, terrainUrl);
  const { gl } = useThree();
  const map = useMemo(() => {
    const texture = source.clone();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(16, 16);
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }, [source, gl]);
  useEffect(() => () => map.dispose(), [map]);
  return map;
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
  const [map, cloudsMap] = useEarthMaps();
  const starField = useRef<THREE.Group>(null);
  const fieldMap = useFieldMap();
  const space = useMemo(() => new THREE.Color("#07090d"), []);
  const sky = useMemo(() => new THREE.Color().setRGB(0.60, 0.70, 0.77), []);
  const haze = useMemo(() => new THREE.Fog(sky, 2200, 26000), [sky]);

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
    if (starField.current) starField.current.visible = !terminal;
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
      _cam.copy(_nose).multiplyScalar(8 * scale).addScaledVector(_dorsal, 2.4 * scale).addScaledVector(_right, -0.45 * scale);
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
    if (sim.view === "cockpit") {
      // A seated eye must follow body roll. Snapping removes the sideways look
      // transient produced by interpolating toward a target only one unit away.
      camera.position.copy(_cam);
      camera.up.copy(_dorsal);
      // Estimated 7-degree downward sightline keeps the touchdown area above the glare shield.
      _look.copy(camera.position).add(_nose).addScaledVector(_dorsal, -Math.tan(7 * Math.PI / 180));
    } else {
      camera.position.lerp(_cam, 1 - Math.exp(-6 * wall));
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(_look);
  });

  return (
    <>
      <hemisphereLight args={["#d7e6f2", "#2d3940", 0.45]} />
      <ambientLight intensity={0.10} />
      <directionalLight position={[40, 24, -30]} intensity={3.0} color="#fff7ec" castShadow
        shadow-mapSize={[2048, 2048]} shadow-camera-left={-50} shadow-camera-right={50}
        shadow-camera-top={50} shadow-camera-bottom={-50} shadow-camera-far={160}
        shadow-normalBias={0.035} shadow-bias={-0.0001} />
      <directionalLight position={[-30, -10, 20]} intensity={0.28} color="#9bbbd5" />
      <group ref={starField}>
        <Stars radius={800} depth={40} count={400} factor={1.25} saturation={0} fade speed={0} />
      </group>
      {/* Fixed viewing latitude avoids looking straight into the equirectangular pole. */}
      <group ref={earth} rotation={[0, 0, 1.08]} rotation-order="ZYX">
        <mesh>
          <sphereGeometry args={[180, 96, 64]} />
          <meshStandardMaterial map={map} roughness={0.95} metalness={0} />
        </mesh>
        <mesh ref={clouds} scale={1.004}>
          <sphereGeometry args={[180, 96, 64]} />
          <meshStandardMaterial color="#ffffff" alphaMap={cloudsMap} transparent opacity={0.86} roughness={1} depthWrite={false} />
        </mesh>
        <mesh scale={1.012}>
          <sphereGeometry args={[180, 96, 64]} />
          <shaderMaterial vertexShader={limbVertex} fragmentShader={limbFragment} transparent depthWrite={false} side={THREE.BackSide} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      <mesh ref={skyDome} visible={false}>
        <sphereGeometry args={[12000, 28, 16]} />
        <shaderMaterial vertexShader={skyVertex} fragmentShader={skyFragment} side={THREE.BackSide} depthWrite={false} />
      </mesh>
      <group ref={ground}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[80000, 80000]} />
          <meshStandardMaterial map={fieldMap} roughness={1} />
        </mesh>
        <mesh ref={blob} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]}>
          <circleGeometry args={[22, 28]} />
          <meshBasicMaterial color="#06140f" transparent opacity={0} depthWrite={false} />
        </mesh>
        <Runway />
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
        <group position={[-200, 1.3, 65]}>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              ref={(el) => {
                if (el) papi.current[i] = el;
              }}
              position={[0, 0, i * 7]}
            >
              <boxGeometry args={[1.6, 0.8, 2]} />
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

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" style={{ position: "absolute", inset: 0, display: "grid", placeContent: "center", zIndex: 20, background: "#10141b", color: "#e7e2d6" }}>
      <p>The flight deck could not load its visual assets.</p>
      <button onClick={() => window.location.reload()}>Reload flight deck</button>
    </div>;
    return this.props.children;
  }
}

function AssetLoading() {
  const { active } = useProgress();
  if (!active) return null;
  return <div role="status" style={{ position: "absolute", top: "6rem", left: "50%", transform: "translateX(-50%)", color: "#e7e2d6", zIndex: 5, pointerEvents: "none" }}>Loading flight deck…</div>;
}

export function FlightScene() {
  return (
    <SceneBoundary>
      <Canvas className="flight-viewport" camera={{ position: [0, 8, -24], fov: 48, near: 0.1, far: 4000 }} dpr={[1, 1.5]} shadows={{ type: THREE.PCFShadowMap }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
        <Suspense fallback={null}>
          <World />
          <CabinInterior />
        </Suspense>
      </Canvas>
      <AssetLoading />
    </SceneBoundary>
  );
}

