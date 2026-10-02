import assert from "node:assert/strict";
import { instrumentHeading, instrumentReadouts, scalePosition } from "../src/game/legacy-instruments.ts";
import { RootAdapter } from "../src/sim/root_adapter.ts";
import { portraitReadingLens } from "../src/game/cockpit-navigation.ts";

// Unit/sign regressions: the previous VS face labeled m/s as FPM and inverted
// descent. These are independently known physical conversions.
const data = instrumentReadouts({ y: 3048, vy: -30.48, yaw: -Math.PI / 2,
  pitch: Math.PI / 6, bank: -Math.PI / 3, mach: 2, alpha: Math.PI / 18 });
assert.equal(data.altitudeFeet, 10000);
assert.equal(data.verticalSpeedFpm, -6000);
assert.equal(data.headingDegrees, 90);
assert.ok(Math.abs(data.pitchDegrees - 30) < 1e-10);
assert.ok(Math.abs(data.bankDegrees + 60) < 1e-10);
assert.ok(Math.abs(data.alphaDegrees - 10) < 1e-10);
assert.equal(instrumentHeading(359.8), "000");
assert.equal(instrumentHeading(-90), "270");
assert.equal(scalePosition(700, 0, 400), 1, "orbital altitude stops at the face limit");
assert.equal(scalePosition(-20, -6, 6), 0, "fast descent stops at the face limit");
assert.equal(scalePosition(0, -6, 6), 0.5);
const phone = portraitReadingLens(390, 844, 330, 689, 42);
const shortPhone = portraitReadingLens(390, 600, 290, 445, 42);
assert.ok(phone.fov > 70, "portrait lens fits the side tapes");
assert.ok(shortPhone.fov > phone.fov, "short scene fits between checklist and navigation");
assert.equal(phone.offsetY, -87.5);
assert.equal(shortPhone.offsetY, -67.5);

// Real scenario sources, rather than a second presentation-owned vehicle.
const root = new RootAdapter();
root.start("approach");
const approach = instrumentReadouts(root.view());
assert.ok(Math.abs(approach.altitudeFeet - 6496.063) < 1);
assert.ok(approach.verticalSpeedFpm < 0, "approach is a descent");
root.start("orbit");
const orbit = instrumentReadouts(root.view());
assert.ok(orbit.altitudeFeet > 500000);
assert.equal(scalePosition(orbit.altitudeFeet / 1000, 0, 400), 1);
console.log("Legacy instruments: SI conversions, sign, heading wrap, scale limits and real root scenarios passed");
