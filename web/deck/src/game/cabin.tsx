import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { bodyBasis, getSimVersion, sim, subscribeSim } from "@/sim/runtime";
import { useSurfaceMaterial } from "@/game/materials";
import { attachLookControls, lookState, resetLook } from "./look";
import { formatEventTime } from "./mission-time";
import { instrumentReadouts, paintInstrument, type InstrumentKind } from "./legacy-instruments";

import { getPanelLight, usePanelLight } from "./panel-lighting";
import { COCKPIT_TARGETS, getCockpitInspection, portraitReadingLens, subscribeCockpitInspection, type CockpitTarget } from "./cockpit-navigation";

const AMBER = "#e8a15a";
const GREEN = "#8fefb0";
const PLASMA = "#ff6b3d";
const VOID = "#07090d";
const NO_REDS: number[] = [];

/**
 * Estimated seated-eye cabin, with a pre-MEDS CRT/discrete-instrument pass
 * toward Columbia on STS-1. NASA's STS-1 photographs and pre-MEDS baseline
 * support the instrument family/topology, not these numerical coordinates.
 * Other panel sections still use later JSC-26419/SCOM references; see
 * HISTORICAL_INSTRUMENTS.md for the unresolved era/dimensional boundaries.
 */
const matShell = new THREE.MeshStandardMaterial({ color: "#bcbeb9", roughness: 0.74, metalness: 0.12 });
const matMullion = new THREE.MeshStandardMaterial({ color: "#454a4b", roughness: 0.56, metalness: 0.28 });
const matGasket = new THREE.MeshStandardMaterial({ color: "#171a1b", roughness: 0.94 });
const matHardware = new THREE.MeshStandardMaterial({ color: "#87918e", roughness: 0.38, metalness: 0.7 });
const matHead = new THREE.MeshStandardMaterial({ color: "#202324", roughness: 0.82 });
const matSeam = new THREE.MeshStandardMaterial({ color: "#385d82", roughness: 1 });
const matWindow = new THREE.MeshPhysicalMaterial({
  color: "#c0d0ce", transparent: true, opacity: 0.075, depthWrite: false,
  roughness: 0.14, metalness: 0.08, clearcoat: 1, clearcoatRoughness: 0.1,
});

function useSimTick() {
  useSyncExternalStore(subscribeSim, getSimVersion, getSimVersion);
}

/* ------------------------------------------------------------------ */
/* Pre-MEDS CRTs and dedicated flight instruments                       */
/* ------------------------------------------------------------------ */

type CrtId = "CRT1" | "CRT2" | "CRT3" | "CRT4";
// Simulator readouts, not reconstructed GPC/DPS pages. Clicking a face cycles.
const CRT_FORMATS: Record<CrtId, string[]> = {
  CRT1: ["flight", "systems"], CRT2: ["systems", "trajectory"],
  CRT3: ["trajectory", "flight", "systems"], CRT4: ["systems", "flight"],
};
const DECK_DIMS = {
  crtScreenW: 0.24, crtScreenH: 0.18, // landscape legacy CRT [estimated]
  crtBezelW: 0.285, crtBezelH: 0.225, // enclosure [estimated]
  fwdWindowH: 0.36, // W1–W6 [estimated]
  ohWindow: 0.508, // 20×20 in — later SCOM §1.2 [sourced]
  aftWindowW: 0.368, aftWindowH: 0.279, // 14.5×11 in — later SCOM §1.2
};

/* F7 C/W annunciator matrix legends, transcribed from the SCOM Appendix A
 * Panel F7 drawing [sourced]. 8 columns × 5 rows = 40 lamps: 39 primary C/W
 * + BACKUP C/W ALARM (bottom-right) — SCOM §2.2. */
const CW_MATRIX: string[][] = [
  ["FUEL CELL PUMP", "AC OVERLOAD", "RCS JET", "RIGHT RCS", "RIGHT OMS", "OMS TVC", "", "HYD PRESS"],
  ["FUEL CELL STACK TEMP", "AC VOLTAGE", "FWD RCS", "LEFT RCS", "LEFT OMS", "OMS KIT", "MPS", "APU UNDERSPEED"],
  ["FUEL CELL REAC", "MAIN BUS UNDERVOLT", "IMU", "AIR DATA", "RIGHT/AFT RCS BHC", "FCS SATURATION", "FCS CHANNEL", "APU OVERSPEED"],
  ["H2 PRESS", "O2 HEATER TEMP", "AV BAY/CABIN AIR", "RGA/ACCEL", "LEFT RHC", "GPC", "PRIMARY C/W", "APU TEMP"],
  ["O2 PRESS", "CABIN ATM", "FREON LOOP", "H2O LOOP", "", "PAYLOAD WARNING", "PAYLOAD CAUTION", "BACKUP C/W ALARM"],
];

/** Green monochrome simulator telemetry in a legacy CRT housing.
 * It does not pretend to reproduce historical SPEC/DISP or BFS software. */
function paintCrt(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture, id: CrtId, format: string) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width, H = canvas.height;
  g.fillStyle = "#050b07"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#9ada8c"; g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.font = "20px monospace"; g.fillText(`${id}  SIM DATA / ${format.toUpperCase()}`, 18, 30);
  const v = instrumentReadouts(sim);
  const lines = format === "flight"
    ? [`ALT  ${Math.round(v.altitudeFeet)} FT MSL`, `V/S  ${Math.round(v.verticalSpeedFpm)} FT/MIN`,
       `MACH ${v.mach.toFixed(2)}`, `ALPH ${v.alphaDegrees.toFixed(1)} DEG`, `Q    ${(sim.qbar / 1000).toFixed(1)} KPA`]
    : format === "trajectory"
      ? [`HDG  ${Math.round(v.headingDegrees) % 360} DEG`, `PIT  ${v.pitchDegrees.toFixed(1)} DEG`,
         `BANK ${v.bankDegrees.toFixed(1)} DEG`, `G    ${sim.gLoad.toFixed(2)}`, `GET  ${formatEventTime(sim.get)}`]
      : [`BUS  ${sim.busVolts.toFixed(1)} V`, `FC   ${sim.fuelCell ? "ON" : "OFF"}`,
         `APU  ${sim.apu ? "RUN" : sim.apuStarting ? "STARTING" : "OFF"}`,
         `BAY  ${sim.doorTalkback}`, `GEAR ${sim.gearTalkback}`];
  g.font = "25px monospace";
  lines.forEach((line, i) => g.fillText(line, 26, 92 + i * 47));
  g.font = "17px monospace"; g.fillText("CLICK FACE: NEXT SIM READOUT", 18, H - 19);
  tex.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/* Panel face painters (canvas textures on the 3D plates)               */
/* ------------------------------------------------------------------ */

function ohLed(g: CanvasRenderingContext2D, x: number, y: number, color: string, label: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, 7, 0, Math.PI * 2);
  g.fill();
  if (label) {
    g.fillStyle = "#2a3038";
    g.font = "400 11px 'IBM Plex Mono', monospace";
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillText(label, x, y + 10);
  }
}

function ohLabel(g: CanvasRenderingContext2D, text: string, x: number, y: number, size = 15) {
  g.fillStyle = "#2a3038";
  g.font = `600 ${size}px 'IBM Plex Mono', monospace`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, x, y);
}

function ohSub(g: CanvasRenderingContext2D, text: string, x: number, y: number) {
  g.fillStyle = "#4a5258";
  g.font = "400 11px 'IBM Plex Mono', monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, x, y);
}

function ohSection(g: CanvasRenderingContext2D, title: string, x: number, w: number, H: number) {
  g.strokeStyle = "#8a8d86";
  g.lineWidth = 2;
  g.strokeRect(x + 4, 8, w - 8, H - 16);
  g.fillStyle = "#3a3f45";
  g.fillRect(x + 4, 8, w - 8, 26);
  ohLabel(g, title, x + w / 2, 22, 15);
  g.fillStyle = "#2a3038";
}

const CW_LAMPS: { label: string; on: () => boolean }[] = [
  { label: "GPC", on: () => sim.fail !== "" },
  { label: "BUS", on: () => sim.busVolts < 24 },
  { label: "FC", on: () => sim.running && !sim.fuelCell },
  {
    label: "APU",
    on: () => sim.running && !sim.apu &&
      (sim.phase === "entry" || sim.phase === "taem" || sim.phase === "approach"),
  },
  {
    label: "BAY",
    on: () => sim.running && sim.doorsOpen &&
      (sim.phase === "ascent" || sim.phase === "entry"),
  },
  {
    label: "GEAR",
    on: () => sim.running && sim.gear &&
      sim.phase !== "approach" && sim.phase !== "rollout" && sim.phase !== "landed",
  },
  { label: "SMOKE", on: () => sim.smokeAlarm },
];

