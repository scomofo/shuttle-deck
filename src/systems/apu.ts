/**
 * APU / hydraulics owner. P4 systems depth.
 *
 * Three hydrazine APUs, each driving one hydraulic system. Command path:
 * ctl.apu.N.start (switch) -> start only if an MN bus is powered (the APU
 * controller needs electrical power) and hydrazine remains -> spool-up
 * transit -> running -> hydraulic pressure ramps to nominal. Shutdown is
 * immediate; pressure decays. Fuel exhaustion flames the unit out.
 *
 * STS-1 note (procedure, not interlock): APUs 2+3 ran pre-deorbit through
 * entry; APU 1 came up after the pitch-around. The sim does not enforce
 * the flight rule; the crew starts the units.
 *
 * Numbers: 3000 psi nominal hydraulic pressure is the standard orbiter
 * figure [described]. Spool time, pressure ramp, and hydrazine quantities
 * are [estimated].
 *
 * Downstream: hyd.servo_ok is published as owned truth for the aerosurface
 * servo chain. The guidance aero laws (src/systems/guidance.ts) and the
 * effector integration (src/dynamics) are out of bounds for P4, so no
 * consumer gates on it yet; it is truth waiting for its reader, not a
 * decorative channel.
 */

import { bus } from "../core/bus.ts";

export type ApuUnitState = "off" | "starting" | "running";

/** Spool-up time from START to running [estimated]. */
const SPOOL_S = 45;
/** Nominal hydraulic pressure, 3000 psi [described]. */
const NOMINAL_PRESS_PA = 20.68e6;
/** Pressure ramp time to nominal [estimated]. */
const PRESS_RAMP_S = 10;
/** Hydrazine load per APU [estimated]. */
const FUEL_FULL_KG = 150;
/** Hydrazine flow while running [estimated]. */
const FUEL_FLOW_KG_S = 0.005;

export class Apu {
  /** Per-unit: state, spool timer, hydrazine, hydraulic pressure. */
  units: Array<{ state: ApuUnitState; spool_s: number; fuel_kg: number; press_pa: number }> = [];

  constructor() {
    this.reset();
  }

  /** Restore initial conditions (used by the deck adapter on start). */
  reset(): void {
    this.units = [0, 1, 2].map(() => ({ state: "off" as ApuUnitState, spool_s: 0, fuel_kg: FUEL_FULL_KG, press_pa: 0 }));
    this.publish_state();
  }

  get running_count(): number {
    return this.units.filter((u) => u.state === "running").length;
  }

  tick(dt: number): void {
    const elec_ok =
      Boolean(bus.get_value("elec.bus.mn_a.powered", false)) ||
      Boolean(bus.get_value("elec.bus.mn_b.powered", false)) ||
      Boolean(bus.get_value("elec.bus.mn_c.powered", false));
    this.units.forEach((u, i) => {
      const cmd = Boolean(bus.get_value(`ctl.apu.${i + 1}.start`, false));
      // Command application is dt-gated: a zero-dt tick only republishes,
      // so snapshot restore (which restores controls after systems) is
      // never clobbered by a stale channel value.
      if (dt > 0) {
        if (!cmd) {
          u.state = "off";
          u.spool_s = 0;
        } else if (u.state === "off" && elec_ok && u.fuel_kg > 0) {
          u.state = "starting";
          u.spool_s = 0;
        }
        if (u.state === "starting") {
          u.spool_s += dt;
          if (u.spool_s >= SPOOL_S) u.state = "running";
        }
        if (u.state === "running") {
          if (u.fuel_kg <= 0 || !elec_ok) {
            // Flameout: fuel exhaustion, or controller power lost.
            u.state = "off";
            u.spool_s = 0;
          } else {
            u.fuel_kg = Math.max(0, u.fuel_kg - FUEL_FLOW_KG_S * dt);
          }
        }
      }
      // Hydraulic pressure follows the prime mover with a ramp.
      const target = u.state === "running" ? NOMINAL_PRESS_PA : 0;
      if (dt > 0 && u.press_pa !== target) {
        const step = (NOMINAL_PRESS_PA / PRESS_RAMP_S) * dt;
        u.press_pa = target > u.press_pa ? Math.min(target, u.press_pa + step) : Math.max(target, u.press_pa - step);
      }
    });
    this.publish_state();
  }

  publish_state(): void {
    this.units.forEach((u, i) => {
      bus.set_value(`apu.${i + 1}.state`, u.state);
      bus.set_value(`apu.${i + 1}.running`, u.state === "running");
      bus.set_value(`apu.${i + 1}.hyd_press_pa`, u.press_pa);
      bus.set_value(`apu.${i + 1}.fuel_kg`, u.fuel_kg);
    });
    const pressurized = this.units.filter((u) => u.press_pa > NOMINAL_PRESS_PA / 2).length;
    bus.set_value("apu.running_count", this.running_count);
    bus.set_value("hyd.pressurized_count", pressurized);
    // Aerosurface servos need hydraulic power; one pressurized system is
    // the minimum the model credits [estimated rule].
    bus.set_value("hyd.servo_ok", pressurized >= 1);
  }

  snapshot() {
    return {
      units: this.units.map((u) => ({ state: u.state, spool_s: u.spool_s, fuel_kg: u.fuel_kg, press_pa: u.press_pa })),
    };
  }

  restore(d: { units: Array<{ state: ApuUnitState; spool_s: number; fuel_kg: number; press_pa: number }> }): void {
    this.units = d.units.map((u) => ({ ...u }));
    this.publish_state();
  }
}
