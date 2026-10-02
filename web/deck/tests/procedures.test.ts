import assert from "node:assert/strict";
import { activeCard, buildProcedures } from "../src/sim/procedures.ts";

const flight = { phase: "orbit", running: true, fuelCell: true, busVolts: 28,
  apu: true, apuStarting: false, doorsOpen: false, gear: false, gearArmed: false, burnActive: false,
  srbAttached: false, get: 1000, altErr: 0, doorsLatched: true,
  doorTalkback: "CL", gearTalkback: "UP", speed: () => 180,
  periapsisAlt: 247_000, burnCommand: false, deorbitCommitted: false };
const latched = new Set<string>();
let cards = buildProcedures(flight, latched);
let doors = cards.find((card) => card.id === "plbd")!;
assert.equal(doors.steps[0].response, "CLOSED", "live readout must not show the desired position");
assert.equal(doors.steps[0].expected, "OPEN");
assert.equal(doors.steps[0].action, "doors-open");
assert.equal(doors.steps[1].action, undefined, "future actions are not offered");
assert.equal(activeCard(cards)?.id, "plbd");
assert.equal(flight.doorsOpen, false, "reading a checklist cannot operate the spacecraft");

flight.doorTalkback = "TRANSIT";
flight.doorsLatched = false;
doors = buildProcedures(flight, latched).find((card) => card.id === "plbd")!;
assert.equal(doors.steps[0].response, "TRANSIT");
assert.equal(doors.steps[0].done, false, "a command does not prove the doors reached their stop");
assert.match(doors.steps[0].waiting!, /Doors moving/);
flight.doorsOpen = true;
flight.doorTalkback = "OP";
doors = buildProcedures(flight, latched).find((card) => card.id === "plbd")!;
assert.equal(doors.steps[0].done, true);
assert.equal(doors.steps[1].response, "OPEN");
assert.equal(doors.steps[1].expected, "CLOSED");
assert.equal(doors.steps[1].action, "doors-close");

flight.doorsOpen = false;
flight.doorTalkback = "TRANSIT";
doors = buildProcedures(flight, latched).find((card) => card.id === "plbd")!;
assert.equal(doors.steps[1].done, false, "closing doors are not closed and latched");
assert.equal(doors.steps[1].response, "TRANSIT");
flight.doorTalkback = "CL";
flight.doorsLatched = true;
doors = buildProcedures(flight, latched).find((card) => card.id === "plbd")!;
assert(doors.steps.every((step) => step.done));
assert.equal(doors.steps[0].response, "CLOSED", "completed history must still report live position");

flight.phase = "ascent";
flight.srbAttached = true;
cards = buildProcedures(flight, new Set());
const monitor = activeCard(cards)!.steps.find((step) => step.current)!;
assert.equal(monitor.id, "mps:srb");
assert.equal(monitor.action, undefined, "monitored flight events cannot be acknowledged away");
assert.equal(monitor.expected, "SEP");

flight.phase = "orbit";
flight.doorsLatched = false;
let burn = buildProcedures(flight, latched).find((card) => card.id === "oms")!.steps[1];
assert.equal(burn.hold, "burn", "deorbit is a sustained crew input, not a one-shot command");
assert.match(burn.waiting!, /Close and latch/);
flight.doorsLatched = true;
burn = buildProcedures(flight, latched).find((card) => card.id === "oms")!.steps[1];
assert.equal(burn.waiting, undefined);
assert.equal(burn.done, false, "an available burn input is not verified entry");
flight.periapsisAlt = 109_000;
flight.burnCommand = true;
let deorbit = buildProcedures(flight, latched).find((card) => card.id === "oms")!;
assert.equal(deorbit.steps[1].done, true, "burn cutoff follows live orbital evidence");
assert.equal(deorbit.steps[2].current, true);
assert.match(deorbit.steps[2].waiting!, /Release/);
flight.burnCommand = false;
deorbit = buildProcedures(flight, latched).find((card) => card.id === "oms")!;
assert.equal(deorbit.steps[2].waiting, undefined);
assert.equal(deorbit.steps[2].action, "deorbit", "the required sequence command must be reachable");
flight.deorbitCommitted = true;
cards = buildProcedures(flight, latched);
assert.equal(cards.find((card) => card.id === "plbd"), undefined, "door-opening guidance ends when coast begins");
assert.equal(activeCard(cards)?.steps.find((step) => step.current)?.id, "oms:interface");
flight.deorbitCommitted = false;

flight.phase = "approach";
flight.gearArmed = true;
flight.speed = () => 200;
let gear = activeCard(buildProcedures(flight, new Set()))!.steps.find((step) => step.current)!;
assert.equal(gear.id, "gear:down");
assert.match(gear.waiting!, /190 m\/s/);
flight.speed = () => 180;
flight.gearTalkback = "TRANSIT";
gear = activeCard(buildProcedures(flight, new Set()))!.steps.find((step) => step.current)!;
assert.match(gear.waiting!, /Gear moving/);
assert.equal(gear.done, false);
flight.apu = false;
flight.apuStarting = true;
const apu = activeCard(buildProcedures(flight, new Set()))!.steps.find((step) => step.current)!;
assert.equal(apu.response, "STARTING", "spooling hydraulics must not look like an ignored command");
assert.match(apu.waiting!, /Wait for RUN/);
console.log("Procedure guidance separates live indications, required states and verified history");