/** Live C/W matrix lamp state. Only lamps with a real sim channel behind
 *  them can light; the rest stay dark (no fault). BACKUP C/W ALARM follows
 *  the same caution logic the 2D deck uses. */
const cwLampLit = (label: string): boolean => {
  if (label === "FUEL CELL PUMP") return sim.running && !sim.fuelCell;
  if (label === "HYD PRESS") return sim.running && !sim.apu;
  if (label === "BACKUP C/W ALARM") return CW_LAMPS.some((l) => l.on());
  return false;
};
/** Master-alarm pushbuttons (F2/F4/A7) light with the backup C/W alarm. */
const masterAlarmLit = (): boolean => CW_LAMPS.some((l) => l.on());

/** F7 C/W annunciator matrix faceplate: 8×5 = 40 lamp windows with the
 *  legends transcribed from the SCOM Appendix A Panel F7 drawing [sourced].
 *  Static — painted once; lamp illumination is separate emissive meshes. */
function paintCwMatrix(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#9aa09a";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#14171c";
  g.fillRect(6, 6, W - 12, H - 12);
  const cols = 8;
  const rows = 5;
  const cw = (W - 12) / cols;
  const ch = (H - 12) / rows;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const label = CW_MATRIX[r][c];
      const x = 6 + c * cw;
      const y = 6 + r * ch;
      // Lamp window (emissive overlay mesh sits on top of this).
      g.fillStyle = "#232a31";
      g.fillRect(x + cw * 0.12, y + ch * 0.1, cw * 0.76, ch * 0.52);
      g.strokeStyle = "#0a0c0e";
      g.lineWidth = 2;
      g.strokeRect(x + cw * 0.12, y + ch * 0.1, cw * 0.76, ch * 0.52);
      if (label) {
        g.fillStyle = "#c8cfd6";
        const words = label.split(" ");
        const fs = words.length > 2 ? 11 : 13;
        g.font = `600 ${fs}px 'IBM Plex Mono', monospace`;
        if (words.length <= 2) {
          g.fillText(label, x + cw / 2, y + ch * 0.82);
        } else {
          g.fillText(words.slice(0, Math.ceil(words.length / 2)).join(" "), x + cw / 2, y + ch * 0.74);
          g.fillText(words.slice(Math.ceil(words.length / 2)).join(" "), x + cw / 2, y + ch * 0.9);
        }
      }
    }
  }
  tex.needsUpdate = true;
}

/** F7 middle-right strip: MAIN ENGINE STATUS indicators, SM ALERT, and the
 *  EVENT TIME / MISSION TIME digital readout — SCOM Appendix A Panel F7
 *  [sourced]. Painted live for the event-time digits. */
function paintMeStrip(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#9aa09a";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#14171c";
  g.fillRect(5, 5, W - 10, H - 10);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#c8cfd6";
  g.font = "600 13px 'IBM Plex Mono', monospace";
  g.fillText("MAIN ENGINE", W / 2, 24);
  g.fillText("STATUS", W / 2, 40);
  // Three engine position indicators: LEFT / CTR / RIGHT (static plates —
  // the sim has no per-SSME status channel, so these stay unlit).
  const boxes = ["LEFT", "CTR", "RIGHT"];
  boxes.forEach((b, i) => {
    const y = 66 + i * 44;
    g.fillStyle = "#232a31";
    g.fillRect(W / 2 - 52, y - 16, 104, 32);
    g.strokeStyle = "#0a0c0e";
    g.lineWidth = 2;
    g.strokeRect(W / 2 - 52, y - 16, 104, 32);
    g.fillStyle = "#5a636b";
    g.font = "600 13px 'IBM Plex Mono', monospace";
    g.fillText(b, W / 2, y);
  });
  const smY = 66 + 3 * 44;
  g.fillStyle = "#1c2733";
  g.fillRect(W / 2 - 52, smY - 16, 104, 32);
  g.strokeStyle = "#3a5a7a";
  g.strokeRect(W / 2 - 52, smY - 16, 104, 32);
  g.fillStyle = "#7ab5e0";
  g.font = "600 13px 'IBM Plex Mono', monospace";
  g.fillText("SM ALERT", W / 2, smY);
  // Event-time digital readout (mission clock).
  const etY = smY + 52;
  g.fillStyle = "#c8cfd6";
  g.font = "600 13px 'IBM Plex Mono', monospace";
  g.fillText("EVENT TIME", W / 2, etY);
  g.fillStyle = "#0a0f14";
  g.fillRect(W / 2 - 78, etY + 14, 156, 44);
  g.fillStyle = GREEN;
  g.font = "600 30px 'IBM Plex Mono', monospace";
  // Read the root 50 Hz clock: pause, time acceleration, restart, and
  // checkpoint restore must all be reflected here. Wall time is not vehicle
  // truth and must never drive a flight-deck instrument.
  g.fillText(formatEventTime(sim.get), W / 2, etY + 38);
  g.fillStyle = "#c8cfd6";
  g.font = "600 11px 'IBM Plex Mono', monospace";
  g.fillText("MIN", W / 2 - 52, etY + 70);
  g.fillText("SEC", W / 2 + 52, etY + 70);
  tex.needsUpdate = true;
}

/** Overhead panel face: section-level O-panel representation (JSC-26419). */
function paintOverhead(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#b7bcb6";
  g.fillRect(0, 0, W, H);
  const sections: [string, string][] = [
    ["O1", "CABIN PRESS"],
    ["O2", "CRYO"],
    ["O3", "RCS / OMS"],
    ["O5", "CDR AUDIO"],
    ["O6", "GPC / DPS"],
    ["O17", "ASCENT TVC · EIU"],
    ["O7", "TACAN / GPS"],
    ["O8", "MLS / RDR ALT"],
    ["O9", "PLT AUDIO"],
  ];
  const w = W / sections.length;
  sections.forEach(([code, title], i) => {
    const x = i * w;
    ohSection(g, code, x, w, H);
    ohSub(g, title, x + w / 2, 52);
    // Representative switch rows — section-level, not a switch-by-switch copy.
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        const sx = x + 24 + c * ((w - 48) / 4);
        const sy = 92 + r * ((H - 130) / 3);
        g.fillStyle = "#3a3f45";
        g.beginPath();
        g.arc(sx, sy, 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#d8d5c9";
        g.fillRect(sx - 2, sy - 14, 4, 12);
      }
    }
  });
  tex.needsUpdate = true;
}

/** Aft port panel face: A1 comm, A4 time, A6U ADI, A7 floodlight, A11–A15.
 *  Painted live for the A4 mission/event time. */
function paintAftLeft(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#b7bcb6";
  g.fillRect(0, 0, W, H);
  g.textAlign = "center";
  g.textBaseline = "middle";

  ohLabel(g, "A1 · COMMUNICATIONS", W / 2, 26, 20);
  const comm: [string, string][] = [
    ["A1L", "S-BAND PM"],
    ["A1U", "S-BAND FM"],
    ["A1R", "KU-BAND"],
  ];
  comm.forEach(([code, title], i) => {
    const x = (i + 0.5) * (W / 3);
    ohSection(g, code, (i * W) / 3, W / 3, 200);
    ohSub(g, title, x, 150);
    for (let c = 0; c < 4; c++) {
      g.fillStyle = "#3a3f45";
      g.beginPath();
      g.arc(x - 45 + c * 30, 185, 6, 0, Math.PI * 2);
      g.fill();
    }
  });

  ohLabel(g, "A4 · TIME", W / 2, 232, 20);
  g.fillStyle = "#14171c";
  g.fillRect(24, 252, W - 48, 96);
  g.fillStyle = GREEN;
  g.font = "600 34px 'IBM Plex Mono', monospace";
  g.fillText(formatEventTime(sim.get), W / 2, 290);
  g.fillStyle = "#8a939b";
  g.font = "500 14px 'IBM Plex Mono', monospace";
  g.fillText("MISSION ELAPSED · EVENT TIME", W / 2, 326);

  // The separate live A6U instrument sits over this region of the plate.
  ohLabel(g, "A7 · FLOODLIGHT / CCTV", (3 * W) / 4, 392, 16);
  ohSub(g, "payload bay floodlight + video", (3 * W) / 4, 416);

  ohLabel(g, "A11   A12   A14   A15", W / 2, 470, 18);
  ohSub(g, "aft panel labels per JSC-26419", W / 2, 496);

  ohLabel(g, "A8 · RMS MODE / JOINT", W / 2, 548, 18);
  ohSub(g, "see RMS panel below", W / 2, 572);

  g.fillStyle = "#4a5258";
  g.font = "400 13px 'IBM Plex Mono', monospace";
  g.fillText("A5 / A10 position plates · contents unattested", W / 2, 640);
  g.fillText("A13 / A16 / A17 lower plates · contents unattested", W / 2, 668);
  tex.needsUpdate = true;
}

