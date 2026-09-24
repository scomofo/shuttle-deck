import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getSimVersion, sim, subscribeSim } from "@/sim/runtime";
import { useSurfaceMaterial } from "@/game/materials";

import { getPanelLight } from "./panel-lighting";

const AMBER = "#e8a15a";
const GREEN = "#8fefb0";
const PLASMA = "#ff6b3d";
const VOID = "#07090d";

/** Seated-camera outline of the late-orbiter forward flight deck. Not a dimensioned station. */
const matShell = new THREE.MeshStandardMaterial({ color: "#bcbeb9", roughness: 0.74, metalness: 0.12 });
const matMullion = new THREE.MeshStandardMaterial({ color: "#454a4b", roughness: 0.56, metalness: 0.28 });
const matGasket = new THREE.MeshStandardMaterial({ color: "#171a1b", roughness: 0.94 });
const matHardware = new THREE.MeshStandardMaterial({ color: "#87918e", roughness: 0.38, metalness: 0.7 });
const matHead = new THREE.MeshStandardMaterial({ color: "#202324", roughness: 0.82 });
const matRed = new THREE.MeshStandardMaterial({ color: "#8b3529", roughness: 0.57 });
const matSeam = new THREE.MeshStandardMaterial({ color: "#385d82", roughness: 1 });
const matWindow = new THREE.MeshPhysicalMaterial({
  color: "#c0d0ce", transparent: true, opacity: 0.055, depthWrite: false,
  roughness: 0.14, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.1,
});

function useSimTick() {
  useSyncExternalStore(subscribeSim, getSimVersion, getSimVersion);
}

function headingDeg() {
  return Math.round((((-sim.yaw * 180) / Math.PI) % 360 + 360) % 360);
}

function paintGlass(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture, kind: string) {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.fillStyle = "#101418";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.save();
  g.scale(canvas.width / 360, canvas.height / 120);
  drawScreen(g, 6, 6, 348, 108, kind);
  g.restore();
  tex.needsUpdate = true;
}

function drawScreen(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: string,
) {
  g.fillStyle = "#121416";
  g.fillRect(x - 5, y - 5, w + 10, h + 10);
  const greenFace = kind === "sys" || kind === "traj" || kind === "gnc";
  g.fillStyle = greenFace ? "#06281c" : "#0c2748";
  g.fillRect(x, y, w, h);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  if (kind === "adi") drawAdi(g, x, y, w, h);
  else if (kind === "hsi") drawHsi(g, x, y, w, h);
  else if (kind === "alt" || kind === "vvi" || kind === "ami") drawTape(g, x, y, w, h, kind);
  else if (kind === "talk" || kind === "rcs") drawTalk(g, x, y, w, h);
  else if (kind === "hor") drawHorizon(g, x, y, w, h);
  else drawGreen(g, x, y, w, h, kind);
  g.restore();
}

function drawAdi(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) * 0.42;
  g.save();
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.clip();
  g.translate(cx, cy);
  g.rotate(-sim.bank);
  g.translate(0, THREE.MathUtils.clamp(sim.pitch, -0.7, 0.9) * r);
  g.fillStyle = "#1a6cb5";
  g.fillRect(-w, -h * 2, w * 2, h * 2);
  g.fillStyle = "#8a7048";
  g.fillRect(-w, 0, w * 2, h * 2);
  g.strokeStyle = "#f2efe6";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-w, 0);
  g.lineTo(w, 0);
  g.stroke();
  g.restore();
  g.strokeStyle = AMBER;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - r * 0.7, cy);
  g.lineTo(cx - r * 0.2, cy);
  g.moveTo(cx + r * 0.2, cy);
  g.lineTo(cx + r * 0.7, cy);
  g.moveTo(cx, cy);
  g.lineTo(cx, cy + r * 0.35);
  g.stroke();
}

function drawHsi(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = Math.min(w, h) * 0.38;
  g.strokeStyle = "#9fd0ff";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.save();
  g.translate(cx, cy);
  g.rotate(sim.yaw);
  g.beginPath();
  g.moveTo(0, -r);
  g.lineTo(0, r);
  g.moveTo(-r, 0);
  g.lineTo(r, 0);
  g.stroke();
  g.restore();
  g.fillStyle = "#d7ecff";
  g.font = "600 13px 'IBM Plex Mono', monospace";
  g.fillText(String(headingDeg()).padStart(3, "0"), cx - 16, y + 22);
}

