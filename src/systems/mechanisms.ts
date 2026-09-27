/**
 * Mechanisms owner: payload bay doors and landing gear. P4 systems depth.
 *
 * Payload bay doors: ctl.plbd.open (switch) -> latch sequence -> drive
 * transit -> talkback. States: closed_latched -> unlatching -> driving_open
 * -> open -> driving_closed -> latching -> closed_latched. The drive
 * reverses if the command flips mid-transit; the latch groups only cycle
 * at the ends of travel. Transit times are [estimated].
 *
 * Landing gear: ctl.gear_arm (momentary button) latches the extend valves
 * (ARM); ctl.gear (switch) DN then drives the extend transit to a
 * down-lock talkback. DN without ARM is ignored. The gear is one-way:
 * once down-locked it stays down. Extend transit is [estimated].
 *
 * Wiring note: src/dynamics reads ctl.gear (the crew command) for gear
 * drag, so drag leads the down-lock talkback by the extend transit. That
 * is a known approximation, not a second truth: the talkback is the
 * mechanism; the drag is P3's command-keyed model.
 */

import { bus } from "../core/bus.ts";

export type PlbdState = "closed_latched" | "unlatching" | "driving_open" | "open" | "driving_closed" | "latching";
export type GearState = "up" | "armed" | "extending" | "down_locked";

/** Latch-group cycle time at each end of door travel [estimated]. */
const LATCH_S = 3;
/** Door drive time, closed to open [estimated]. */
const DRIVE_S = 60;
/** Gear extend transit, DN to down-lock [estimated]. */
const GEAR_TRANSIT_S = 8;

export class Mechanisms {
  plbd_state: PlbdState = "closed_latched";
  plbd_position = 0; // 0 closed .. 1 open
  plbd_t = 0;
  gear_state: GearState = "up";
  gear_t = 0;

  constructor() {
    this.publish_state();
  }

  /** Restore initial conditions (used by the deck adapter on start). */
  reset(): void {
    this.plbd_state = "closed_latched";
    this.plbd_position = 0;
    this.plbd_t = 0;
    this.gear_state = "up";
    this.gear_t = 0;
    this.publish_state();
  }

  tick(dt: number): void {
    this.tick_plbd(dt);
    this.tick_gear(dt);
    this.publish_state();
  }

  private tick_plbd(dt: number): void {
    const cmd_open = Boolean(bus.get_value("ctl.plbd.open", false));
    if (dt <= 0) return;
    switch (this.plbd_state) {
      case "closed_latched":
        if (cmd_open) {
          this.plbd_state = "unlatching";
          this.plbd_t = 0;
        }
        break;
      case "unlatching":
        this.plbd_t += dt;
        if (this.plbd_t >= LATCH_S) {
          this.plbd_state = "driving_open";
        }
        break;
      case "driving_open":
        if (!cmd_open) {
          this.plbd_state = "driving_closed";
          break;
        }
        this.plbd_position = Math.min(1, this.plbd_position + dt / DRIVE_S);
        if (this.plbd_position >= 1) this.plbd_state = "open";
        break;
      case "open":
        if (!cmd_open) this.plbd_state = "driving_closed";
        break;
      case "driving_closed":
        if (cmd_open) {
          this.plbd_state = "driving_open";
          break;
        }
        this.plbd_position = Math.max(0, this.plbd_position - dt / DRIVE_S);
        if (this.plbd_position <= 0) {
          this.plbd_state = "latching";
          this.plbd_t = 0;
        }
        break;
      case "latching":
        this.plbd_t += dt;
        if (this.plbd_t >= LATCH_S) this.plbd_state = "closed_latched";
        break;
    }
  }

  private tick_gear(dt: number): void {
    // The arm latch is dt-gated like every other command application: a
    // zero-dt tick only republishes, so restore is never clobbered.
    if (dt > 0 && Boolean(bus.get_value("ctl.gear_arm", false)) && this.gear_state === "up") {
      this.gear_state = "armed";
    }
    const dn = Boolean(bus.get_value("ctl.gear", false));
    if (dt <= 0) return;
    if (this.gear_state === "armed" && dn) {
      this.gear_state = "extending";
      this.gear_t = 0;
    } else if (this.gear_state === "extending") {
      this.gear_t += dt;
      if (this.gear_t >= GEAR_TRANSIT_S) this.gear_state = "down_locked";
    }
    // down_locked is sticky: the orbiter gear does not retract.
  }

  publish_state(): void {
    const talkback =
      this.plbd_state === "open" ? "OP" : this.plbd_state === "closed_latched" ? "CL" : "TRANSIT";
    bus.set_value("mech.plbd.position", this.plbd_position);
    bus.set_value("mech.plbd.state", this.plbd_state);
    bus.set_value("mech.plbd.open", this.plbd_state === "open");
    bus.set_value("mech.plbd.latched", this.plbd_state === "closed_latched");
    bus.set_value("mech.plbd.talkback", talkback);
    bus.set_value(
      "mech.plbd.moving",
      this.plbd_state === "unlatching" ||
        this.plbd_state === "driving_open" ||
        this.plbd_state === "driving_closed" ||
        this.plbd_state === "latching",
    );
    const gear_talkback =
      this.gear_state === "down_locked" ? "DN" : this.gear_state === "up" ? "UP" : this.gear_state === "armed" ? "ARM" : "TRANSIT";
    bus.set_value("mech.gear.state", this.gear_state);
    bus.set_value("mech.gear.armed", this.gear_state === "armed" || this.gear_state === "extending" || this.gear_state === "down_locked");
    bus.set_value("mech.gear.down_locked", this.gear_state === "down_locked");
    bus.set_value("mech.gear.talkback", gear_talkback);
  }

  snapshot() {
    return {
      plbd_state: this.plbd_state,
      plbd_position: this.plbd_position,
      plbd_t: this.plbd_t,
      gear_state: this.gear_state,
      gear_t: this.gear_t,
    };
  }

  restore(d: { plbd_state: PlbdState; plbd_position: number; plbd_t: number; gear_state: GearState; gear_t: number }): void {
    this.plbd_state = d.plbd_state;
    this.plbd_position = d.plbd_position;
    this.plbd_t = d.plbd_t;
    this.gear_state = d.gear_state;
    this.gear_t = d.gear_t;
    this.publish_state();
  }
}
