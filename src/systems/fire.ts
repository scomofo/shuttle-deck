/**
 * Fire / smoke detection owner. P4 systems depth.
 *
 * The O14 breaker cb MNA SMOKE DETN L/R FLT DK (USA006019 Rev. A §3.3.4.2)
 * applies power to the flight-deck smoke detectors; the electrical owner
 * already publishes elec.load.smoke_detn_flt_dk.powered for exactly that
 * chain (breaker closed + MN A powered). This owner gives the detector
 * behavior: the alarm is true while a smoke source is present AND the
 * detector is powered. Pull the breaker (or lose MN A) and the alarm
 * cannot annunciate.
 *
 * The smoke source is fault injection on ctl.fault.smoke_flt_dk (a test-
 * panel button in the control catalog; no deck switch drives it). The
 * alarm feeds the flight-deck C&W SMOKE lamp.
 *
 * State here is fully derived each tick; the snapshot is empty by design.
 */

import { bus } from "../core/bus.ts";

export class Fire {
  tick(_dt: number): void {
    this.publish_state();
  }

  publish_state(): void {
    const powered = Boolean(bus.get_value("elec.load.smoke_detn_flt_dk.powered", false));
    const smoke = Boolean(bus.get_value("ctl.fault.smoke_flt_dk", false));
    bus.set_value("sys.fire.detector_flt_dk_ok", powered);
    bus.set_value("sys.fire.smoke_flt_dk", smoke && powered);
  }

  snapshot() {
    return {};
  }

  restore(_d: Record<string, never>): void {
    this.publish_state();
  }
}