function drawTape(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: string,
) {
  const alt = sim.y > 20000 ? `${(sim.y / 1000).toFixed(1)}` : `${Math.round(sim.y)}`;
  const label = kind === "alt" ? "ALT" : kind === "vvi" ? "VS" : "M / α";
  const value =
    kind === "alt" ? alt : kind === "vvi" ? `${Math.round(-sim.vy)}` : sim.mach.toFixed(2);
  const sub = kind === "ami" ? `${((sim.alpha * 180) / Math.PI).toFixed(0)}°` : kind === "alt" ? (sim.y > 20000 ? "KM" : "M") : "FPM";
  g.fillStyle = "#d7ecff";
  g.font = "600 12px 'IBM Plex Mono', monospace";
  g.fillText(label, x + 10, y + 24);
  g.font = "500 26px 'IBM Plex Mono', monospace";
  g.fillText(value, x + 10, y + h * 0.62);
  g.font = "500 12px 'IBM Plex Mono', monospace";
  g.fillText(sub, x + 10, y + h - 16);
  g.strokeStyle = "#4d88c4";
  g.strokeRect(x + w - 18, y + 12, 8, h - 24);
}

function drawTalk(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const rows: [string, boolean][] = [
    ["GEAR", sim.gear],
    ["BAY", sim.doorsOpen],
    ["FC", sim.fuelCell && sim.busVolts > 18],
    ["APU", sim.apu],
  ];
  rows.forEach((row, i) => {
    const yy = y + 22 + i * ((h - 20) / rows.length);
    g.fillStyle = "#d7ecff";
    g.font = "500 11px 'IBM Plex Mono', monospace";
    g.fillText(row[0], x + 8, yy);
    g.fillStyle = row[1] ? "#1f8f4e" : "#5a6570";
    g.fillRect(x + w - 54, yy - 14, 42, 18);
  });
}

function drawHorizon(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate(-sim.bank * 0.5);
  g.fillStyle = "#1a6cb5";
  g.fillRect(-w, -h, w * 2, h);
  g.fillStyle = "#6d8a4a";
  g.fillRect(-w, 0, w * 2, h);
  g.restore();
  g.strokeStyle = AMBER;
  g.lineWidth = 2;
  g.strokeRect(x + 8, y + 8, w - 16, h - 16);
}

function drawGreen(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: string,
) {
  const alt = sim.y > 20000 ? `${(sim.y / 1000).toFixed(1)} KM` : `${Math.round(sim.y)} M`;
  const lines =
    kind === "sys"
      ? ["GNC SYS", `ALT  ${alt}`, `M    ${sim.mach.toFixed(2)}`, `Q    ${(sim.qbar / 1000).toFixed(1)}`]
      : kind === "traj"
        ? ["TRAJ", `HDG  ${headingDeg()}`, `α    ${((sim.alpha * 180) / Math.PI).toFixed(0)}`, `G    ${sim.gLoad.toFixed(2)}`]
        : ["SM SYS", `BUS  ${sim.busVolts.toFixed(1)}`, `FC   ${sim.fuelCell ? "ON" : "OFF"}`, `APU  ${sim.apu ? "ON" : "OFF"}`];
  g.fillStyle = GREEN;
  g.font = "500 17px 'IBM Plex Mono', monospace";
  lines.forEach((line, i) => g.fillText(line, x + 14, y + 23 + i * 25));
}