/** Aft starboard panel face: R11/R13/R14/R15 section labels. */
function paintAftRight(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#b7bcb6";
  g.fillRect(0, 0, W, H);
  g.textAlign = "center";
  g.textBaseline = "middle";

  ohLabel(g, "R12 · CRT4", W / 2, 30, 20);
  ohSub(g, "CRT — simulator readouts", W / 2, 56);

  ohLabel(g, "R13 · PAYLOAD BAY", W / 2, 220, 18);
  ohSub(g, "door + latch switches below", W / 2, 244);
  ohLabel(g, "R11U · FC PURGE", W / 4, 300, 15);
  ohLabel(g, "R11L · DPS KEYBOARD", (3 * W) / 4, 300, 15);
  ohSub(g, "see center console keys", (3 * W) / 4, 324);
  ohLabel(g, "R14 / R15 · BREAKER GROUPS", W / 2, 380, 15);
  ohSub(g, "breaker panels — section level", W / 2, 404);
  tex.needsUpdate = true;
}

/** A8 RMS mode/joint panel face: ORB UNL, SHOULDER PITCH, SHOULDER YAW.
 *  Panel base matches the rest of the flight deck (all orbiter panels share
 *  the same light-gray finish); the old dark finish was a styling error.
 *  P4: the LEDs are painted dark — labels only, no RMS model drives them. */
function paintAftRms(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#b7bcb6";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#2a3038";
  g.font = "600 22px 'IBM Plex Mono', monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("A8 · RMS MODE / JOINT", W / 2, 28);
  const rows: [string, string][] = [
    ["ORB UNL", "#2c3430"],
    ["SHOULDER PITCH", "#2c3430"],
    ["SHOULDER YAW", "#2c3430"],
  ];
  rows.forEach(([label, color], i) => {
    const y = 78 + i * 66;
    g.strokeStyle = "#8a8d86";
    g.lineWidth = 2;
    g.strokeRect(20, y - 26, W - 40, 52);
    ohLed(g, 56, y, color, "");
    g.fillStyle = "#2a3038";
    g.font = "600 19px 'IBM Plex Mono', monospace";
    g.textAlign = "left";
    g.fillText(label, 84, y);
  });
  g.fillStyle = "#8a939b";
  g.font = "400 12px 'IBM Plex Mono', monospace";
  g.textAlign = "center";
  g.fillText("labels per JSC-26419 · no RMS model — indicators dark", W / 2, H - 18);
  tex.needsUpdate = true;
}

/** Aft side-console strip face: panel codes only, contents unattested. */
function paintAftSide(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture, codes: string[], title: string) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#b7bcb6";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#2a3038";
  g.font = "600 17px 'IBM Plex Mono', monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(title, W / 2, 24);
  codes.forEach((code, i) => {
    const y = 62 + i * 44;
    g.strokeStyle = "#8a8d86";
    g.lineWidth = 2;
    g.strokeRect(14, y - 17, W - 28, 34);
    g.fillStyle = "#2a3038";
    g.font = "600 16px 'IBM Plex Mono', monospace";
    g.fillText(code, W / 2, y);
  });
  g.fillStyle = "#4a5258";
  g.font = "400 12px 'IBM Plex Mono', monospace";
  g.fillText("contents unattested", W / 2, H - 20);
  tex.needsUpdate = true;
}

/** Aft lower-center strip face: A13/A16/A17, contents unattested. */
function paintAftLower(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#b7bcb6";
  g.fillRect(0, 0, W, H);
  const codes = ["A13", "A16", "A17"];
  const w = W / codes.length;
  codes.forEach((code, i) => {
    const x = i * w;
    g.strokeStyle = "#8a8d86";
    g.lineWidth = 2;
    g.strokeRect(x + 10, 12, w - 20, H - 24);
    g.fillStyle = "#2a3038";
    g.font = "600 17px 'IBM Plex Mono', monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(code, x + w / 2, H / 2 - 10);
    g.fillStyle = "#4a5258";
    g.font = "400 11px 'IBM Plex Mono', monospace";
    g.fillText("unattested", x + w / 2, H / 2 + 14);
  });
  tex.needsUpdate = true;
}

/** C2 DPS keyboard face: 32-key grid, attested as DPS keyboards. */
function paintKeyboard(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#2b2f34";
  g.fillRect(0, 0, W, H);
  const cols = 8;
  const rows = 4;
  const cw = W / cols;
  const rh = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cw;
      const y = r * rh;
      g.fillStyle = (r + c) % 7 === 0 ? "#4a4038" : "#3d434a";
      g.fillRect(x + 3, y + 3, cw - 6, rh - 6);
      g.strokeStyle = "#171a1d";
      g.lineWidth = 2;
      g.strokeRect(x + 3, y + 3, cw - 6, rh - 6);
    }
  }
  tex.needsUpdate = true;
}

/* ------------------------------------------------------------------ */
/* Shared hardware                                                     */
/* ------------------------------------------------------------------ */

function Switch({
  position,
  label,
  hot,
  onDown,
  target,
}: {
  position: [number, number, number];
  label: string;
  hot: boolean;
  onDown: () => void;
  target?: CockpitTarget;
}) {
  const { target: selected } = useSyncExternalStore(subscribeCockpitInspection, getCockpitInspection, getCockpitInspection);
  return (
    <group position={position} name={target ? COCKPIT_TARGETS[target].node : undefined}>
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
        }}
        onClick={(event) => { event.stopPropagation(); if (event.button === 0 && event.delta < 6) onDown(); }}
      >
        <boxGeometry args={[0.07, 0.055, 0.016]} />
        <meshStandardMaterial color={hot ? "#d4b27c" : "#dddcd4"} roughness={0.58} metalness={0.12} />
      </mesh>
      {target === selected ? <ControlCue /> : null}
      <SwitchLabel label={label} />
    </group>
  );
}

function ControlCue() {
  return <mesh position={[0, 0.012, 0.03]} raycast={() => null}>
    <ringGeometry args={[0.052, 0.055, 32]} />
    <meshBasicMaterial color="#f1c16f" toneMapped={false} side={THREE.DoubleSide} />
  </mesh>;
}

