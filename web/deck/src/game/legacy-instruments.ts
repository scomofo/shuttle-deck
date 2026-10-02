/** Pre-MEDS presentation of the available vehicle truth. Face graphics and
 * scales are estimates, not STS-1 display-driver or inertial-ADI emulation.
 * Physical topology/provenance is recorded in HISTORICAL_INSTRUMENTS.md. */
export type InstrumentKind = "adi" | "hsi" | "ami" | "avvi";
export interface InstrumentState {
  y: number; vy: number; yaw: number; pitch: number; bank: number;
  mach: number; alpha: number;
}
export function instrumentReadouts(s: InstrumentState) {
  return {
    altitudeFeet: s.y / 0.3048,
    verticalSpeedFpm: s.vy * 60 / 0.3048, // positive climb; deck vy is m/s
    headingDegrees: ((-s.yaw * 180 / Math.PI) % 360 + 360) % 360,
    pitchDegrees: s.pitch * 180 / Math.PI,
    bankDegrees: s.bank * 180 / Math.PI,
    alphaDegrees: s.alpha * 180 / Math.PI,
    mach: s.mach,
  };
}
export function instrumentHeading(degrees: number) {
  return String(Math.round((degrees % 360 + 360) % 360) % 360).padStart(3, "0");
}

/** Mechanical-style scales stop at the face limits; they never wrap an
 * out-of-range orbital altitude into a plausible landing indication. */
export function scalePosition(value: number, min: number, max: number) {
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

const WHITE = "#e4e3d8", AMBER = "#e8a15a";
function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}
function attitude(g: CanvasRenderingContext2D, s: InstrumentState) {
  const r = 190;
  g.save();
  g.translate(256, 256);
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.clip();
  g.rotate(-s.bank);
  // Estimated local-horizon face. Real ADI source/reference selectors are inert.
  const pitchOffset = Math.max(-90, Math.min(90, s.pitch * 180 / Math.PI)) * 3;
  g.translate(0, pitchOffset);
  g.fillStyle = "#303534"; g.fillRect(-512, -1024, 1024, 1024);
  g.fillStyle = "#121716"; g.fillRect(-512, 0, 1024, 1024);
  g.strokeStyle = WHITE; g.lineWidth = 3;
  line(g, -256, 0, 256, 0);
  g.font = "22px monospace"; g.textAlign = "center";
  for (let d = -80; d <= 80; d += 10) {
    if (!d) continue;
    const y = -d * 3, w = d % 20 === 0 ? 78 : 45;
    line(g, -w, y, w, y);
    g.fillStyle = WHITE; g.fillText(String(Math.abs(d)), -w - 28, y + 7);
    g.fillText(String(Math.abs(d)), w + 28, y + 7);
  }
  g.restore();
  g.save(); g.translate(256, 256);
  g.strokeStyle = WHITE; g.lineWidth = 4;
  for (const degrees of [-60, -30, -20, -10, 0, 10, 20, 30, 60]) {
    const a = degrees * Math.PI / 180;
    line(g, Math.sin(a) * 196, -Math.cos(a) * 196,
      Math.sin(a) * 210, -Math.cos(a) * 210);
  }
  g.strokeStyle = AMBER; g.lineWidth = 7;
  line(g, -116, 0, -36, 0); line(g, 36, 0, 116, 0);
  line(g, -36, 0, 0, 18); line(g, 0, 18, 36, 0);
  g.restore();
}
function compass(g: CanvasRenderingContext2D, heading: number) {
  g.save(); g.translate(256, 256); g.rotate(-heading * Math.PI / 180);
  g.strokeStyle = WHITE; g.fillStyle = WHITE; g.lineWidth = 3;
  g.font = "26px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  for (let d = 0; d < 360; d += 5) {
    g.save(); g.rotate(d * Math.PI / 180);
    line(g, 0, -190, 0, d % 30 === 0 ? -165 : -180);
    if (d % 30 === 0) g.fillText(({0:"N",90:"E",180:"S",270:"W"} as Record<number,string>)[d] ?? String(d / 10), 0, -140);
    g.restore();
  }
  g.restore();
  g.strokeStyle = AMBER; g.lineWidth = 6;
  line(g, 256, 96, 256, 118);
  line(g, 256, 228, 256, 301); line(g, 222, 264, 290, 264);
  // No invented ILS/course/deviation needles: those sources are not modeled.
  g.fillStyle = WHITE; g.font = "30px monospace"; g.textAlign = "center";
  g.fillText(instrumentHeading(heading), 256, 365);
}
function tape(g: CanvasRenderingContext2D, x: number, label: string, value: number,
  min: number, max: number, number: string, unit: string) {
  const top = 120, bottom = 372;
  g.strokeStyle = "#78827b"; g.lineWidth = 3;
  g.fillStyle = WHITE; g.textAlign = "center"; g.font = "26px monospace";
  g.fillText(label, x, 78);
  line(g, x, top, x, bottom);
  for (let i = 0; i <= 10; i++) {
    const y = bottom - i / 10 * (bottom - top);
    line(g, x - 14, y, x + 14, y);
    if (i % 5 === 0) {
      g.font = "20px monospace"; g.textAlign = "right";
      g.fillText(String(Math.round(min + (max - min) * i / 10)), x - 22, y + 7);
    }
  }
  const y = bottom - scalePosition(value, min, max) * (bottom - top);
  g.fillStyle = AMBER; g.beginPath();
  g.moveTo(x + 34, y); g.lineTo(x + 58, y - 12); g.lineTo(x + 58, y + 12); g.fill();
  g.fillStyle = WHITE; g.textAlign = "center"; g.font = "29px monospace";
  g.fillText(number, x, 423); g.font = "20px monospace"; g.fillText(unit, x, 455);
  if (value < min || value > max) {
    g.fillStyle = AMBER; g.font = "19px monospace"; g.fillText("OFF SCALE", x, 492);
  }
}
export function paintInstrument(canvas: HTMLCanvasElement, kind: InstrumentKind, s: InstrumentState) {
  const g = canvas.getContext("2d");
  if (!g) return;
  const v = instrumentReadouts(s);
  g.save(); g.scale(canvas.width / 512, canvas.height / 512);
  g.fillStyle = "#080c0b"; g.fillRect(0, 0, 512, 512);
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  if (kind === "adi") attitude(g, s);
  else if (kind === "hsi") compass(g, v.headingDegrees);
  else if (kind === "ami") {
    tape(g, 132, "MACH", v.mach, 0, 27, v.mach.toFixed(2), "M");
    tape(g, 382, "ALPHA", v.alphaDegrees, -5, 50, v.alphaDegrees.toFixed(1), "DEG");
  } else {
    tape(g, 132, "ALT", v.altitudeFeet / 1000, 0, 400,
      (v.altitudeFeet / 1000).toFixed(1), "KFT MSL");
    tape(g, 382, "V/S", v.verticalSpeedFpm / 1000, -6, 6,
      (v.verticalSpeedFpm / 1000).toFixed(1), "KFT/MIN");
  }
  g.restore();
}

// Read-only rendering evidence: actual scene node projections and painted data.
// No vehicle, camera or control setters are exposed by this probe.
declare global {
  interface Window {
    __instrumentReadout?: ReturnType<typeof instrumentReadouts> & {
      get: number; readingRevision: number; sourceAltitudeMeters: number; sourceVerticalSpeedMps: number;
      faces: Record<string, { x: number; y: number; visible: boolean; format?: string }>;
    };
  }
}