function Switch({
  position,
  label,
  hot,
  onDown,
  onUp,
}: {
  position: [number, number, number];
  label: string;
  hot: boolean;
  onDown: () => void;
  onUp?: () => void;
}) {
  return (
    <group position={position}>
      <mesh position={[0, -0.01, 0]} raycast={() => null} material={matGasket}>
        <boxGeometry args={[0.068, 0.008, 0.04]} />
      </mesh>
      <mesh position={[0, -0.002, 0]} raycast={() => null} material={matHardware}>
        <cylinderGeometry args={[0.012, 0.014, 0.012, 12]} />
      </mesh>
      <mesh
        position={[0, 0.012, 0]}
        rotation={[hot ? -0.65 : 0.65, 0, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          onDown();
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          onUp?.();
        }}
        onPointerLeave={() => onUp?.()}
      >
        <boxGeometry args={[0.07, 0.055, 0.016]} />
        <meshStandardMaterial color={hot ? "#d4b27c" : "#dddcd4"} roughness={0.58} metalness={0.12} />
      </mesh>
      <SwitchLabel label={label} />
    </group>
  );
}

function SwitchLabel({ label }: { label: string }) {
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 32;
    const g = canvas.getContext("2d");
    if (g) {
      g.font = "600 22px 'IBM Plex Mono', monospace";
      g.fillStyle = "#2a3038";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, 64, 16);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [label]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position={[0, 0.048, 0.008]} raycast={() => null}>
      <planeGeometry args={[0.08, 0.018]} />
      <meshBasicMaterial map={map} transparent toneMapped={false} />
    </mesh>
  );
}

function Bar({
  position,
  args,
  rotation,
  material = matShell,
}: {
  position: [number, number, number];
  args: [number, number, number];
  rotation?: [number, number, number];
  material?: THREE.Material;
}) {
  return (
    <mesh position={position} rotation={rotation} raycast={() => null} material={material}>
      <boxGeometry args={args} />
    </mesh>
  );
}

const capGeo = new THREE.BoxGeometry(1, 1, 1);
const capMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.56, metalness: 0.12 });
const collarGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
const screwGeo = new THREE.CylinderGeometry(1, 1, 1, 12);

/** Instanced hardware adds real highlights without a draw call per fastener. */
function PanelFasteners({ width, height }: { width: number; height: number }) {
  const hardware = useMemo(() => {
    const inst = new THREE.InstancedMesh(screwGeo, matHardware, 4);
    const dummy = new THREE.Object3D();
    let index = 0;
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        dummy.position.set(x * (width / 2 - 0.018), y * (height / 2 - 0.012), 0.023);
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.scale.set(0.004, 0.003, 0.004);
        dummy.updateMatrix();
        inst.setMatrixAt(index++, dummy.matrix);
      }
    }
    inst.raycast = () => null;
    return inst;
  }, [width, height]);
  useEffect(() => () => hardware.dispose(), [hardware]);
  return <primitive object={hardware} />;
}

function PanelPlate({ width, height, material }: { width: number; height: number; material: THREE.Material }) {
  return (
    <group>
      <Bar position={[0, 0, -0.012]} args={[width + 0.009, height + 0.009, 0.012]} material={matGasket} />
      <Bar position={[0, 0, 0]} args={[width, height, 0.025]} material={material} />
      <PanelFasteners width={width} height={height} />
    </group>
  );
}

