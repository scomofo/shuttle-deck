import { useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getSimVersion, sim, subscribeSim } from "@/sim/runtime";

const AMBER = "#e8a15a";
const GREEN = "#8fefb0";
const PLASMA = "#ff6b3d";
const VOID = "#07090d";

/** Seated-camera outline of the late-orbiter forward flight deck. Not a dimensioned station. */
const matShell = new THREE.MeshStandardMaterial({ color: "#b7bcc4", roughness: 0.78, metalness: 0.06 });
const matMullion = new THREE.MeshStandardMaterial({ color: "#3a414a", roughness: 0.55, metalness: 0.18 });
const matSeat = new THREE.MeshStandardMaterial({ color: "#2a4d86", roughness: 0.94 });
const cloth = document.createElement("canvas");
cloth.width = 128;
cloth.height = 128;
{
  const g = cloth.getContext("2d");
  if (g) {
    g.fillStyle = "#2a4d86";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#1c3d72";
    g.lineWidth = 2;
    for (let i = 8; i < 128; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 128);
      g.moveTo(0, i);
      g.lineTo(128, i);
      g.stroke();
    }
    g.strokeStyle = "#4d74aa";
    g.lineWidth = 1;
    for (let i = 16; i < 128; i += 16) {
      g.beginPath();
      g.moveTo(i - 6, 4);
      g.lineTo(i - 6, 124);
      g.stroke();
    }
  }
}
const clothMap = new THREE.CanvasTexture(cloth);
clothMap.wrapS = THREE.RepeatWrapping;
clothMap.wrapT = THREE.RepeatWrapping;
clothMap.repeat.set(2, 2);
clothMap.colorSpace = THREE.SRGBColorSpace;
matSeat.map = clothMap;
matSeat.needsUpdate = true;
const matHead = new THREE.MeshStandardMaterial({ color: "#1a1d22", roughness: 0.55 });
const matRed = new THREE.MeshStandardMaterial({ color: "#b23a32", roughness: 0.45 });

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
  drawScreen(g, 6, 6, canvas.width - 12, canvas.height - 12, kind);
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
  g.font = "600 18px 'IBM Plex Mono', monospace";
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
  g.font = "600 16px 'IBM Plex Mono', monospace";
  g.fillText(label, x + 10, y + 24);
  g.font = "500 32px 'IBM Plex Mono', monospace";
  g.fillText(value, x + 10, y + h * 0.62);
  g.font = "500 16px 'IBM Plex Mono', monospace";
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
    g.font = "500 15px 'IBM Plex Mono', monospace";
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
  g.font = "500 28px 'IBM Plex Mono', monospace";
  lines.forEach((line, i) => g.fillText(line, x + 16, y + 48 + i * 52));
}

function paintBank(canvas: HTMLCanvasElement, rows: number, cols: number, reds: number[]) {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.fillStyle = "#c5c9cf";
  g.fillRect(0, 0, canvas.width, canvas.height);
  const pad = 10;
  const gw = (canvas.width - pad * 2) / cols;
  const gh = (canvas.height - pad * 2) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const x = pad + c * gw + 3;
      const y = pad + r * gh + 3;
      g.fillStyle = reds.includes(i) ? "#9a3a34" : i % 7 === 0 ? "#1c1e22" : "#e7e4dc";
      g.fillRect(x, y, gw - 8, gh * 0.42);
      g.fillStyle = "#6a717a";
      g.fillRect(x, y + gh * 0.5, gw - 8, 2);
    }
  }
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
      <mesh position={[0, -0.01, 0]} raycast={() => null}>
        <boxGeometry args={[0.07, 0.01, 0.04]} />
        <meshStandardMaterial color="#8e949c" roughness={0.6} />
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
        <meshStandardMaterial color={hot ? AMBER : "#f4f1ea"} roughness={0.4} />
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
const capMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.42, metalness: 0.05 });

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
  const mesh = useMemo(() => {
    const count = rows * cols;
    const inst = new THREE.InstancedMesh(capGeo, capMat, count);
    const dummy = new THREE.Object3D();
    const marked = new Set(reds);
    const white = new THREE.Color("#f4f1ea");
    const black = new THREE.Color("#1c1e22");
    const red = new THREE.Color("#9a3a34");
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        dummy.position.set(-width / 2 + ((c + 0.5) / cols) * width, height / 2 - ((r + 0.5) / rows) * height, 0.012);
        dummy.scale.set((width / cols) * 0.22, (height / rows) * 0.62, 0.012);
        dummy.rotation.set(i % 5 === 0 ? -0.65 : 0.75, 0, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
        inst.setColorAt(i, marked.has(i) ? red : i % 8 === 0 ? black : white);
      }
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.raycast = () => null;
    return inst;
  }, [rows, cols, width, height, reds]);
  return <primitive object={mesh} raycast={() => null} />;
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

