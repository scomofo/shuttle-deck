import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Stars, useProgress } from "@react-three/drei";
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { CabinInterior } from "@/game/cabin";
import { CabinReadout } from "@/game/cabin-shell";
import { Orbiter } from "@/game/orbiter";
import { dryLakeMaterial } from "./ground-materials";
import { LANDING_STRIP, landingCoordinates, landingRotation } from "./landing-layout";
import { useLandingGuides } from "./landing-guides";
import { useReflectionEnvironment } from "./reflections";
import { earthSurfaceMaterial } from "./earth-material";
import { Runway } from "./runway";
import earthUrl from "@/assets/visuals/earth-day-2048.jpg";
import cloudsUrl from "@/assets/visuals/earth-clouds-2048.jpg";
import earthDetailUrl from "@/assets/visuals/earth-day-4096.jpg";
import cloudsDetailUrl from "@/assets/visuals/earth-clouds-4096.jpg";
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
  const { gl } = useThree();
  // Choose once at mount: resizing/rotating must not load a second GPU set.
  const detailed = useMemo(() => gl.capabilities.maxTextureSize >= 4096 &&
    window.matchMedia("(min-width: 900px)").matches, [gl]);
  const sources = useLoader(THREE.TextureLoader, detailed
    ? [earthDetailUrl, cloudsDetailUrl] : [earthUrl, cloudsUrl]);
  const maps = useMemo(() => sources.map((source, i) => {
    const texture = source.clone();
    texture.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
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
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  void main() {
    vec3 direction = normalize(vDirection);
    float elevation = clamp(direction.y, 0.0, 1.0);
    vec3 horizon = vec3(0.69, 0.75, 0.76);
    vec3 zenith = vec3(0.055, 0.19, 0.39);
    vec3 color = mix(horizon, zenith, pow(elevation, 0.42));
    vec3 sunDirection = normalize(vec3(40.0, 24.0, -30.0));
    float mu = max(dot(direction, sunDirection), 0.0);
    float sunDisc = smoothstep(0.99972, 0.99988, mu);
    float aureole = pow(mu, 48.0) * (1.0 - elevation) * 0.32;
    float horizonHaze = exp(-elevation * 16.0);
    color += vec3(1.0, 0.69, 0.38) * (sunDisc * 3.5 + aureole);
    color = mix(color, vec3(0.82, 0.78, 0.68), horizonHaze * 0.18);
    // Tiny stable dither prevents visible gradient banding without a sky texture.
    color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

function World() {
  const guides = useLandingGuides();
  const setReflections = useReflectionEnvironment();
  const craft = useRef<THREE.Group>(null);
  const earth = useRef<THREE.Group>(null);
  const clouds = useRef<THREE.Mesh>(null);
  const plasma = useRef<THREE.Group>(null);
  const ground = useRef<THREE.Group>(null);
  const skyDome = useRef<THREE.Mesh>(null);
  const blob = useRef<THREE.Mesh>(null);
  const papi = useRef<THREE.Mesh[]>([]);
  const { camera, scene } = useThree();
  const [map, cloudsMap] = useEarthMaps();
  const earthSurface = useMemo(() => earthSurfaceMaterial(map, cloudsMap), [map, cloudsMap]);
  useEffect(() => () => earthSurface.material.dispose(), [earthSurface]);
  const starField = useRef<THREE.Group>(null);
  const fieldMaterial = useMemo(() => dryLakeMaterial(), []);
  useEffect(() => () => fieldMaterial.dispose(), [fieldMaterial]);
  const space = useMemo(() => new THREE.Color("#07090d"), []);
  const sky = useMemo(() => new THREE.Color().setRGB(0.55, 0.65, 0.75), []);
  const haze = useMemo(() => new THREE.Fog(sky, 5000, 45000), [sky]);

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
    setReflections(terminal);
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
      const intensity = THREE.MathUtils.smoothstep(sim.plasma, 0.05, 1);
      plasma.current.scale.setScalar(scale * (1 + intensity * 0.18));
      plasma.current.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const material = child.material as THREE.MeshBasicMaterial;
        material.opacity = Number(child.userData.baseOpacity) * (0.35 + intensity * 0.65);
      });
    }

    const visR = 180;
    const altVis = terminal ? 0 : Math.pow(Math.max(sim.running ? sim.y : 220000, 0) / 400000, 0.55) * 42;
    if (earth.current) {
      earth.current.visible = !terminal;
      earth.current.position.set(0, -(visR + (sim.running ? Math.max(altVis, 10) : 12)), 0);
      const spin = sim.running ? -sim.x / 6_371_000 : performance.now() * 0.00004;
      earth.current.rotation.y = spin;
    }
    if (clouds.current) {
      const drift = sim.running ? -sim.x / 6_000_000 * 1.15 : 0;
      clouds.current.rotation.y = drift;
      earthSurface.cloudLongitude.value = drift / (2 * Math.PI);
    }

    if (ground.current) {
      ground.current.visible = terminal;
      const anchor = sim.terminalAnchor;
      const ax = anchor ? anchor.x : 0;
      const az = anchor ? anchor.z : 0;
      ground.current.position.set(ax - sim.x, -sim.y, az - sim.z);
      ground.current.rotation.y = landingRotation(anchor?.yaw ?? -Math.PI/2);
    }
    if (papi.current.length === 4 && (sim.phase === "taem" || sim.phase === "approach")) {
      const anchor = sim.terminalAnchor;
      const local = landingCoordinates(anchor ?? { x:0, z:0, yaw:-Math.PI/2 }, sim.x, sim.z);
      const glide = Math.atan2(Math.max(sim.y, 0), Math.max(80, LANDING_STRIP.start - local.x));
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
      const local = landingCoordinates(sim.terminalAnchor ?? { x:0, z:0, yaw:-Math.PI/2 }, sim.x, sim.z);
      blob.current.position.set(local.x, 0.035, local.z);
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
          <primitive object={earthSurface.material} attach="material" />
        </mesh>
        <mesh ref={clouds} scale={1.004}>
          <sphereGeometry args={[180, 96, 64]} />
          <meshStandardMaterial color="#ffffff" alphaMap={cloudsMap} bumpMap={cloudsMap} bumpScale={0.35}
            transparent opacity={0.86} roughness={1} envMapIntensity={0} depthWrite={false} />
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
      <group ref={ground} name="terminal-ground">
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[80000, 80000]} />
          <primitive object={fieldMaterial} attach="material" />
        </mesh>
        <mesh ref={blob} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]}>
          <circleGeometry args={[22, 28]} />
          <meshBasicMaterial color="#4d4439" transparent opacity={0} depthWrite={false} />
        </mesh>
        <Runway />
        <group visible={guides} name="simulator-approach-guides">
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
      </group>
      <group ref={craft}>
        <Orbiter />
        {/* Entry luminosity hugs the stagnation point and leading edges instead
            of reading as a single transparent ball around the vehicle. */}
        <group ref={plasma} visible={false}>
          <mesh position={[0, -0.2, 9.4]} scale={[3.1, 1.45, 4.9]} userData={{ baseOpacity: 0.34 }}>
            <sphereGeometry args={[1, 32, 18]} />
            <meshBasicMaterial color="#ff7b3d" transparent opacity={0.34} depthWrite={false}
              blending={THREE.AdditiveBlending} side={THREE.BackSide} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 5.1, -0.55, -1]} rotation={[0, side * -0.57, 0]}
              scale={[6.8, 0.5, 0.72]} userData={{ baseOpacity: 0.22 }}>
              <sphereGeometry args={[1, 28, 12]} />
              <meshBasicMaterial color="#ffb05b" transparent opacity={0.22} depthWrite={false}
                blending={THREE.AdditiveBlending} />
            </mesh>
          ))}
          <mesh position={[0, 0.1, -5.5]} scale={[4.2, 1.1, 8.5]} userData={{ baseOpacity: 0.10 }}>
            <sphereGeometry args={[1, 28, 16]} />
            <meshBasicMaterial color="#e83f25" transparent opacity={0.1} depthWrite={false}
              blending={THREE.AdditiveBlending} side={THREE.BackSide} />
          </mesh>
        </group>
      </group>
    </>
  );
}