function SwitchField({
  rows,
  cols,
  width,
  height,
  reds,
}: {
  rows: number;
  cols: number;
  width: number;
  height: number;
  reds: number[];
}) {
  const meshes = useMemo(() => {
    const count = rows * cols;
    const inst = new THREE.InstancedMesh(capGeo, capMat, count);
    const collars = new THREE.InstancedMesh(collarGeo, matHardware, count);
    const dummy = new THREE.Object3D();
    const marked = new Set(reds);
    const white = new THREE.Color("#f4f1ea");
    const black = new THREE.Color("#1c1e22");
    const red = new THREE.Color("#9a3a34");
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        dummy.position.set(-width / 2 + ((c + 0.5) / cols) * width, height / 2 - ((r + 0.5) / rows) * height, 0.036);
        dummy.scale.set((width / cols) * 0.13, (height / rows) * 0.37, 0.007);
        dummy.rotation.set(i % 5 === 0 ? -0.65 : 0.75, 0, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        inst.setColorAt(i, marked.has(i) ? red : i % 8 === 0 ? black : white);
        dummy.position.z = 0.018;
        dummy.rotation.set(Math.PI / 2, 0, 0);
        dummy.scale.set(0.006, 0.006, 0.006);
        dummy.updateMatrix();
        collars.setMatrixAt(i, dummy.matrix);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    collars.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.raycast = () => null;
    collars.raycast = () => null;
    return [inst, collars];
  }, [rows, cols, width, height, reds]);
  useEffect(() => () => meshes.forEach((mesh) => mesh.dispose()), [meshes]);
  return <group>{meshes.map((mesh) => <primitive key={mesh.uuid} object={mesh} />)}</group>;
}

const GLASSES: { kind: string; x: number; y: number }[] = [
  { kind: "adi", x: -0.48, y: 0.08 },
  { kind: "sys", x: 0, y: 0.08 },
  { kind: "adi", x: 0.48, y: 0.08 },
  { kind: "alt", x: -0.48, y: -0.09 },
  { kind: "traj", x: 0, y: -0.09 },
  { kind: "talk", x: 0.48, y: -0.09 },
];
const OVERHEAD_REDS = [2, 3, 16, 17, 44];
const SIDE_REDS = [4, 9];

// Commander-eye composition. Window topology follows NASA p3-7; seat layout follows p3-9;
// coordinates are visual estimates, not a measured eye box.
const FORWARD_PANES: [number, number][][] = [
  [[-1.60,-0.10],[-1.04,-0.10],[-0.89,0.31],[-1.32,0.27]],
  [[-1.00,-0.10],[-0.50,-0.10],[-0.42,0.40],[-0.85,0.33]],
  [[-0.46,-0.10],[0.32,-0.10],[0.30,0.44],[-0.38,0.41]],
  [[0.37,-0.10],[1.15,-0.10],[1.07,0.41],[0.39,0.44]],
  [[1.19,-0.10],[1.69,-0.10],[1.54,0.33],[1.11,0.40]],
  [[1.73,-0.10],[2.29,-0.10],[2.01,0.27],[1.58,0.31]],
];
function WindowFrame({ points }: { points: [number,number][] }) {
  const glazing=useMemo(()=>new THREE.ShapeGeometry(new THREE.Shape(points.map(p=>new THREE.Vector2(...p)))),[points]);
  useEffect(()=>()=>glazing.dispose(),[glazing]);
  return <group position={[0,0,-1.08]}>
    <mesh geometry={glazing} material={matWindow} raycast={()=>null}/>
    {points.map(([x,y],i)=>{
      const [ex,ey]=points[(i+1)%points.length];
      const length=Math.hypot(ex-x,ey-y),angle=Math.atan2(ey-y,ex-x);
      return <group key={i} position={[(x+ex)/2,(y+ey)/2,0.012]} rotation={[0,0,angle]}>
        <Bar args={[length+0.016,0.036,0.042]} position={[0,0,0]} material={matGasket}/>
        <Bar args={[length+0.012,0.022,0.044]} position={[0,0,0.010]} material={matMullion}/>
      </group>;
    })}
  </group>;
}

function DisplayHousing({ map }: { map: THREE.Texture }) {
  const screen = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => { if (screen.current) screen.current.color.setScalar(0.45 + getPanelLight() * 0.55); });
  return (
    <group>
      <Bar position={[0, 0, -0.014]} args={[0.432, 0.162, 0.037]} material={matGasket} />
      <Bar position={[0, 0, 0]} args={[0.418, 0.151, 0.026]} material={matMullion} />
      <Bar position={[0, 0.004, 0.015]} args={[0.368, 0.126, 0.006]} material={matGasket} />
      <mesh position={[0, 0.004, 0.019]} raycast={() => null}>
        <planeGeometry args={[0.36, 0.12]} />
        <meshBasicMaterial ref={screen} map={map} toneMapped={false} />
      </mesh>
      {/* Raised perimeter gives the glazing a recessed edge without covering telemetry. */}
      {[-1, 1].map(side => <group key={side}>
        <Bar position={[side * 0.19, 0.004, 0.028]} args={[0.018, 0.142, 0.018]} material={matHead} />
        <Bar position={[0, 0.004 + side * 0.068, 0.028]} args={[0.398, 0.009, 0.018]} material={matHead} />
      </group>)}
      <mesh position={[0, 0.004, 0.024]} raycast={() => null}>
        <planeGeometry args={[0.36, 0.12]} />
        <meshPhysicalMaterial color="#c9e1e8" transparent opacity={0.065} roughness={0.19}
          clearcoat={0.7} clearcoatRoughness={0.22} depthWrite={false} />
      </mesh>
      <PanelFasteners width={0.425} height={0.156} />
      {[-0.135, -0.09, -0.045, 0, 0.045, 0.09, 0.135].map((x) => (
        <Bar key={x} position={[x, -0.066, 0.016]} args={[0.022, 0.008, 0.006]} material={matHead} />
      ))}
    </group>
  );
}

