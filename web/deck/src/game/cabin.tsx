import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { bodyBasis, getSimVersion, sim, subscribeSim } from "@/sim/runtime";
import { useSurfaceMaterial } from "@/game/materials";
import { attachLookControls, lookState, resetLook } from "./look";

import { getPanelLight } from "./panel-lighting";

const AMBER = "#e8a15a";
const GREEN = "#8fefb0";
const PLASMA = "#ff6b3d";
const VOID = "#07090d";

/**
 * Seated-eye reconstruction of the late-orbiter (MEDS) flight deck.
 * Panel topology follows JSC-26419 Rev. B numbering and the SCOM MEDS/OI-27
 * sections; coordinates are visual estimates, not dimensioned drawings.
 * Anything not attested in those sources is labeled, not invented.
 */
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

// Local mission clock for the EVENT TIME / MET readouts (the sim publishes
// no master clock). Seconds since the deck module loaded.
const MET_T0 = typeof performance !== "undefined" ? performance.now() : 0;
function metSeconds() {
  return Math.max(0, Math.floor((performance.now() - MET_T0) / 1000));
}
function fmtMET(total: number) {
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${String(d).padStart(3, "0")}:${p2(h)}:${p2(m)}:${p2(s)}`;
}

/* ------------------------------------------------------------------ */
/* MDU screens                                                         */
/* ------------------------------------------------------------------ */

type MduId =
  | "CDR1" | "CDR2"
  | "CRT1" | "CRT2" | "CRT3" | "MFD1" | "MFD2"
  | "PLT1" | "PLT2"
  | "CRT4";

/** Local candidate formats per MDU. Clicking a bezel cycles these; this is a
 *  stand-in for exploring formats, not the real GPC display-select model. */
const MDU_FORMATS: Record<MduId, string[]> = {
  CDR1: ["adi", "hsi"],
  CDR2: ["adi", "ami"],
  CRT1: ["gnc", "sys"],
  CRT2: ["gnc", "traj"],
  CRT3: ["gnc", "sys", "traj"],
  MFD1: ["sys", "ami"],
  MFD2: ["traj", "sys"],
  PLT1: ["hsi", "ami"],
  PLT2: ["adi", "traj"],
  CRT4: ["gnc", "sys", "traj"],
};
/** CRT3 format-select buttons: DPS/SYS/TRAJ map to the gnc/sys/traj formats. */
const CRT3_SET = ["gnc", "sys", "traj"];
const CRT3_LABELS = ["DPS", "SYS", "TRAJ"];

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

function drawScreen(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: string,
) {
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

/** Paint one square MDU face: header strip plus the selected format. */
function paintMdu(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture, id: MduId, format: string) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#101418";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#0a0f14";
  g.fillRect(0, 0, W, 24);
  g.fillStyle = "#d7ecff";
  g.font = "600 13px 'IBM Plex Mono', monospace";
  g.textAlign = "left";
  g.textBaseline = "middle";
  g.fillText(id, 8, 13);
  g.textAlign = "right";
  g.fillText(format.toUpperCase(), W - 8, 13);
  drawScreen(g, 4, 28, W - 8, H - 32, format);
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

/** F7 caution/warning strip: seven live annunciators, backup alarm, GPC
 *  light, and the event-time readout. Painted live. */
function paintBrow(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#14171c";
  g.fillRect(0, 0, W, H);
  const n = CW_LAMPS.length;
  const cell = W / (n + 3);
  CW_LAMPS.forEach((lamp, i) => {
    const cx = cell * (i + 0.5);
    const lit = lamp.on();
    g.fillStyle = lit ? "#ffb14e" : "#232a31";
    g.fillRect(cx - cell * 0.42, 10, cell * 0.84, H - 20);
    g.strokeStyle = "#0a0c0e";
    g.lineWidth = 2;
    g.strokeRect(cx - cell * 0.42, 10, cell * 0.84, H - 20);
    g.fillStyle = lit ? "#1a1206" : "#5a636b";
    g.font = "600 15px 'IBM Plex Mono', monospace";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(lamp.label, cx, H / 2);
  });
  // Backup C/W alarm: lit whenever any annunciator is lit.
  const anyLit = CW_LAMPS.some((lamp) => lamp.on());
  const bx = cell * (n + 0.5);
  g.fillStyle = anyLit ? "#ff5a4a" : "#3a2320";
  g.beginPath();
  g.arc(bx, H / 2, 16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = anyLit ? "#1a0a08" : "#7a5a55";
  g.font = "600 11px 'IBM Plex Mono', monospace";
  g.fillText("BACKUP", bx, H / 2 - 7);
  g.fillText("C/W", bx, H / 2 + 7);
  // GPC caution/warning light.
  const gx = cell * (n + 1.5);
  const gpc = sim.fail !== "";
  g.fillStyle = gpc ? "#ffb14e" : "#232a31";
  g.beginPath();
  g.arc(gx, H / 2, 13, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = gpc ? "#1a1206" : "#5a636b";
  g.font = "600 11px 'IBM Plex Mono', monospace";
  g.fillText("GPC", gx, H / 2 - 7);
  g.fillText("C/W", gx, H / 2 + 7);
  // Event time readout.
  const ex = cell * (n + 2.5);
  g.fillStyle = "#d7ecff";
  g.font = "600 13px 'IBM Plex Mono', monospace";
  g.textAlign = "center";
  g.fillText("EVENT TIME", ex, 16);
  g.font = "600 20px 'IBM Plex Mono', monospace";
  g.fillStyle = GREEN;
  g.fillText(fmtMET(metSeconds()), ex, H - 22);
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
    ["O6", "GPC / DPS · O17"],
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
  g.fillText(fmtMET(metSeconds()), W / 2, 290);
  g.fillStyle = "#8a939b";
  g.font = "500 14px 'IBM Plex Mono', monospace";
  g.fillText("MISSION ELAPSED · EVENT TIME (local clock)", W / 2, 326);

  ohLabel(g, "A6U · ADI / FLT CNTLR", W / 4, 392, 16);
  ohSub(g, "aft attitude indicator selector", W / 4, 416);
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
  ohSub(g, "aft MDU — format cycles on click", W / 2, 56);

  ohLabel(g, "R13 · PAYLOAD BAY", W / 2, 220, 18);
  ohSub(g, "door + latch switches below", W / 2, 244);
  ohLabel(g, "R11U · FC PURGE", W / 4, 300, 15);
  ohLabel(g, "R11L · DPS KEYBOARD", (3 * W) / 4, 300, 15);
  ohSub(g, "see center console keys", (3 * W) / 4, 324);
  ohLabel(g, "R14 / R15 · MDU / ADC CB", W / 2, 380, 15);
  ohSub(g, "breaker panels — section level", W / 2, 404);
  tex.needsUpdate = true;
}

/** A8 RMS mode/joint panel face: ORB UNL, SHOULDER PITCH, SHOULDER YAW.
 *  P4: the LEDs are painted dark — labels only, no RMS model drives them. */
function paintAftRms(canvas: HTMLCanvasElement, tex: THREE.CanvasTexture) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const W = canvas.width;
  const H = canvas.height;
  g.fillStyle = "#232629";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#f4f1ea";
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
    g.strokeStyle = "#5a6068";
    g.lineWidth = 2;
    g.strokeRect(20, y - 26, W - 40, 52);
    ohLed(g, 56, y, color, "");
    g.fillStyle = "#f4f1ea";
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

/** Engraved panel code / section label, sized to fit its text. */
function PlateLabel({ label, x = 0, y, scale = 1, z = 0.016 }: { label: string; x?: number; y: number; scale?: number; z?: number }) {
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
      g.fillStyle = "#2a3038";
      g.fillText(label, 256, 34);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [label]);
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

/** One square MEDS MDU: bezel, live screen, six edgekeys. Click the screen
 *  (without dragging) to cycle its candidate formats. */
function MduUnit({
  id,
  map,
  x,
  y,
  onCycle,
}: {
  id: MduId;
  map: THREE.Texture;
  x: number;
  y: number;
  onCycle: () => void;
}) {
  const downPos = useRef<[number, number] | null>(null);
  return (
    <group position={[x, y, 0.015]}>
      <Bar position={[0, 0, -0.008]} args={[0.26, 0.28, 0.03]} material={matGasket} />
      <Bar position={[0, 0.005, 0]} args={[0.24, 0.26, 0.028]} material={matMullion} />
      <mesh
        position={[0, 0.015, 0.016]}
        onPointerDown={(event) => {
          event.stopPropagation();
          downPos.current = [event.clientX, event.clientY];
        }}
        onPointerUp={(event) => {
          event.stopPropagation();
          const d = downPos.current;
          downPos.current = null;
          if (d && Math.hypot(event.clientX - d[0], event.clientY - d[1]) < 6) onCycle();
        }}
      >
        <planeGeometry args={[0.21, 0.21]} />
        <meshBasicMaterial map={map} toneMapped={false} />
      </mesh>
      {[-0.075, -0.045, -0.015, 0.015, 0.045, 0.075].map((kx) => (
        <Bar key={kx} position={[kx, -0.108, 0.016]} args={[0.024, 0.012, 0.008]} material={matHead} />
      ))}
      <PlateLabel label={id} x={-0.085} y={0.122} scale={0.62} z={0.037} />
    </group>
  );
}

/** Small labeled pushbutton, e.g. the CRT3 DPS/SYS/TRAJ format selects. */
function MiniButton({
  x,
  y,
  label,
  active,
  onDown,
}: {
  x: number;
  y: number;
  label: string;
  active: boolean;
  onDown: () => void;
}) {
  return (
    <group position={[x, y, 0.02]}>
      <mesh
        position={[0, 0, 0.004]}
        onPointerDown={(event) => {
          event.stopPropagation();
          onDown();
        }}
      >
        <boxGeometry args={[0.05, 0.024, 0.012]} />
        <meshStandardMaterial color={active ? "#d4b27c" : "#3a4046"} roughness={0.5} />
      </mesh>
      <PlateLabel label={label} x={0} y={-0.028} scale={0.5} />
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
  const root = useRef<THREE.Group>(null);
  const glass = useRef<THREE.Mesh>(null);
  const veil = useRef<THREE.Mesh>(null);
  const sticks = useRef<THREE.Group>(null);
  const gearHandle = useRef<THREE.Group>(null);
  const displaySpill = useRef<THREE.PointLight>(null);
  const floodLight = useRef<THREE.PointLight>(null);
  const { camera, gl } = useThree();
  const [formats, setFormats] = useState<Partial<Record<MduId, string>>>({});
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
    const mdus = {} as Record<MduId, { canvas: HTMLCanvasElement; map: THREE.CanvasTexture }>;
    (Object.keys(MDU_FORMATS) as MduId[]).forEach((id) => {
      mdus[id] = make(256, 256);
    });
    return {
      mdus,
      brow: make(1024, 96),
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
    (Object.values(tex.mdus) as { map: THREE.CanvasTexture }[]).forEach(({ map }) => map.dispose());
    [tex.brow, tex.overhead, tex.aftL, tex.aftR, tex.aftRms,
      tex.aftSideL, tex.aftSideR, tex.aftLower, tex.kb].forEach(({ map }) => map.dispose());
  }, [tex]);

  // Static panel faces are painted once; live faces repaint in useFrame.
  useEffect(() => {
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
  const mduFormat = (id: MduId) => formats[id] ?? MDU_FORMATS[id][0];
  const cycleMdu = (id: MduId) =>
    setFormats((f) => {
      const list = MDU_FORMATS[id];
      const cur = f[id] ?? list[0];
      return { ...f, [id]: list[(list.indexOf(cur) + 1) % list.length] };
    });

  const mduUnits = (panel: "F6" | "F7" | "F8" | "R12") => {
    const defs: Record<string, { id: MduId; x: number; y: number }[]> = {
      F6: [
        { id: "CDR1", x: -0.135, y: 0.1 },
        { id: "CDR2", x: 0.135, y: 0.1 },
      ],
      F8: [
        { id: "PLT1", x: -0.135, y: 0.1 },
        { id: "PLT2", x: 0.135, y: 0.1 },
      ],
      F7: [
        { id: "CRT1", x: -0.2, y: 0.22 },
        { id: "CRT2", x: 0.2, y: 0.22 },
        { id: "CRT3", x: 0, y: 0.0 },
        { id: "MFD1", x: -0.2, y: -0.27 },
        { id: "MFD2", x: 0.2, y: -0.27 },
      ],
      R12: [{ id: "CRT4", x: 0, y: 0.17 }],
    };
    return defs[panel].map(({ id, x, y }) => (
      <MduUnit key={id} id={id} map={tex.mdus[id].map} x={x} y={y} onCycle={() => cycleMdu(id)} />
    ));
  };

  useFrame(({ clock }) => {
    const rig = root.current;
    if (!rig) return;
    const seated =
      sim.view === "cockpit" && sim.running && sim.phase !== "landed" && sim.phase !== "lost";
    rig.visible = seated;
    if (sim.view === "cockpit" && prevView.current !== "cockpit") resetLook();
    prevView.current = sim.view;
    if (!seated) return;

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
    _nNeg.copy(_n).negate();
    _m.makeBasis(_r, _d, _nNeg);
    rig.quaternion.setFromRotationMatrix(_m);
    // Retained estimated 7° downward sightline: the rig carries the same
    // baseline pitch the camera had when the rig used to follow it.
    rig.rotateX(-SEVEN_DEG);

    // The eye looks around the fixed cabin (scene's useFrame runs first and
    // leaves the camera on the 7° baseline).
    camera.rotateY(lookState.yaw);
    camera.rotateX(lookState.pitch);

    if (displaySpill.current) displaySpill.current.intensity = 0.025 * getPanelLight();
    if (floodLight.current) floodLight.current.intensity = flood ? 0.5 : 0;
    // Live faces repaint at 15 Hz, not on every render frame.
    if (clock.elapsedTime - lastInstrumentPaint.current >= 1 / 15) {
      (Object.keys(tex.mdus) as MduId[]).forEach((id) =>
        paintMdu(tex.mdus[id].canvas, tex.mdus[id].map, id, mduFormat(id)));
      paintBrow(tex.brow.canvas, tex.brow.map);
      paintAftLeft(tex.aftL.canvas, tex.aftL.map);
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
      <pointLight ref={floodLight} position={[0, 0.3, 0.9]} intensity={0} distance={2.5} decay={2} color="#fff1d7" />

      {/* Overhead panels O1–O3, O5–O9 + O13–O16 breaker strip (O17 in O6) */}
      <group position={[0, 0.48, -0.74]} rotation={[0.85, 0, 0]}>
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

      <Bar position={[0, 0.58, -0.72]} args={[2.2, 0.07, 0.9]} />
      <Bar position={[-1.05, 0.02, -0.62]} args={[0.08, 0.85, 0.85]} />
      <Bar position={[1.05, 0.02, -0.62]} args={[0.08, 0.85, 0.85]} />
      <Bar position={[0, -0.55, -0.48]} args={[1.6, 0.06, 0.9]} material={matHead} />

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

      {/* F6 — commander MEDS: CDR1/CDR2 + retained ADI/RCS cluster */}
      <group position={[-0.6, -0.26, -0.78]} rotation={[-0.62, 0.14, 0]}>
        <PanelPlate width={0.56} height={0.52} material={panelMaterial} />
        {mduUnits("F6")}
        <AdiAttRotary x={-0.17} y={-0.15} />
        <AttRefButton x={0} y={-0.15} />
        <RcsCmdLamps x={0.17} y={-0.15} />
        <PlateLabel label="F6 · CDR" x={0} y={-0.245} scale={0.7} />
      </group>

      {/* F7 — center MEDS: CRT1/CRT2, CRT3, MFD1/MFD2, C/W strip, grille */}
      <group position={[0, -0.22, -0.84]} rotation={[-0.62, 0, 0]}>
        <PanelPlate width={0.78} height={0.9} material={panelMaterial} />
        {mduUnits("F7")}
        {/* Caution/warning strip stays at the top of F7: the pedestal occludes
            the panel's lower center from the eye station. */}
        <group position={[0, 0.4, 0.015]}>
          <PanelPlate width={0.72} height={0.07} material={panelMaterial} />
          <mesh position={[0, 0, 0.014]} raycast={() => null}>
            <planeGeometry args={[0.7, 0.068]} />
            <meshBasicMaterial map={tex.brow.map} toneMapped={false} />
          </mesh>
        </group>
        {/* Vent grille between CRT1 and CRT2 — purpose unattested. */}
        <group position={[0, 0.22, 0.015]}>
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} position={[(i - 1.5) * 0.018, 0, 0]} args={[0.008, 0.1, 0.02]} material={matHead} />
          ))}
        </group>
        {/* Retained switch cluster below CRT3: DPS/SYS/TRAJ format selects. */}
        {CRT3_LABELS.map((label, i) => (
          <MiniButton
            key={label}
            x={(i - 1) * 0.055}
            y={-0.18}
            label={label}
            active={(formats.CRT3 ?? "gnc") === CRT3_SET[i]}
            onDown={() => setFormats((f) => ({ ...f, CRT3: CRT3_SET[i] }))}
          />
        ))}
        <PlateLabel label="F7 · PLT-CDR" x={0} y={-0.425} scale={0.6} />
      </group>

      {/* F8 — pilot MEDS: PLT1/PLT2 + retained ADI cluster */}
      <group position={[0.6, -0.26, -0.78]} rotation={[-0.62, -0.14, 0]}>
        <PanelPlate width={0.56} height={0.52} material={panelMaterial} />
        {mduUnits("F8")}
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
      <group position={[-0.92, -0.08, -0.7]} rotation={[-0.2, 0.65, 0]}>
        <PanelPlate width={0.42} height={0.55} material={panelMaterial} />
        <PlateLabel label="L1 · FIRE / SMOKE" x={0} y={0.19} scale={0.62} />
        <Bar position={[0, 0, 0.014]} args={[0.36, 0.008, 0.004]} material={matGasket} />
        <PlateLabel label="L2 · EMER O2" x={0} y={-0.19} scale={0.62} />
        <SwitchField rows={6} cols={4} width={0.34} height={0.42} reds={SIDE_REDS} />
      </group>
      <group position={[0.92, -0.08, -0.7]} rotation={[-0.2, -0.65, 0]}>
        <PanelPlate width={0.42} height={0.55} material={panelMaterial} />
        <PlateLabel label="R1 · EMER ELEC" x={0} y={0.19} scale={0.62} />
        <Bar position={[0, 0, 0.014]} args={[0.36, 0.008, 0.004]} material={matGasket} />
        <PlateLabel label="R2 · APU / SPRAY BOILER" x={0} y={-0.19} scale={0.62} />
        <SwitchField rows={6} cols={4} width={0.34} height={0.42} reds={SIDE_REDS} />
      </group>

      {/* Center console: C3 forward DAP set + C2 DPS keyboards */}
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
        <group
          ref={gearHandle}
          position={[-0.1, 0.02, 0.12]}
          rotation={[sim.gearCommand ? -0.9 : 0.7, 0, 0]}
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

      {/* Aft station — starboard: R12 CRT4, R13 PLBD, R11/R14/R15 */}
      <group position={[0.66, -0.05, 0.62]} rotation={[-0.15, -2.32, 0]}>
        <PanelPlate width={0.62} height={0.72} material={panelMaterial} />
        <PlateLabel label="AFT · STBD" x={0} y={0.325} scale={0.8} />
        {mduUnits("R12")}
        <mesh position={[0, -0.16, 0.015]} raycast={() => null}>
          <planeGeometry args={[0.58, 0.38]} />
          <meshBasicMaterial map={tex.aftR.map} toneMapped={false} />
        </mesh>
        <Switch
          position={[-0.06, -0.3, 0.03]}
          label="PLBD OP"
          hot={sim.doorsOpen}
          onDown={() => {
            if (!sim.doorsOpen) sim.toggleDoors();
          }}
        />
        <Switch
          position={[0.06, -0.3, 0.03]}
          label="PLBD CL"
          hot={!sim.doorsOpen}
          onDown={() => {
            if (sim.doorsOpen) sim.toggleDoors();
          }}
        />
      </group>

      {/* Aft station — port: A1 comm, A4 time, A6U ADI, A7 floodlight */}
      <group position={[-0.66, -0.05, 0.62]} rotation={[-0.15, 2.32, 0]}>
        <PanelPlate width={0.62} height={0.72} material={panelMaterial} />
        <PlateLabel label="AFT · PORT" x={0} y={0.325} scale={0.8} />
        <mesh position={[0, -0.03, 0.015]} raycast={() => null}>
          <planeGeometry args={[0.58, 0.62]} />
          <meshBasicMaterial map={tex.aftL.map} toneMapped={false} />
        </mesh>
        <AdiAttRotary x={-0.15} y={-0.18} />
        <Switch position={[0.15, -0.18, 0.03]} label="FLD FWD" hot={flood} onDown={() => setFlood((f) => !f)} />
        <Switch position={[0.25, -0.18, 0.03]} label="FLD AFT" hot={flood} onDown={() => setFlood((f) => !f)} />
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

      {/* Aft-facing windows */}
      {[-0.3, 0.3].map((x) => (
        <group key={x} position={[x, 0.58, 0.62]} rotation={[0.5, Math.PI, 0]}>
          <mesh raycast={() => null} material={matWindow}>
            <planeGeometry args={[0.3, 0.22]} />
          </mesh>
          <Bar position={[0, 0.12, 0.01]} args={[0.34, 0.03, 0.03]} material={matGasket} />
          <Bar position={[0, -0.12, 0.01]} args={[0.34, 0.03, 0.03]} material={matGasket} />
          <Bar position={[-0.16, 0, 0.01]} args={[0.03, 0.26, 0.03]} material={matGasket} />
          <Bar position={[0.16, 0, 0.01]} args={[0.03, 0.26, 0.03]} material={matGasket} />
        </group>
      ))}

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

      <pointLight position={[0, 0.4, -0.35]} color="#fff1d7" intensity={0.24} distance={2.1} decay={2} />
      <pointLight position={[-0.52, -0.16, -0.58]} color="#b9d5f0" intensity={0.035} distance={0.65} decay={2} />
      <pointLight position={[0.52, -0.16, -0.58]} color="#b9d5f0" intensity={0.035} distance={0.65} decay={2} />
    </group>
  );
}