/** ARM/DN are modeled crew pushbuttons, not the old center-console lever. */
function GearButton({ position, target, label, active, onPress }: {
  position: [number, number, number]; target: "gear-arm" | "gear";
  label: string; active: boolean; onPress: () => void;
}) {
  const { target: selected } = useSyncExternalStore(subscribeCockpitInspection, getCockpitInspection, getCockpitInspection);
  return <group position={position} name={COCKPIT_TARGETS[target].node}>
    <Bar position={[0, 0, -0.006]} args={[0.085, 0.06, 0.035]} material={matGasket} />
    <mesh position={[0, 0, 0.016]} onClick={event => { event.stopPropagation(); if (event.button === 0 && event.delta < 6) onPress(); }}>
      <boxGeometry args={[0.064, 0.045, 0.016]} />
      <meshStandardMaterial color={active ? "#adc3ad" : "#d9d7c9"} roughness={0.7} />
    </mesh>
    <PlateLabel label={label} y={0} z={0.027} scale={0.42} color="#27312e" />
    {target === selected ? <ControlCue /> : null}
  </group>;
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

/** Engraved panel code / section label, sized to fit its text. */
function PlateLabel({ label, x = 0, y, scale = 1, z = 0.016, color = "#d4d8cc" }: { label: string; x?: number; y: number; scale?: number; z?: number; color?: string }) {
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const g = canvas.getContext("2d");
    if (g) {
      let size = 40;
      g.textAlign = "center";
      g.textBaseline = "middle";
      do {
        g.font = `600 ${size}px 'IBM Plex Mono', monospace`;
        size -= 2;
      } while (g.measureText(label).width > 480 && size > 10);
      g.fillStyle = color;
      g.fillText(label, 256, 34);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [label, color]);
  useEffect(() => () => map.dispose(), [map]);
  const h = 0.024 * scale;
  return (
    <mesh position={[x, y, z]} raycast={() => null}>
      <planeGeometry args={[h * 8, h]} />
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

/** Estimated legacy CRT enclosure. No MEDS edgekeys or invented powered
 * controls; face cycling remains an explicit simulator reading aid. */
function CrtUnit({ id, map, x, y, onCycle }: {
  id: CrtId; map: THREE.Texture; x: number; y: number; onCycle: () => void;
}) {
  const panelLight = usePanelLight();
  const screenColor = useMemo(() => {
    const brightness = 0.4 + 0.6 * panelLight;
    return new THREE.Color().setRGB(brightness, brightness, brightness, THREE.SRGBColorSpace);
  }, [panelLight]);
  const downPos = useRef<[number, number] | null>(null);
  const { crtBezelW: W, crtBezelH: H, crtScreenW: SW, crtScreenH: SH } = DECK_DIMS;
  return <group name={`instrument-${id}`} position={[x, y, 0.015]}>
    <Bar position={[0, 0, -0.008]} args={[W + 0.015, H + 0.015, 0.04]} material={matGasket} />
    <Bar position={[0, 0, 0.003]} args={[W, H, 0.035]} material={matMullion} />
    <Bar position={[0, 0, 0.022]} args={[SW + 0.014, SH + 0.014, 0.006]} material={matHead} />
    <mesh position={[0, 0, 0.027]}
      onPointerDown={event => { event.stopPropagation(); downPos.current = [event.clientX, event.clientY]; }}
      onPointerUp={event => {
        event.stopPropagation(); const d = downPos.current; downPos.current = null;
        if (d && Math.hypot(event.clientX - d[0], event.clientY - d[1]) < 6) onCycle();
      }}>
      <planeGeometry args={[SW, SH]} />
      <meshBasicMaterial color={screenColor} map={map} toneMapped={false} />
    </mesh>
    <PlateLabel label={id} x={0} y={-H / 2 + 0.007} scale={0.38} z={0.032} />
    {[-1, 1].flatMap(sx => [-1, 1].map(sy =>
      <mesh key={`${sx}/${sy}`} position={[sx * (W / 2 - 0.009), sy * (H / 2 - 0.009), 0.024]}
        material={matHardware} raycast={() => null}><circleGeometry args={[0.003, 8]} /></mesh>))}
  </group>;
}

function FlightInstrument({ kind, map, x, y, station }: {
  kind: InstrumentKind; map: THREE.Texture; x: number; y: number; station: string;
}) {
  const panelLight = usePanelLight();
  const color = useMemo(() => new THREE.Color().setRGB(
    0.55 + panelLight * 0.45, 0.55 + panelLight * 0.45, 0.55 + panelLight * 0.45,
    THREE.SRGBColorSpace), [panelLight]);
  return <group name={`instrument-${station}-${kind}`} position={[x, y, 0.02]}>
    <Bar position={[0, 0, 0]} args={[0.166, 0.166, 0.025]} material={matGasket} />
    <Bar position={[0, 0, 0.01]} args={[0.159, 0.159, 0.018]} material={matMullion} />
    <mesh position={[0, 0, 0.02]} raycast={() => null}>
      <planeGeometry args={[0.149, 0.149]} />
      <meshBasicMaterial color={color} map={map} toneMapped={false} />
    </mesh>
    {(kind === "adi" || kind === "hsi") && <mesh position={[0, 0, 0.021]} material={matHardware} raycast={() => null}>
      <ringGeometry args={[0.064, 0.07, 48]} />
    </mesh>}
    <PlateLabel label={kind.toUpperCase()} x={0} y={-0.081} z={0.023} scale={0.38} />
  </group>;
}

/** Red MASTER ALARM pushbutton indicator — SCOM §2.2 places four on panels
 *  F2, F4, A7, and MO52J [sourced]. Positions below are [estimated];
 *  MO52J is not a flight-deck panel in this blockout and is not modeled. */
function MasterAlarm({ x, y, z = 0.02 }: { x: number; y: number; z?: number }) {
  const lit = masterAlarmLit();
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0, 0.004]}>
        <boxGeometry args={[0.045, 0.028, 0.014]} />
        <meshStandardMaterial
          color={lit ? "#ff2a1a" : "#5a1610"}
          emissive={lit ? "#ff2a1a" : "#000000"}
          emissiveIntensity={lit ? 1.4 : 0}
          roughness={0.4}
        />
      </mesh>
      <PlateLabel label="MASTER ALARM" x={0} y={-0.027} scale={0.4} />
    </group>
  );
}

/** F7 C/W annunciator matrix: static legend faceplate plus one emissive lamp
 *  overlay per legend. Only lamps with a real sim channel light (see
 *  cwLampLit); the rest stay dark. Faceplate 0.23×0.16 m [estimated]. */