/** Mounted after cabin look/FOV. Read-only evidence from actual scene nodes. */
function LandingReadout() {
  const { camera, scene, gl } = useThree();
  const guides = useLandingGuides();
  const projectedPoint = useMemo(() => new THREE.Vector3(), []);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const hits = useMemo<THREE.Intersection[]>(() => [], []);
  const screenPoint = useMemo(() => new THREE.Vector2(), []);
  useFrame(() => {
    const ground = scene.getObjectByName("terminal-ground");
    const threshold = ground?.getObjectByName("runway-threshold");
    if (!threshold || !ground?.visible) { window.__landingReadout = null; return; }
    ground.updateWorldMatrix(true, true);
    camera.updateMatrixWorld();
    threshold.getWorldPosition(projectedPoint).project(camera);
    screenPoint.set(projectedPoint.x,projectedPoint.y);
    ray.setFromCamera(screenPoint,camera);
    hits.length = 0;
    // Glazing intentionally ignores input ray picks. Inspect its actual
    // rendered geometry directly, without making it a clickable surface.
    const cabin = scene.getObjectByName("cockpit-interior");
    if (cabin?.visible) cabin.traverse(node => {
      if (node instanceof THREE.Mesh && node.name === "forward-glazing") THREE.Mesh.prototype.raycast.call(node,ray,hits);
    });
    const glazingDistance = Math.min(...hits.map(hit => hit.distance));
    hits.length = 0;
    if (cabin?.visible) cabin.traverse(node => {
      if (node instanceof THREE.Mesh && node.name.startsWith("cabin-opaque-")) THREE.Mesh.prototype.raycast.call(node,ray,hits);
    });
    const windowClear = Number.isFinite(glazingDistance) && hits.every(hit => hit.distance > glazingDistance + 0.001);
    const rect = gl.domElement.getBoundingClientRect();
    window.__landingReadout = { site:"Rogers Dry Lake · 23", surface:"dry-lake", guides,
      rotation:ground.rotation.y,
      windowClear,
      x:rect.left+(projectedPoint.x+1)*rect.width/2,
      y:rect.top+(1-projectedPoint.y)*rect.height/2,
      visible:Math.abs(projectedPoint.x)<=1 && Math.abs(projectedPoint.y)<=1 && Math.abs(projectedPoint.z)<=1 };
  });
  return null;
}

declare global {
  interface Window {
    __landingReadout?: { site:string; surface:"dry-lake"; guides:boolean; rotation:number; windowClear:boolean; x:number; y:number; visible:boolean } | null;
  }
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
          <CabinReadout />
          <LandingReadout />
        </Suspense>
      </Canvas>
      <AssetLoading />
    </SceneBoundary>
  );
}
