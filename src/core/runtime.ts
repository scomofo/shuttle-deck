/**
 * Owns the set of truth owners for one running mission.
 * Port of gemini-capsule src/core/sim_runtime.gd (ARCHITECTURE.md §10–§11).
 */

import { bus } from "./bus.ts";
import { clock, Stage } from "./clock.ts";
import { Dynamics } from "../dynamics/dynamics.ts";
import { Mission, type MissionData } from "../mission/mission.ts";
import { MissionSequencer } from "../mission/sequencer.ts";
import { Electrical } from "../systems/electrical.ts";
import { Guidance } from "../systems/guidance.ts";
import { Propulsion } from "../systems/propulsion.ts";
import sts from "../../assets/data/missions/sts_template/mission.json" with { type: "json" };

const SCHEMA_VERSION = 1;

export class SimRuntime {
  mission: Mission;
  dynamics: Dynamics;
  sequencer: MissionSequencer;
  systems: {
    electrical: Electrical;
    propulsion: Propulsion;
    guidance: Guidance;
  };
  last_checkpoint_error = "";

  constructor(data: MissionData = sts as MissionData) {
    this.mission = new Mission(data);
    this.dynamics = new Dynamics();
    this.sequencer = new MissionSequencer(this.mission, this.dynamics);
    this.systems = {
      electrical: new Electrical(),
      propulsion: new Propulsion(),
      guidance: new Guidance(),
    };
    this.bind();
  }

  bind(): void {
    clock.add_ticker((dt) => this.sequencer.tick(dt), Stage.MISSION);
    clock.add_ticker((dt) => this.systems.electrical.tick(dt), Stage.POWER_GUIDANCE);
    clock.add_ticker((dt) => this.systems.guidance.tick(dt), Stage.POWER_GUIDANCE);
    clock.add_ticker((dt) => this.systems.propulsion.tick(dt), Stage.SYSTEMS);
    clock.add_ticker((dt) => this.dynamics.tick(dt), Stage.DYNAMICS);
  }

  start(phase = "prelaunch"): void {
    bus.reset_values_only();
    this.sequencer.start(phase);
    this.systems.electrical.publish_state();
    this.dynamics.publish();
  }

  snapshot() {
    return {
      schema_version: SCHEMA_VERSION,
      mission_id: this.mission.id(),
      mission_data_version: this.mission.data.data_version,
      clock: clock.snapshot(),
      mission: this.sequencer.snapshot(),
      dynamics: this.dynamics.snapshot(),
      systems: {
        electrical: this.systems.electrical.snapshot(),
        propulsion: this.systems.propulsion.snapshot(),
        guidance: this.systems.guidance.snapshot(),
      },
    };
  }

  restore(d: ReturnType<SimRuntime["snapshot"]>): boolean {
    if (d.schema_version !== SCHEMA_VERSION) {
      this.last_checkpoint_error = "schema";
      return false;
    }
    if (d.mission_id !== this.mission.id()) {
      this.last_checkpoint_error = "mission_id";
      return false;
    }
    const was = clock.paused;
    clock.paused = true;
    bus.reset_values_only();
    clock.restore(d.clock);
    this.sequencer.restore(d.mission);
    this.dynamics.restore(d.dynamics);
    this.systems.electrical.restore(d.systems.electrical);
    this.systems.propulsion.restore(d.systems.propulsion);
    this.systems.guidance.restore(d.systems.guidance);
    this.systems.electrical.tick(0);
    this.systems.propulsion.tick(0);
    this.systems.guidance.tick(0);
    this.dynamics.publish();
    clock.paused = was;
    return true;
  }
}
