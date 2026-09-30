import assert from "node:assert/strict";
import { formatEventTime } from "../src/game/mission-time.ts";

assert.equal(formatEventTime(0), "000:00:00:00");
assert.equal(formatEventTime(65.99), "000:00:01:05");
assert.equal(formatEventTime(90061), "001:01:01:01");
assert.equal(formatEventTime(-30), "000:00:00:00");
assert.equal(formatEventTime(Number.NaN), "000:00:00:00");

console.log("F7 event timer formatting follows root simulation GET");