export function CabinInterior() {
  useSimTick();
  const root = useRef<THREE.Group>(null);
  const glass = useRef<THREE.Mesh>(null);
  const veil = useRef<THREE.Mesh>(null);
  const sticks = useRef<THREE.Group>(null);
  const displaySpill = useRef<THREE.PointLight>(null);
  const { camera } = useThree();
  const panelSurface = useSurfaceMaterial("panel", [2.2, 1]);
  const clothSurface = useSurfaceMaterial("blanket", [3, 3]);
  const panelMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    ...panelSurface, color: "#b7bcb6", metalness: 0.08, roughness: 0.76, clearcoat: 0.18, clearcoatRoughness: 0.65,
  }), [panelSurface.map, panelSurface.bumpMap]);
  const seatMaterial = useMemo(() => new THREE.MeshPhysicalMaterial({
    ...clothSurface, color: "#294974", metalness: 0, roughness: 0.98, bumpScale: 0.002, sheen: 0.65, sheenRoughness: 0.9, sheenColor: new THREE.Color("#607a95"),
  }), [clothSurface.map, clothSurface.bumpMap]);
  useEffect(() => () => {
    panelMaterial.dispose();
    seatMaterial.dispose();
  }, [panelMaterial, seatMaterial]);
  const tex = useMemo(() => {
    const make = (w: number, h: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.needsUpdate = true;
      return { canvas, map };
    };
    const glasses = GLASSES.map(() => make(720, 240));
    return { glasses };
  }, []);
  useEffect(() => () => tex.glasses.forEach(({ map }) => map.dispose()), [tex]);
  const lastInstrumentPaint = useRef(-1);

  useFrame(({ clock }) => {
    const rig = root.current;
    if (!rig) return;
    const seated =
      sim.view === "cockpit" && sim.running && sim.phase !== "landed" && sim.phase !== "lost";
    rig.visible = seated;
    if (!seated) return;
    if (displaySpill.current) displaySpill.current.intensity = 0.025 * getPanelLight();
    rig.position.copy(camera.position);
    rig.quaternion.copy(camera.quaternion);
    // Instrument textures need readable updates, not six uploads on every render frame.
    if (clock.elapsedTime - lastInstrumentPaint.current >= 1 / 15) {
      GLASSES.forEach((glassFace, i) => paintGlass(tex.glasses[i].canvas, tex.glasses[i].map, glassFace.kind));
      lastInstrumentPaint.current = clock.elapsedTime;
    }
    const glassMat = glass.current?.material as THREE.MeshBasicMaterial | undefined;
    if (glassMat) {
      const hot = sim.plasma > 0.08;
      glassMat.color.set(hot ? PLASMA : "#b7d4ee");
      glassMat.opacity = hot ? 0.08 + sim.plasma * 0.45 : 0.04;
    }
    const veilMat = veil.current?.material as THREE.MeshBasicMaterial | undefined;
    if (veilMat) veilMat.opacity = sim.blackout ? 0.72 : 0;
    if (sticks.current) {
      sticks.current.rotation.z = THREE.MathUtils.clamp(-sim.bank * 0.4, -0.5, 0.5);
      sticks.current.rotation.x = THREE.MathUtils.clamp(sim.pitch * 0.3, -0.35, 0.55);
    }
  });

  const live = sim.burning();

  return (
    <group ref={root} name="cockpit-interior" visible={false}>
      <pointLight ref={displaySpill} position={[0, -0.22, -0.52]} intensity={0.01875} distance={1.1} decay={2} color="#80bac7" />
      <pointLight position={[-0.3, 0.12, -0.15]} intensity={0.22} distance={2.4} decay={2} color="#dae5ed" />
      <Bar position={[0, 0.58, -0.72]} args={[2.2, 0.07, 0.9]} />
      <Bar position={[-1.05, 0.02, -0.62]} args={[0.08, 0.85, 0.85]} />
      <Bar position={[1.05, 0.02, -0.62]} args={[0.08, 0.85, 0.85]} />
      <Bar position={[0, -0.55, -0.48]} args={[1.6, 0.06, 0.9]} material={matHead} />
      <group position={[0, 0.5, -0.78]} rotation={[0.85, 0, 0]}>
        <PanelPlate width={1.7} height={0.32} material={panelMaterial} />
        {[-0.565, 0, 0.565].map((x) => (
          <Bar key={x} position={[x, 0, 0.014]} args={[0.003, 0.29, 0.002]} material={matGasket} />
        ))}
        <SwitchField rows={4} cols={14} width={1.55} height={0.26} reds={OVERHEAD_REDS} />
      </group>

      {FORWARD_PANES.map((points,i)=><WindowFrame key={i} points={points}/>)}
      {[-0.32, 0.32].map((x) => (
        <group key={x}>
          <Bar position={[x, 0.5, -0.92]} args={[0.34, 0.02, 0.025]} material={matMullion} />
          <Bar position={[x, 0.66, -0.92]} args={[0.34, 0.02, 0.025]} material={matMullion} />
          <Bar position={[x - 0.16, 0.58, -0.92]} args={[0.02, 0.16, 0.025]} material={matMullion} />
          <Bar position={[x + 0.16, 0.58, -0.92]} args={[0.02, 0.16, 0.025]} material={matMullion} />
        </group>
      ))}

      <mesh ref={glass} position={[0, 0.17, -1.12]} raycast={() => null}>
        <planeGeometry args={[2.0, 0.46]} />
        <meshBasicMaterial color="#b7d4ee" transparent opacity={0.04} depthWrite={false} />
      </mesh>
      <mesh ref={veil} position={[0, 0.12, -0.62]} raycast={() => null}>
        <planeGeometry args={[2.2, 1.4]} />
        <meshBasicMaterial color={VOID} transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh position={[0.24, -0.135, -1.01]} rotation={[0.25, 0, 0]} raycast={() => null} material={matHead}>
        <boxGeometry args={[2.25, 0.055, 0.22]} />
      </mesh>

      <group position={[0, -0.36, -0.78]} rotation={[-0.62, 0, 0]}>
        <PanelPlate width={1.55} height={0.44} material={panelMaterial} />
        {GLASSES.map((glassFace, i) => (
          <group key={glassFace.kind + i} position={[glassFace.x, glassFace.y, 0.02]}>
            <DisplayHousing map={tex.glasses[i].map} />
          </group>
        ))}
      </group>

      <group position={[-0.92, -0.08, -0.7]} rotation={[-0.2, 0.65, 0]}>
        <PanelPlate width={0.42} height={0.55} material={panelMaterial} />
        <SwitchField rows={6} cols={4} width={0.34} height={0.42} reds={SIDE_REDS} />
      </group>
      <group position={[0.92, -0.08, -0.7]} rotation={[-0.2, -0.65, 0]}>
        <PanelPlate width={0.42} height={0.55} material={panelMaterial} />
        <SwitchField rows={6} cols={4} width={0.34} height={0.42} reds={SIDE_REDS} />
      </group>

      <group position={[0, -0.4, -0.5]}>
        <mesh position={[0, -0.08, 0.08]} raycast={() => null} material={matShell}>
          <boxGeometry args={[0.36, 0.24, 0.46]} />
        </mesh>
        <mesh position={[0, 0.02, -0.16]} rotation={[-0.55, 0, 0]} raycast={() => null} material={matShell}>
          <boxGeometry args={[0.36, 0.22, 0.04]} />
        </mesh>
        <group position={[0, 0.05, -0.14]} rotation={[-0.7, 0, 0]}>
          <PanelPlate width={0.32} height={0.18} material={panelMaterial} />
          <Switch
            position={[-0.1, 0.04, 0.04]}
            label="BURN"
            hot={live}
            onDown={() => sim.onKey("KeyB", true)}
            onUp={() => sim.onKey("KeyB", false)}
          />
          <Switch position={[0.02, 0.04, 0.04]} label="BAY" hot={sim.doorsOpen} onDown={() => sim.toggleDoors()} />
          <Switch
            position={[0.12, 0.04, 0.04]}
            label="FC"
            hot={sim.fuelCell}
            onDown={() => {
              sim.fuelCell = !sim.fuelCell;
              sim.notify();
            }}
          />
          <Switch
            position={[0.12, -0.05, 0.04]}
            label="APU"
            hot={sim.apu}
            onDown={() => {
              sim.apu = !sim.apu;
              sim.notify();
            }}
          />
        </group>
        <group
          position={[-0.1, 0.02, 0.12]}
          rotation={[sim.gear ? -0.9 : 0.7, 0, 0]}
          onPointerDown={(event) => {
            event.stopPropagation();
            sim.toggleGear();
          }}
        >
          <mesh position={[0, 0.06, 0]} material={matRed}>
            <boxGeometry args={[0.028, 0.12, 0.02]} />
          </mesh>
          <mesh position={[0, 0.12, 0]} material={matHead}>
            <boxGeometry args={[0.05, 0.02, 0.03]} />
          </mesh>
        </group>
      </group>

      <group ref={sticks}>
        {[-0.28, 0.28].map((x) => (
          <group key={x} position={[x, -0.28, -0.32]}>
            <mesh position={[0, -0.035, 0]} raycast={() => null} material={matGasket}>
              <cylinderGeometry args={[0.022, 0.038, 0.045, 12]} />
            </mesh>
            <mesh position={[0, 0.02, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.014, 0.018, 0.12, 16]} />
              <meshStandardMaterial color="#1c1e22" roughness={0.45} />
            </mesh>
            <mesh position={[0, 0.09, 0.015]} raycast={() => null}>
              <boxGeometry args={[0.045, 0.035, 0.055]} />
              <meshStandardMaterial color="#1c1e22" roughness={0.4} />
            </mesh>
          </group>
        ))}
      </group>

      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.46, -0.36, -0.4]}>
          <Bar position={[0, -0.07, 0.02]} args={[0.32, 0.07, 0.34]} material={seatMaterial} />
          <Bar position={[0, -0.1, -0.12]} args={[0.3, 0.045, 0.08]} material={seatMaterial} />
          <Bar position={[side * 0.15, 0, 0.02]} args={[0.055, 0.11, 0.32]} material={seatMaterial} />
          <Bar position={[side * -0.15, -0.01, 0.02]} args={[0.045, 0.08, 0.3]} material={seatMaterial} />
          {[-0.105, 0.105].map((seamX) => (
            <Bar key={seamX} position={[seamX, -0.034, 0.02]} args={[0.004, 0.003, 0.27]} material={matSeam} />
          ))}
          <Bar position={[0, -0.029, 0.07]} args={[0.29, 0.008, 0.028]} material={matGasket} />
          <Bar position={[0.025, -0.021, 0.07]} args={[0.038, 0.009, 0.034]} material={matHardware} />
          <mesh position={[0, 0.1, 0.18]} rotation={[-0.45, 0, side * 0.04]} raycast={() => null} material={seatMaterial}>
            <boxGeometry args={[0.3, 0.34, 0.05]} />
          </mesh>
          <mesh position={[0, 0.28, 0.24]} rotation={[-0.15, 0, 0]} raycast={() => null} material={matHead}>
            <boxGeometry args={[0.16, 0.09, 0.07]} />
          </mesh>
        </group>
      ))}

      <pointLight position={[0, 0.4, -0.35]} color="#fff1d7" intensity={0.24} distance={2.1} decay={2} />
      <pointLight position={[-0.52, -0.16, -0.58]} color="#b9d5f0" intensity={0.035} distance={0.65} decay={2} />
      <pointLight position={[0.52, -0.16, -0.58]} color="#b9d5f0" intensity={0.035} distance={0.65} decay={2} />
    </group>
  );
}
