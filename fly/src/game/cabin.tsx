import { useMemo, useRef, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { getSimVersion, sim, subscribeSim } from "@/sim/runtime";

const PANEL = "#171d27";
const PANEL_2 = "#1e2633";
const MUTED = "#93a0b0";
const AMBER = "#e8a15a";
const GREEN = "#8fefb0";
const PLASMA = "#ff6b3d";
const LINE = "#314054";
const VOID = "#07090d";

function useSimTick() {
  useSyncExternalStore(subscribeSim, getSimVersion, getSimVersion);
}

function paintCluster(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.fillStyle = "#10141b";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = LINE;
  g.lineWidth = 4;
  g.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

  const alt = sim.y > 20000 ? `${(sim.y / 1000).toFixed(1)} km` : `${Math.round(sim.y)} m`;
  const rows: [string, string][] = [
    ["ALT", alt],
    ["M", sim.mach.toFixed(2)],
    ["Q", `${(sim.qbar / 1000).toFixed(1)}`],
    ["α", `${((sim.alpha * 180) / Math.PI).toFixed(0)}°`],
    ["G", sim.gLoad.toFixed(2)],
    ["BUS", `${sim.busVolts.toFixed(1)}`],
  ];

  g.font = "500 22px 'IBM Plex Mono', monospace";
  rows.forEach((row, i) => {
    const col = i % 3;
    const line = Math.floor(i / 3);
    const x = 28 + col * 160;
    const y = 54 + line * 96;
    g.fillStyle = MUTED;
    g.fillText(row[0], x, y);
    g.fillStyle = GREEN;
    g.font = "500 36px 'IBM Plex Mono', monospace";
    g.fillText(row[1], x, y + 44);
    g.font = "500 22px 'IBM Plex Mono', monospace";
  });
  tex.needsUpdate = true;
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
      <mesh
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
        <boxGeometry args={[0.16, 0.055, 0.028]} />
        <meshStandardMaterial
          color={hot ? AMBER : PANEL_2}
          emissive={hot ? AMBER : VOID}
          emissiveIntensity={hot ? 0.55 : 0}
          roughness={0.45}
        />
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
      g.clearRect(0, 0, 128, 32);
      g.font = "600 22px 'IBM Plex Mono', monospace";
      g.fillStyle = "#e7e2d6";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(label, 64, 16);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [label]);
  return (
    <mesh position={[0, 0.05, 0.021]}>
      <planeGeometry args={[0.13, 0.026]} />
      <meshBasicMaterial map={map} transparent toneMapped={false} />
    </mesh>
  );
}

function Mullion({ position, args }: { position: [number, number, number]; args: [number, number, number] }) {
  return (
    <mesh position={position} raycast={() => null}>
      <boxGeometry args={args} />
      <meshStandardMaterial color={PANEL} roughness={0.72} metalness={0.08} />
    </mesh>
  );
}

export function CabinInterior() {
  useSimTick();
  const root = useRef<THREE.Group>(null);
  const glass = useRef<THREE.Mesh>(null);
  const veil = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.PointLight>(null);
  const { camera } = useThree();
  const cluster = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return { canvas, tex };
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
    paintCluster(cluster.canvas, cluster.tex);
    const glassMat = glass.current?.material as THREE.MeshBasicMaterial | undefined;
    if (glassMat) {
      const hot = sim.plasma > 0.08;
      glassMat.color.set(hot ? PLASMA : sim.plume > 0.25 ? AMBER : "#9ec4ea");
      glassMat.opacity = hot ? 0.08 + sim.plasma * 0.5 : sim.plume > 0.25 ? 0.08 : 0.035;
    }
    const veilMat = veil.current?.material as THREE.MeshBasicMaterial | undefined;
    if (veilMat) veilMat.opacity = sim.blackout ? 0.72 : 0;
    if (glow.current) glow.current.intensity = sim.busVolts > 18 ? 0.45 : 0.04;
  });

  const live = sim.burning();
  const powered = sim.busVolts > 18;

  return (
    <group ref={root} visible={false}>
      <Mullion position={[0, 0.42, -1.05]} args={[2.05, 0.07, 0.05]} />
      <Mullion position={[0, -0.32, -1.05]} args={[2.05, 0.08, 0.05]} />
      <Mullion position={[-1.02, 0.05, -1.05]} args={[0.07, 0.82, 0.05]} />
      <Mullion position={[1.02, 0.05, -1.05]} args={[0.07, 0.82, 0.05]} />
      {[-0.66, -0.33, 0, 0.33, 0.66].map((x) => (
        <Mullion key={x} position={[x, 0.05, -1.05]} args={[0.04, 0.7, 0.04]} />
      ))}

      <mesh ref={glass} position={[0, 0.05, -1.08]} raycast={() => null}>
        <planeGeometry args={[1.9, 0.66]} />
        <meshBasicMaterial color="#9ec4ea" transparent opacity={0.04} depthWrite={false} />
      </mesh>
      <mesh ref={veil} position={[0, 0.05, -0.72]} raycast={() => null}>
        <planeGeometry args={[2.4, 1.5]} />
        <meshBasicMaterial color={VOID} transparent opacity={0} depthWrite={false} />
      </mesh>

      <mesh position={[0, 0.58, -1.15]} rotation={[0.35, 0, 0]} raycast={() => null}>
        <boxGeometry args={[0.62, 0.16, 0.025]} />
        <meshStandardMaterial color={PANEL} roughness={0.7} />
      </mesh>

      <mesh position={[0, -0.06, -0.8]} rotation={[-0.15, 0, 0]} raycast={() => null}>
        <boxGeometry args={[1.15, 0.18, 0.02]} />
        <meshStandardMaterial color={PANEL} roughness={0.66} />
      </mesh>
      <mesh position={[0, -0.045, -0.77]} rotation={[-0.15, 0, 0]}>
        <planeGeometry args={[0.92, 0.13]} />
        <meshBasicMaterial map={cluster.tex} toneMapped={false} />
      </mesh>

      <Switch
        position={[-0.27, -0.16, -0.68]}
        label="BURN"
        hot={live}
        onDown={() => sim.onKey("KeyB", true)}
        onUp={() => sim.onKey("KeyB", false)}
      />
      <Switch position={[-0.09, -0.16, -0.68]} label="GEAR" hot={sim.gear} onDown={() => sim.toggleGear()} />
      <Switch position={[0.09, -0.16, -0.68]} label="DOORS" hot={sim.doorsOpen} onDown={() => sim.toggleDoors()} />
      <Switch
        position={[0.27, -0.16, -0.68]}
        label="CELLS"
        hot={sim.fuelCell}
        onDown={() => {
          sim.fuelCell = !sim.fuelCell;
          sim.notify();
        }}
      />

      <pointLight ref={glow} position={[0, -0.02, -0.6]} color={powered ? AMBER : MUTED} intensity={0.45} distance={1.6} />
    </group>
  );
}