function WindowFrame({ x, yaw }: { x: number; yaw: number }) {
  const top = 0.2;
  const bot = 0.3;
  const h = 0.44;
  const t = 0.03;
  const lean = Math.atan2((bot - top) / 2, h);
  return (
    <group position={[x, 0.16, -1.06]} rotation={[0, yaw, 0]}>
      <Bar position={[0, h / 2, 0]} args={[top, t, 0.045]} material={matMullion} />
      <Bar position={[0, -h / 2, 0]} args={[bot, t, 0.045]} material={matMullion} />
      <mesh position={[-(bot / 2) + 0.01, 0, 0]} rotation={[0, 0, lean]} raycast={() => null} material={matMullion}>
        <boxGeometry args={[t, h, 0.045]} />
      </mesh>
      <mesh position={[bot / 2 - 0.01, 0, 0]} rotation={[0, 0, -lean]} raycast={() => null} material={matMullion}>
        <boxGeometry args={[t, h, 0.045]} />
      </mesh>
    </group>
  );
}

function Face({
  position,
  args,
  rotation,
  map,
}: {
  position: [number, number, number];
  args: [number, number];
  rotation?: [number, number, number];
  map: THREE.Texture;
}) {
  return (
    <mesh position={position} rotation={rotation} raycast={() => null}>
      <planeGeometry args={args} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}

export function CabinInterior() {
  useSimTick();
  const root = useRef<THREE.Group>(null);
  const glass = useRef<THREE.Mesh>(null);
  const veil = useRef<THREE.Mesh>(null);
  const sticks = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const tex = useMemo(() => {
    const make = (w: number, h: number, draw?: (canvas: HTMLCanvasElement) => void) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      draw?.(canvas);
      const map = new THREE.CanvasTexture(canvas);
      map.colorSpace = THREE.SRGBColorSpace;
      map.needsUpdate = true;
      return { canvas, map };
    };
    const overhead = make(1024, 256, (canvas) => paintBank(canvas, 4, 18, [3, 4, 20, 21, 40]));
    const side = make(512, 512, (canvas) => paintBank(canvas, 8, 6, [8, 14]));
    const pedestal = make(512, 640, (canvas) => paintBank(canvas, 10, 6, [48, 49]));
    const glasses = GLASSES.map(() => make(360, 200));
    return { overhead, side, pedestal, glasses };
  }, []);

  useFrame(() => {
    const rig = root.current;
    if (!rig) return;
    const seated =
      sim.view === "cockpit" && sim.running && sim.phase !== "landed" && sim.phase !== "lost";
    rig.visible = seated;
    if (!seated) return;
    rig.position.copy(camera.position);
    rig.quaternion.copy(camera.quaternion);
    GLASSES.forEach((glassFace, i) => paintGlass(tex.glasses[i].canvas, tex.glasses[i].map, glassFace.kind));
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
    <group ref={root} visible={false}>
      <Bar position={[0, 0.58, -0.72]} args={[2.2, 0.07, 0.9]} />
      <Bar position={[-1.05, 0.02, -0.62]} args={[0.08, 0.85, 0.85]} />
      <Bar position={[1.05, 0.02, -0.62]} args={[0.08, 0.85, 0.85]} />
      <Bar position={[0, -0.55, -0.48]} args={[1.6, 0.06, 0.9]} />
      <group position={[0, 0.5, -0.78]} rotation={[0.85, 0, 0]}>
        <Face position={[0, 0, 0]} args={[1.7, 0.32]} map={tex.overhead.map} />
        <SwitchField rows={4} cols={14} width={1.55} height={0.26} reds={OVERHEAD_REDS} />
      </group>

      <Bar position={[0, 0.42, -1.08]} args={[2.15, 0.05, 0.05]} material={matMullion} />
      <Bar position={[0, -0.08, -1.08]} args={[2.15, 0.05, 0.05]} material={matMullion} />
      {[
        [-0.86, 0.24],
        [-0.52, 0.1],
        [-0.17, 0],
        [0.17, 0],
        [0.52, -0.1],
        [0.86, -0.24],
      ].map(([x, yaw]) => (
        <WindowFrame key={x} x={x} yaw={yaw} />
      ))}
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

      {[-0.4, 0.4].map((x) => (
        <mesh key={x} position={[x, 0.16, -0.96]} rotation={[0.45, 0, 0]} raycast={() => null}>
          <planeGeometry args={[0.28, 0.16]} />
          <meshBasicMaterial color="#9ec4ea" transparent opacity={0.12} depthWrite={false} />
        </mesh>
      ))}

      <mesh position={[0, -0.1, -0.98]} rotation={[0.55, 0, 0]} raycast={() => null} material={matShell}>
        <boxGeometry args={[1.9, 0.045, 0.16]} />
      </mesh>

      <group position={[0, -0.36, -0.78]} rotation={[-0.62, 0, 0]}>
        <mesh raycast={() => null} material={matShell}>
          <boxGeometry args={[1.55, 0.44, 0.04]} />
        </mesh>
        {GLASSES.map((glassFace, i) => (
          <group key={glassFace.kind + i} position={[glassFace.x, glassFace.y, 0.02]}>
            <mesh position={[0, 0, -0.016]} raycast={() => null} material={matMullion}>
              <boxGeometry args={[0.42, 0.16, 0.04]} />
            </mesh>
            <mesh position={[0, 0, 0.008]} raycast={() => null}>
              <planeGeometry args={[0.36, 0.12]} />
              <meshBasicMaterial map={tex.glasses[i].map} toneMapped={false} />
            </mesh>
          </group>
        ))}
      </group>

      <group position={[-0.92, -0.08, -0.7]} rotation={[-0.2, 0.65, 0]}>
        <mesh raycast={() => null} material={matShell}>
          <boxGeometry args={[0.42, 0.55, 0.03]} />
        </mesh>
        <Face position={[0, 0, 0.018]} args={[0.38, 0.5]} map={tex.side.map} />
        <SwitchField rows={6} cols={4} width={0.34} height={0.42} reds={SIDE_REDS} />
      </group>
      <group position={[0.92, -0.08, -0.7]} rotation={[-0.2, -0.65, 0]}>
        <mesh raycast={() => null} material={matShell}>
          <boxGeometry args={[0.42, 0.55, 0.03]} />
        </mesh>
        <Face position={[0, 0, 0.018]} args={[0.38, 0.5]} map={tex.side.map} />
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
          <Face position={[0, 0, 0.024]} args={[0.32, 0.18]} map={tex.pedestal.map} />
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
            <mesh position={[0, 0.02, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.014, 0.018, 0.12, 8]} />
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
          <Bar position={[0, -0.07, 0.02]} args={[0.32, 0.07, 0.34]} material={matSeat} />
          <Bar position={[0, -0.1, -0.12]} args={[0.3, 0.045, 0.08]} material={matSeat} />
          <Bar position={[side * 0.15, 0, 0.02]} args={[0.055, 0.11, 0.32]} material={matSeat} />
          <Bar position={[side * -0.15, -0.01, 0.02]} args={[0.045, 0.08, 0.3]} material={matSeat} />
          <mesh position={[0, 0.1, 0.18]} rotation={[-0.45, 0, side * 0.04]} raycast={() => null} material={matSeat}>
            <boxGeometry args={[0.3, 0.34, 0.05]} />
          </mesh>
          <mesh position={[0, 0.28, 0.24]} rotation={[-0.15, 0, 0]} raycast={() => null} material={matHead}>
            <boxGeometry args={[0.16, 0.09, 0.07]} />
          </mesh>
        </group>
      ))}

      <pointLight position={[0, 0.22, -0.4]} color="#fff6ea" intensity={1.1} distance={2.4} />
      <pointLight position={[-0.55, 0.05, -0.55]} color="#fff6ea" intensity={0.35} distance={1.5} />
      <pointLight position={[0.55, 0.05, -0.55]} color="#fff6ea" intensity={0.35} distance={1.5} />
    </group>
  );
}