function CwMatrix({ x, y, map }: { x: number; y: number; map: THREE.Texture }) {
  const W = 0.23;
  const H = 0.16;
  const lamps: { label: string; px: number; py: number }[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 8; c++) {
      // Must match the lamp-window geometry drawn in paintCwMatrix
      // (640×400 canvas, 6 px frame).
      const cx = (6 + c * 78.5 + 78.5 * 0.5) / 640;
      const cy = (6 + r * 77.6 + 77.6 * 0.36) / 400;
      lamps.push({ label: CW_MATRIX[r][c], px: (cx - 0.5) * W, py: (0.5 - cy) * H });
    }
  }
  return (
    <group position={[x, y, 0.015]}>
      <mesh position={[0, 0, 0.012]} raycast={() => null}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      {lamps.map((l, i) => {
        const lit = l.label !== "" && cwLampLit(l.label);
        return (
          <mesh key={i} position={[l.px, l.py, 0.016]} raycast={() => null}>
            <planeGeometry args={[0.017, 0.015]} />
            <meshBasicMaterial
              color={lit ? "#ffb14e" : "#000000"}
              transparent
              opacity={lit ? 0.9 : 0}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * ADI attitude selector rotary (INRTL / LVLH / REF).
 * P4: rendered inert — the ADI source select has no root model behind it,
 * so the knob does not move rather than pretending to switch sources.
 */
function AdiAttRotary({ x, y = -0.17 }: { x: number; y?: number }) {
  const modes = ["INRTL", "LVLH", "REF"];
  const mode = 0;
  return (
    <group position={[x, y, 0.02]}>
      <mesh position={[0, 0, 0.004]} raycast={() => null} material={matHardware}>
        <cylinderGeometry args={[0.02, 0.024, 0.012, 16]} />
      </mesh>
      <mesh position={[0, 0, 0.014]} rotation={[0, 0, (-mode * Math.PI * 2) / 3]} raycast={() => null}>
        <boxGeometry args={[0.008, 0.03, 0.012]} />
        <meshStandardMaterial color="#8a8d86" roughness={0.5} />
      </mesh>
      <PlateLabel label="ADI ATT" x={0} y={0.042} scale={0.5} />
      <PlateLabel label={modes[mode]} x={0} y={-0.042} scale={0.5} />
    </group>
  );
}

/**
 * ATT REF pushbutton.
 * P4: rendered inert — no root model consumes an attitude reference
 * update, so the button does not light rather than faking an action.
 */
function AttRefButton({ x, y = -0.17 }: { x: number; y?: number }) {
  return (
    <group position={[x, y, 0.02]}>
      <mesh position={[0, 0, 0.004]} raycast={() => null}>
        <boxGeometry args={[0.055, 0.026, 0.012]} />
        <meshStandardMaterial color="#3a4046" roughness={0.5} />
      </mesh>
      <PlateLabel label="ATT REF" x={0} y={-0.03} scale={0.5} />
    </group>
  );
}

/** RCS COMMAND lamp cluster. P4: lit from RCS firing truth (non-zero
 * commanded torque in an RCS-effector config with propellant), not phase. */
function RcsCmdLamps({ x, y = -0.17 }: { x: number; y?: number }) {
  const active = sim.running && sim.rcsFiring;
  return (
    <group position={[x, y, 0.02]}>
      <PlateLabel label="RCS CMD" x={0} y={0.038} scale={0.5} />
      {[-0.032, 0, 0.032].map((lx) => (
        <mesh key={lx} position={[lx, 0, 0.008]} raycast={() => null}>
          <circleGeometry args={[0.011, 12]} />
          <meshBasicMaterial color={active ? "#8fefb0" : "#2c3430"} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

const OVERHEAD_REDS = [2, 3, 16, 17, 44];
const SIDE_REDS = [4, 9];

// Commander-eye composition. Six forward windows W1–W6, numbered left to
// right facing forward (SCOM §1.2) [sourced]. These separated trapezoids
// replace overlapping rectangles; coordinates/sightlines remain estimated.
const FORWARD_PANES: [number, number][][] = [
  [[-1.4, -0.02], [-1.24, -0.02], [-1.26, 0.34], [-1.35, 0.3]],
  [[-1.18, -0.02], [-1.02, -0.02], [-1.05, 0.34], [-1.16, 0.34]],
  // Principal openings straddle the estimated CDR/PLT eye stations ±0.6.
  // Previously the commander looked directly into W2/W3's shared post.
  [[-0.96, -0.02], [-0.1, -0.02], [-0.14, 0.34], [-0.93, 0.34]],
  [[0.1, -0.02], [0.96, -0.02], [0.93, 0.34], [0.14, 0.34]],
  [[1.02, -0.02], [1.18, -0.02], [1.16, 0.34], [1.05, 0.34]],
  [[1.24, -0.02], [1.4, -0.02], [1.35, 0.3], [1.26, 0.34]],
];
function WindowFrame({ points }: { points: [number,number][] }) {
  const glazing=useMemo(()=>new THREE.ShapeGeometry(new THREE.Shape(points.map(p=>new THREE.Vector2(...p)))),[points]);
  useEffect(()=>()=>glazing.dispose(),[glazing]);
  return <group position={[0,0,-1.08]}>
    <mesh name="forward-glazing" geometry={glazing} material={matWindow} raycast={()=>null}/>
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

/* ------------------------------------------------------------------ */
/* CabinInterior                                                         */
/* ------------------------------------------------------------------ */

const _r = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nNeg = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _m = new THREE.Matrix4();
const SEVEN_DEG = (7 * Math.PI) / 180;

export function CabinInterior() {
  useSimTick();
  const inspection = useSyncExternalStore(subscribeCockpitInspection, getCockpitInspection, getCockpitInspection);
  const aimedRevision = useRef(-1);
  const targetPoint = useMemo(() => new THREE.Vector3(), []);
  const root = useRef<THREE.Group>(null);
  const glass = useRef<THREE.Mesh>(null);
  const veil = useRef<THREE.Mesh>(null);
  const displaySpill = useRef<THREE.PointLight>(null);
  const floodLight = useRef<THREE.PointLight>(null);
  const { camera, gl } = useThree();
  const [formats, setFormats] = useState<Partial<Record<CrtId, string>>>({});
  const [flood, setFlood] = useState(false);
  const prevView = useRef(sim.view);
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
      map.anisotropy = 4;
      return { canvas, map };
    };
    const crts = {} as Record<CrtId, { canvas: HTMLCanvasElement; map: THREE.CanvasTexture }>;
    (Object.keys(CRT_FORMATS) as CrtId[]).forEach((id) => { crts[id] = make(512, 384); });
    const instruments = {} as Record<InstrumentKind, { canvas: HTMLCanvasElement; map: THREE.CanvasTexture }>;
    (["adi", "hsi", "ami", "avvi"] as InstrumentKind[]).forEach(kind => { instruments[kind] = make(512, 512); });
    return {
      crts, instruments,
      cwMatrix: make(640, 400),
      meStrip: make(256, 384),
      overhead: make(1536, 320),
      aftL: make(640, 760),
      aftR: make(640, 480),
      aftRms: make(384, 288),
      aftSideL: make(256, 512),
      aftSideR: make(256, 512),
      aftLower: make(512, 128),
      kb: make(256, 128),
    };
  }, []);
  useEffect(() => () => {
    [...Object.values(tex.crts), ...Object.values(tex.instruments)].forEach(({ map }) => map.dispose());
    [tex.cwMatrix, tex.meStrip, tex.overhead, tex.aftL, tex.aftR, tex.aftRms,
      tex.aftSideL, tex.aftSideR, tex.aftLower, tex.kb].forEach(({ map }) => map.dispose());
  }, [tex]);

  // Static panel faces are painted once; live faces repaint in useFrame.
  useEffect(() => {
    paintCwMatrix(tex.cwMatrix.canvas, tex.cwMatrix.map);
    paintOverhead(tex.overhead.canvas, tex.overhead.map);
    paintAftRight(tex.aftR.canvas, tex.aftR.map);
    paintAftRms(tex.aftRms.canvas, tex.aftRms.map);
    paintAftSide(tex.aftSideL.canvas, tex.aftSideL.map,
      ["L9", "L12", "L11", "L10", "L13", "L14", "L15", "L16", "L17"], "PORT SIDE CONSOLE");
    paintAftSide(tex.aftSideR.canvas, tex.aftSideR.map,
      ["R10", "R16", "R17", "R18"], "STBD SIDE CONSOLE");
    paintAftLower(tex.aftLower.canvas, tex.aftLower.map);
    paintKeyboard(tex.kb.canvas, tex.kb.map);
  }, [tex]);

  // Drag-to-look + double-click recenter on the viewport.
  useEffect(() => attachLookControls(gl.domElement), [gl]);

  const lastInstrumentPaint = useRef(-1);
  const readingCrop = useRef({ fov: 42, offsetY: 0 });
  const crtFormat = (id: CrtId) => formats[id] ?? CRT_FORMATS[id][0];
  const cycleCrt = (id: CrtId) => setFormats(f => {
    const list = CRT_FORMATS[id], current = f[id] ?? list[0];
    return { ...f, [id]: list[(list.indexOf(current) + 1) % list.length] };
  });
  // NASA pre-MEDS baseline Fig. 2 labels three F7 CRTs. Their exact sizes,
  // placement and the aft station grouping remain estimates.
  const crtUnit = (id: CrtId, x: number, y: number) =>
    <CrtUnit id={id} map={tex.crts[id].map} x={x} y={y} onCycle={() => cycleCrt(id)} />;
  const flightInstrument = (station: string, kind: InstrumentKind, x: number, y: number) =>
    <FlightInstrument station={station} kind={kind} map={tex.instruments[kind].map} x={x} y={y} />;
  const forwardInstruments = (station: string) => <>
    {flightInstrument(station, "adi", 0, 0.15)}
    {flightInstrument(station, "hsi", 0, -0.04)}
    {flightInstrument(station, "ami", -0.185, 0.095)}
    {flightInstrument(station, "avvi", 0.185, 0.095)}
  </>;

  useFrame(({ clock }) => {
    const rig = root.current;
    if (!rig) return;
    const seated =
      sim.view === "cockpit" && sim.running && sim.phase !== "landed" && sim.phase !== "lost";
    rig.visible = seated;
    if (sim.view === "cockpit" && prevView.current !== "cockpit") resetLook();
    prevView.current = sim.view;
    if (!seated) {
      const perspective = camera as THREE.PerspectiveCamera;
      if (perspective.view?.enabled) perspective.clearViewOffset();
      window.__cockpitReadout = null;
      window.__instrumentReadout = undefined;
      return;
    }

    // Anchor the cabin in the orbiter body frame at the eye station. Shake
    // and look offsets move the camera (the eye), never the cabin.
    const basis = bodyBasis(sim.yaw, sim.pitch, sim.bank);
    _r.set(basis.rx, basis.ry, basis.rz);
    _d.set(basis.dx, basis.dy, basis.dz);
    _n.set(basis.nx, basis.ny, basis.nz);
    const terminal =
      sim.phase === "taem" || sim.phase === "approach" || sim.phase === "rollout" ||
      sim.phase === "landed" || (sim.phase === "lost" && sim.y < 8000);
    const scale = terminal ? 1 : 0.24;
    _eye.copy(_n).multiplyScalar(8 * scale)
      .addScaledVector(_d, 2.4 * scale)
      .addScaledVector(_r, -0.45 * scale);
    rig.position.copy(_eye);
    // Panels use a cabin-center origin. Put the eye at the commander station,
    // rather than accidentally centering the view on F7. Offset is estimated.
    rig.position.addScaledVector(_r, 0.6);
    _nNeg.copy(_n).negate();
    _m.makeBasis(_r, _d, _nNeg);
    rig.quaternion.setFromRotationMatrix(_m);
    // Retained estimated 7° downward sightline: the rig carries the same
    // baseline pitch the camera had when the rig used to follow it.
    rig.rotateX(-SEVEN_DEG);

    rig.updateWorldMatrix(true, true);
    const target = inspection.target ? rig.getObjectByName(COCKPIT_TARGETS[inspection.target].node) : undefined;
    if (aimedRevision.current !== inspection.revision) {
      aimedRevision.current = inspection.revision;
      resetLook();
      if (target) {
        target.getWorldPosition(targetPoint);
        camera.worldToLocal(targetPoint);
        lookState.yaw = Math.atan2(-targetPoint.x, -targetPoint.z);
        lookState.pitch = Math.atan2(targetPoint.y, Math.hypot(targetPoint.x, targetPoint.z));
      }
    }

    // The eye looks around the fixed cabin (scene's useFrame runs first and
    // leaves the camera on the 7° baseline).
    camera.rotateY(lookState.yaw);
    camera.rotateX(lookState.pitch);
    const perspective = camera as THREE.PerspectiveCamera;
    perspective.fov = inspection.target ? COCKPIT_TARGETS[inspection.target].fov : 62;
    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 600 && (inspection.target === "displays" || inspection.target === "crts")) {
      // Sample the real DOM limits at instrument cadence. The checklist can
      // be closed, restored or resized without a hard-coded phone crop.
      if (clock.elapsedTime - lastInstrumentPaint.current >= 1 / 15) {
        const tools = document.querySelector(".cockpit-tools")?.getBoundingClientRect();
        const sheet = document.querySelector<HTMLElement>(".sheet[data-open='true']");
        const header = document.querySelector(".hud .topbar")?.getBoundingClientRect();
        const top = sheet ? sheet.getBoundingClientRect().bottom : header?.bottom ?? rect.top + 110;
        readingCrop.current = portraitReadingLens(rect.width, rect.height,
          top - rect.top + 8, (tools?.top ?? rect.bottom - 160) - rect.top - 8, perspective.fov);
      }
      perspective.fov = readingCrop.current.fov;
      perspective.setViewOffset(rect.width, rect.height, 0, readingCrop.current.offsetY, rect.width, rect.height);
    } else if (perspective.view?.enabled) perspective.clearViewOffset();
    perspective.updateProjectionMatrix();
    camera.updateMatrixWorld();
    if (target && inspection.target) {
      target.getWorldPosition(targetPoint).project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      window.__cockpitReadout = { target: inspection.target,
        revision: inspection.revision,
        x: rect.left + (targetPoint.x + 1) * rect.width / 2,
        y: rect.top + (1 - targetPoint.y) * rect.height / 2,
        visible: Math.abs(targetPoint.x) <= 1 && Math.abs(targetPoint.y) <= 1 && Math.abs(targetPoint.z) <= 1,
        fov: perspective.fov };
    } else window.__cockpitReadout = null;

    if (displaySpill.current) displaySpill.current.intensity = 0.025 * getPanelLight();
    if (floodLight.current) floodLight.current.intensity = flood ? 0.5 : 0;
    // Live faces repaint at 15 Hz, not on every render frame.
    if (clock.elapsedTime - lastInstrumentPaint.current >= 1 / 15) {
      (Object.keys(tex.crts) as CrtId[]).forEach(id =>
        paintCrt(tex.crts[id].canvas, tex.crts[id].map, id, crtFormat(id)));
      (Object.keys(tex.instruments) as InstrumentKind[]).forEach(kind => {
        paintInstrument(tex.instruments[kind].canvas, kind, sim);
        tex.instruments[kind].map.needsUpdate = true;
      });
      paintMeStrip(tex.meStrip.canvas, tex.meStrip.map);
      paintAftLeft(tex.aftL.canvas, tex.aftL.map);
      const faces: NonNullable<Window["__instrumentReadout"]>["faces"] = {};
      const rect = gl.domElement.getBoundingClientRect();
      rig.traverse(node => {
        if (!node.name.startsWith("instrument-")) return;
        node.getWorldPosition(targetPoint).project(camera);
        const id = node.name.slice("instrument-".length);
        faces[id] = { x: rect.left + (targetPoint.x + 1) * rect.width / 2,
          y: rect.top + (1 - targetPoint.y) * rect.height / 2,
          visible: Math.abs(targetPoint.x) <= 1 && Math.abs(targetPoint.y) <= 1 && Math.abs(targetPoint.z) <= 1,
          ...(id in CRT_FORMATS ? { format: crtFormat(id as CrtId) } : {}) };
      });
      window.__instrumentReadout = { ...instrumentReadouts(sim), get: sim.get, readingRevision: inspection.revision,
        sourceAltitudeMeters: sim.y, sourceVerticalSpeedMps: sim.vy, faces };
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
  });

  return (
    <group ref={root} name="cockpit-interior" visible={false}>
      <pointLight ref={displaySpill} position={[0, -0.22, -0.52]} intensity={0.01875} distance={1.1} decay={2} color="#8dbc81" />
      <pointLight position={[-0.3, 0.12, -0.15]} intensity={0.36} distance={2.4} decay={2} color="#dae5ed" />
      {/* Cabin floodlight: ceiling-mounted above the crew station, so it
          washes the forward panels rather than lighting from behind the
          crew. Toggled by the FLD FWD / FLD AFT switches on the aft port
          panel. Position [estimated]. */}
      <pointLight ref={floodLight} position={[0, 0.72, -0.1]} intensity={0} distance={3.2} decay={2} color="#fff1d7" />

      {/* Overhead panels O1–O3, O5–O9 + O13–O16 breaker strip (O17 in O6) */}
      <group name="view-overhead" position={[0, 0.85, -0.45]} rotation={[1.2, 0, 0]}>
        <PanelPlate width={1.94} height={0.44} material={panelMaterial} />
        <mesh position={[0, 0, 0.015]} raycast={() => null}>
          <planeGeometry args={[1.88, 0.41]} />
          <meshBasicMaterial map={tex.overhead.map} toneMapped={false} />
        </mesh>
        <group position={[0, -0.32, 0.01]}>
          <PanelPlate width={1.94} height={0.16} material={panelMaterial} />
          <group position={[0, 0.025, 0]}>
            <SwitchField rows={2} cols={28} width={1.7} height={0.07} reds={OVERHEAD_REDS} />
          </group>
          {["O13", "O14", "O15", "O16"].map((code, i) => (
            <PlateLabel key={code} label={code} x={-0.72 + i * 0.48} y={-0.058} scale={0.7} />
          ))}
        </group>
      </group>

      {/* Overhead windows W7/W8: 20×20 in clear view each, numbered
          left-to-right facing aft (SCOM §1.2) [sourced]. Ceiling plate and
          window positions [estimated]. */}
      <Bar position={[0, 0.86, -0.05]} args={[1.7, 0.04, 1.0]} material={matHead} />
      {[
        { x: 0.38, id: "W7" },
        { x: -0.38, id: "W8" },
      ].map(({ x, id }) => (
        <group key={id} position={[x, 0.83, -0.05]} rotation={[0.45, 0, 0]}>
          <mesh raycast={() => null} material={matWindow}>
            <planeGeometry args={[DECK_DIMS.ohWindow, DECK_DIMS.ohWindow]} />
          </mesh>
          <Bar position={[0, DECK_DIMS.ohWindow / 2 + 0.015, 0.01]} args={[DECK_DIMS.ohWindow + 0.06, 0.03, 0.03]} material={matGasket} />
          <Bar position={[0, -DECK_DIMS.ohWindow / 2 - 0.015, 0.01]} args={[DECK_DIMS.ohWindow + 0.06, 0.03, 0.03]} material={matGasket} />
          <Bar position={[-DECK_DIMS.ohWindow / 2 - 0.015, 0, 0.01]} args={[0.03, DECK_DIMS.ohWindow + 0.06, 0.03]} material={matGasket} />
          <Bar position={[DECK_DIMS.ohWindow / 2 + 0.015, 0, 0.01]} args={[0.03, DECK_DIMS.ohWindow + 0.06, 0.03]} material={matGasket} />
          <PlateLabel label={id} x={0} y={-DECK_DIMS.ohWindow / 2 - 0.05} scale={0.55} />
        </group>
      ))}

      <Bar position={[0, 0.58, -0.72]} args={[2.2, 0.07, 0.9]} />
      <Bar position={[-1.05, 0.02, -0.62]} args={[0.08, 0.85, 0.85]} />
      <Bar position={[1.05, 0.02, -0.62]} args={[0.08, 0.85, 0.85]} />
      <Bar position={[0, -0.55, -0.48]} args={[1.6, 0.06, 0.9]} material={matHead} />

      {FORWARD_PANES.map((points,i)=><WindowFrame key={i} points={points}/>)}

      <mesh ref={glass} position={[0, 0.16, -1.12]} raycast={() => null}>
        <planeGeometry args={[2.9, 0.44]} />
        <meshBasicMaterial color="#b7d4ee" transparent opacity={0.04} depthWrite={false} />
      </mesh>
      <mesh ref={veil} position={[0, 0.12, -0.62]} raycast={() => null}>
        <planeGeometry args={[2.2, 1.4]} />
        <meshBasicMaterial color={VOID} transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Glareshield brow — dimensions [estimated]. F2/F4 MASTER ALARM
          pushbuttons (SCOM §2.2) [sourced] on the crew face, positions
          [estimated]. */}
      <mesh position={[0.24, -0.135, -1.01]} rotation={[0.25, 0, 0]} raycast={() => null} material={matHead}>
        <boxGeometry args={[2.25, 0.055, 0.22]} />
      </mesh>
      <MasterAlarm x={-0.6} y={-0.135} z={-0.888} />
      <MasterAlarm x={0.6} y={-0.135} z={-0.888} />

      {/* F6 — discrete commander instruments, early cockpit family.
          Face scales, source behavior and individual coordinates estimated. */}
      <group name="view-displays" position={[-0.6, -0.26, -0.78]} rotation={[-0.62, 0.14, 0]}>
        <PanelPlate width={0.56} height={0.52} material={panelMaterial} />
        {forwardInstruments("F6")}
        <AdiAttRotary x={-0.17} y={-0.15} />
        <AttRefButton x={0} y={-0.15} />
        <RcsCmdLamps x={0.17} y={-0.15} />
        <GearButton position={[-0.12, -0.2, 0.042]} target="gear-arm" label="ARM" active={sim.gearArmed} onPress={() => sim.armGear()} />
        <GearButton position={[0.12, -0.2, 0.042]} target="gear" label="DN" active={sim.gear} onPress={() => sim.toggleGear()} />
        {/* Commander's THC — Operator's Manual: on the left (outboard) side
            of the commander's forward panel. No pilot THC. Rendered inert:
            the sim has no translation-command model behind it, so the
            T-handle does not move rather than pretending to translate.
            T-handle shape [estimated]. */}
        <group position={[-0.345, -0.1, 0.02]}>
          <mesh position={[0, 0, 0]} raycast={() => null} material={matHardware}>
            <cylinderGeometry args={[0.011, 0.013, 0.045, 10]} />
          </mesh>
          <mesh position={[0, 0.032, 0]} raycast={() => null} material={matHead}>
            <boxGeometry args={[0.085, 0.022, 0.022]} />
          </mesh>
          <PlateLabel label="THC" x={0} y={-0.045} scale={0.45} />
        </group>
        <PlateLabel label="F6 · CDR" x={0} y={-0.245} scale={0.7} />
      </group>

      {/* F7 — three pre-MEDS CRTs, C/W and engine strip. Layout is an
          estimate of NASA's baseline topology, not a dimensioned STS-1 panel. */}
      <group name="view-crts" position={[0, -0.2, -0.84]} rotation={[-0.62, 0, 0]}>
        <PanelPlate width={0.66} height={0.86} material={panelMaterial} />
        {crtUnit("CRT1", -0.16, 0.28)}
        {crtUnit("CRT2", 0.16, 0.28)}
        {crtUnit("CRT3", 0, -0.28)}
        <CwMatrix x={-0.2} y={0.02} map={tex.cwMatrix.map} />
        <group position={[0.215, 0.02, 0.015]}>
          <mesh position={[0, 0, 0.012]} raycast={() => null}>
            <planeGeometry args={[0.13, 0.195]} />
            <meshBasicMaterial map={tex.meStrip.map} toneMapped={false} />
          </mesh>
        </group>
        <PlateLabel label="F7" x={0} y={-0.41} scale={0.6} />
      </group>

      {/* F8 — pilot discrete instruments; same available local-horizon truth */}
      <group position={[0.6, -0.26, -0.78]} rotation={[-0.62, -0.14, 0]}>
        <PanelPlate width={0.56} height={0.52} material={panelMaterial} />
        {forwardInstruments("F8")}
        <AdiAttRotary x={-0.17} y={-0.15} />
        <AttRefButton x={0} y={-0.15} />
        <RcsCmdLamps x={0.17} y={-0.15} />
        <PlateLabel label="F8 · PLT" x={0} y={-0.245} scale={0.7} />
      </group>

      {/* F1 / F9 outer forward panels — geometry only, contents unattested */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 1.02, -0.2, -0.68]} rotation={[-0.55, side * 0.5, 0]}>
          <PanelPlate width={0.3} height={0.42} material={panelMaterial} />
          <PlateLabel label={side < 0 ? "F1" : "F9"} x={0} y={0.17} scale={0.8} />
          <PlateLabel label="contents unattested" x={0} y={-0.1} scale={0.55} />
        </group>
      ))}

      {/* Forward side consoles, section-level */}
      <group position={[-1.12, -0.34, -0.27]} rotation={[-0.2, 1.15, 0]}>
        <PanelPlate width={0.42} height={0.55} material={panelMaterial} />
        <PlateLabel label="L1 · FIRE / SMOKE" x={0} y={0.19} scale={0.62} />
        <Bar position={[0, 0, 0.014]} args={[0.36, 0.008, 0.004]} material={matGasket} />
        <PlateLabel label="L2 · EMER O2" x={0} y={-0.19} scale={0.62} />
        <SwitchField rows={6} cols={4} width={0.34} height={0.42} reds={SIDE_REDS} />
      </group>
      <group position={[1.12, -0.34, -0.27]} rotation={[-0.2, -1.15, 0]}>
        <PanelPlate width={0.42} height={0.55} material={panelMaterial} />
        <PlateLabel label="R1 · EMER ELEC" x={0} y={0.19} scale={0.62} />
        <Bar position={[0, 0, 0.014]} args={[0.36, 0.008, 0.004]} material={matGasket} />
        <PlateLabel label="R2 · APU / SPRAY BOILER" x={0} y={-0.19} scale={0.62} />
        <SwitchField rows={6} cols={4} width={0.34} height={0.42} reds={SIDE_REDS} />
        {/* Representative commands on the documented R1/R2 panel groups.
            Exact switch locations and this grouped presentation are estimated. */}
        <Switch target="fuel-cells" position={[-0.05, 0.11, 0.05]} label="FC / MN" hot={sim.fuelCell}
          onDown={() => { sim.fuelCell = !sim.fuelCell; sim.notify(); }} />
        <PlateLabel label={sim.busVolts > 24 && sim.fuelCell ? "ON" : "OFF"} x={0.09} y={0.11} z={0.057} scale={0.5} />
        <Switch target="apu" position={[-0.05, -0.11, 0.05]} label="APU START" hot={sim.apu || sim.apuStarting}
          onDown={() => { if (sim.apuStarting) return; if (sim.apu) { sim.apu = false; sim.notify(); } else sim.perform("apu"); }} />
        <PlateLabel label={sim.apu ? "RUN" : sim.apuStarting ? "STARTING" : "OFF"} x={0.09} y={-0.11} z={0.057} scale={0.4} />
      </group>

      {/* Center console: estimated C3/C2 presentation. Lowered to clear the
          lower F7 CRT from the seated eye; this is not a measured crew reach. */}
      <group position={[0, -0.67, -0.5]}>
        <mesh position={[0, -0.08, 0.08]} raycast={() => null} material={matShell}>
          <boxGeometry args={[0.36, 0.24, 0.46]} />
        </mesh>
        <mesh position={[0, 0.02, -0.16]} rotation={[-0.55, 0, 0]} raycast={() => null} material={matShell}>
          <boxGeometry args={[0.36, 0.22, 0.04]} />
        </mesh>
        <group position={[0, 0.05, -0.14]} rotation={[-0.7, 0, 0]}>
          <PanelPlate width={0.32} height={0.18} material={panelMaterial} />
          <SwitchField rows={2} cols={6} width={0.28} height={0.12} reds={NO_REDS} />
        </group>
        <group position={[0, 0.13, -0.175]} rotation={[-0.55, 0, 0]}>
          <PlateLabel label="C3 · FWD DAP" x={0} y={0} scale={0.7} />
        </group>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.21, -0.02, 0.02]} rotation={[0, side * 0.5, 0]}>
            <PanelPlate width={0.14} height={0.1} material={panelMaterial} />
            <mesh position={[0, 0, 0.014]} raycast={() => null}>
              <planeGeometry args={[0.12, 0.08]} />
              <meshBasicMaterial map={tex.kb.map} toneMapped={false} />
            </mesh>
            <PlateLabel label="C2 · DPS KEY" x={0} y={-0.068} scale={0.5} />
          </group>
        ))}
      </group>

      {/* Aft station — single legacy CRT; no extra AMLCD.
          Grouping retained from later sources, numerical positions estimated. */}
      <group name="view-aft" position={[0.66, -0.05, 0.62]} rotation={[-0.15, -2.32, 0]}>
        <PanelPlate width={0.62} height={0.72} material={panelMaterial} />
        <PlateLabel label="AFT · STBD" x={0} y={0.325} scale={0.8} />
        {crtUnit("CRT4", -0.145, 0.14)}
        <mesh position={[0, -0.16, 0.015]} raycast={() => null}>
          <planeGeometry args={[0.58, 0.38]} />
          <meshBasicMaterial map={tex.aftR.map} toneMapped={false} />
        </mesh>
        <group position={[-0.17, -0.2, 0.02]}>
          <PanelPlate width={0.15} height={0.11} material={panelMaterial} />
          <mesh position={[0, 0.005, 0.014]} raycast={() => null}>
            <planeGeometry args={[0.13, 0.07]} />
            <meshBasicMaterial map={tex.kb.map} toneMapped={false} />
          </mesh>
          <PlateLabel label="R11L · DPS KEY" x={0} y={-0.068} scale={0.45} />
        </group>
        <Switch
          target="doors-open"
          position={[-0.06, -0.3, 0.03]}
          label="PLBD OP"
          hot={sim.doorsOpen}
          onDown={() => sim.perform("doors-open")}
        />
        <Switch
          target="doors-close"
          position={[0.06, -0.3, 0.03]}
          label="PLBD CL"
          hot={sim.doorsLatched}
          onDown={() => sim.perform("doors-close")}
        />
        <PlateLabel label={sim.doorTalkback} x={0} y={-0.38} z={0.05} scale={0.6} />
      </group>

      {/* Aft station — port: A1 comm, A4 time, A6U ADI, A7 floodlight +
          A7 MASTER ALARM pushbutton (SCOM §2.2) [sourced], pos [estimated]. */}
      <group position={[-0.66, -0.05, 0.62]} rotation={[-0.15, 2.32, 0]}>
        <PanelPlate width={0.62} height={0.72} material={panelMaterial} />
        <PlateLabel label="AFT · PORT" x={0} y={0.325} scale={0.8} />
        <mesh position={[0, -0.03, 0.015]} raycast={() => null}>
          <planeGeometry args={[0.58, 0.62]} />
          <meshBasicMaterial map={tex.aftL.map} toneMapped={false} />
        </mesh>
        {/* A6U ADI association is in the later source record and corroborated
            by NASA's pre-MEDS baseline Fig. 4; coordinates are estimated. */}
        {flightInstrument("A6U", "adi", -0.145, -0.07)}
        <PlateLabel label="A6U" x={-0.145} y={0.025} scale={0.45} />
        <AdiAttRotary x={-0.15} y={-0.18} />
        <Switch position={[0.15, -0.18, 0.03]} label="FLD FWD" hot={flood} onDown={() => setFlood((f) => !f)} />
        <Switch position={[0.25, -0.18, 0.03]} label="FLD AFT" hot={flood} onDown={() => setFlood((f) => !f)} />
        <MasterAlarm x={-0.24} y={0.24} />
      </group>

      {/* A8 — RMS mode/joint panel (attested labels only) */}
      <group position={[-0.66, -0.05, 0.16]} rotation={[-0.15, 2.6, 0]}>
        <PanelPlate width={0.4} height={0.3} material={panelMaterial} />
        <mesh position={[0, 0, 0.015]} raycast={() => null}>
          <planeGeometry args={[0.36, 0.26]} />
          <meshBasicMaterial map={tex.aftRms.map} toneMapped={false} />
        </mesh>
      </group>

      {/* A2 — RMS arm-translation controller (port station) */}
      <group position={[-0.42, -0.18, 0.68]} rotation={[-0.3, 2.75, 0]}>
        <PanelPlate width={0.2} height={0.16} material={panelMaterial} />
        <mesh position={[0, 0.02, 0.015]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null} material={matHardware}>
          <cylinderGeometry args={[0.008, 0.008, 0.03, 10]} />
        </mesh>
        <mesh position={[0, 0.02, 0.032]} raycast={() => null} material={matHead}>
          <boxGeometry args={[0.1, 0.02, 0.02]} />
        </mesh>
        <PlateLabel label="A2 · RMS TRANSLATION" x={0} y={-0.055} scale={0.75} />
      </group>

      {/* A5 / A10 position plates — contents unattested */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.66, 0.28, 0.32]} rotation={[0, side * 2.6, 0]}>
          <Bar position={[0, 0, 0]} args={[0.3, 0.16, 0.02]} material={panelMaterial} />
          <PlateLabel
            label={`${side < 0 ? "A5" : "A10"} · contents unattested`}
            x={side * -0.02}
            y={0.02}
            scale={0.62}
          />
        </group>
      ))}

      {/* Aft lower-center strip: A13/A16/A17 — contents unattested */}
      <group position={[0, -0.28, 0.72]} rotation={[-0.5, Math.PI, 0]}>
        <PanelPlate width={0.66} height={0.16} material={panelMaterial} />
        <mesh position={[0, 0, 0.015]} raycast={() => null}>
          <planeGeometry args={[0.62, 0.12]} />
          <meshBasicMaterial map={tex.aftLower.map} toneMapped={false} />
        </mesh>
      </group>

      {/* Aft side-console strips — panel codes only, contents unattested */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.95, -0.05, 0.05]} rotation={[-0.15, side * 1.35, 0]}>
          <PanelPlate width={0.22} height={0.5} material={panelMaterial} />
          <mesh position={[0, 0, 0.015]} raycast={() => null}>
            <planeGeometry args={[0.19, 0.46]} />
            <meshBasicMaterial map={side < 0 ? tex.aftSideL.map : tex.aftSideR.map} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* Aft-facing payload-bay windows: 14.5×11 in clear view each
          (SCOM §1.2) [sourced]. Positions [estimated]. */}
      {[-0.3, 0.3].map((x) => (
        <group key={x} position={[x, 0.58, 0.62]} rotation={[0.5, Math.PI, 0]}>
          <mesh raycast={() => null} material={matWindow}>
            <planeGeometry args={[DECK_DIMS.aftWindowW, DECK_DIMS.aftWindowH]} />
          </mesh>
          <Bar position={[0, DECK_DIMS.aftWindowH / 2 + 0.015, 0.01]} args={[DECK_DIMS.aftWindowW + 0.06, 0.03, 0.03]} material={matGasket} />
          <Bar position={[0, -DECK_DIMS.aftWindowH / 2 - 0.015, 0.01]} args={[DECK_DIMS.aftWindowW + 0.06, 0.03, 0.03]} material={matGasket} />
          <Bar position={[-DECK_DIMS.aftWindowW / 2 - 0.015, 0, 0.01]} args={[0.03, DECK_DIMS.aftWindowH + 0.06, 0.03]} material={matGasket} />
          <Bar position={[DECK_DIMS.aftWindowW / 2 + 0.015, 0, 0.01]} args={[0.03, DECK_DIMS.aftWindowH + 0.06, 0.03]} material={matGasket} />
        </group>
      ))}

      {/* RHC geometry is inert; vehicle attitude must not animate crew input. */}
      <group>
        {[-0.6, 0.6].map((x) => (
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
        <group key={side} position={[side * 0.6, -0.36, 0.08]}>
          <Bar position={[0, -0.07, 0.02]} args={[0.32, 0.07, 0.34]} material={seatMaterial} />
          <Bar position={[0, -0.1, -0.12]} args={[0.3, 0.045, 0.08]} material={seatMaterial} />
          <Bar position={[side * 0.15, 0, 0.02]} args={[0.055, 0.11, 0.32]} material={seatMaterial} />
          <Bar position={[side * -0.15, -0.01, 0.02]} args={[0.045, 0.08, 0.3]} material={seatMaterial} />
          {[-0.105, 0.105].map((seamX) => (
            <Bar key={seamX} position={[seamX, -0.034, 0.02]} args={[0.004, 0.003, 0.27]} material={matSeam} />
          ))}
          <Bar position={[0, -0.029, 0.07]} args={[0.029, 0.008, 0.028]} material={matGasket} />
          <Bar position={[0.025, -0.021, 0.07]} args={[0.038, 0.009, 0.034]} material={matHardware} />
          <mesh position={[0, 0.1, 0.18]} rotation={[-0.45, 0, side * 0.04]} raycast={() => null} material={seatMaterial}>
            <boxGeometry args={[0.3, 0.34, 0.05]} />
          </mesh>
          <mesh position={[0, 0.28, 0.24]} rotation={[-0.15, 0, 0]} raycast={() => null} material={matHead}>
            <boxGeometry args={[0.16, 0.09, 0.07]} />
          </mesh>
        </group>
      ))}

      {/* Cool skylight fill through the forward windows: positioned
          above-forward of the panels so it reads as exterior light spilling
          through the glazing, not light emitted by the panels themselves.
          Positions [estimated]. */}
      <pointLight position={[0, 0.4, -0.35]} color="#fff1d7" intensity={0.24} distance={2.1} decay={2} />
      <pointLight position={[-0.52, 0.12, -0.7]} color="#b9d5f0" intensity={0.05} distance={0.85} decay={2} />
      <pointLight position={[0.52, 0.12, -0.7]} color="#b9d5f0" intensity={0.05} distance={0.85} decay={2} />
    </group>
  );
}
