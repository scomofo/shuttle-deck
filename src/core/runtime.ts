/**
 * Owns the set of truth owners for one running mission.
 * Port of gemini-capsule src/core/sim_runtime.gd (ARCHITECTURE.md §10–§11).
 */

import { bus } from "./bus.ts";
import { clock, Stage } from "./clock.ts";
import { Controls } from "../controls/registry.ts";
import { Dynamics } from "../dynamics/dynamics.ts";
import { Mission, type MissionData } from "../mission/mission.ts";
import { MissionSequencer } from "../mission/sequencer.ts";
import { Presenter } from "../presentation/presenter.ts";
import { Apu } from "../systems/apu.ts";
import { Ecs } from "../systems/ecs.ts";
import { Electrical } from "../systems/electrical.ts";
import { Fire } from "../systems/fire.ts";
import { Guidance } from "../systems/guidance.ts";
import { Mechanisms } from "../systems/mechanisms.ts";
import { Propulsion } from "../systems/propulsion.ts";
import sts from "../../assets/data/missions/sts_template/mission.json" with { type: "json" };

const SCHEMA_VERSION = 2;

export class SimRuntime {
  mission: Mission;
  dynamics: Dynamics;
  sequencer: MissionSequencer;
  controls: Controls;
  presenter: Presenter;
  systems: {
    electrical: Electrical;
    propulsion: Propulsion;
    guidance: Guidance;
    ecs: Ecs;
    apu: Apu;
    mechanisms: Mechanisms;
    fire: Fire;
  };
  last_checkpoint_error = "";

  constructor(data: MissionData = sts as MissionData) {
    this.mission = new Mission(data);
    this.dynamics = new Dynamics();
    this.sequencer = new MissionSequencer(this.mission, this.dynamics);
    this.controls = new Controls();
    this.presenter = new Presenter();
    this.systems = {
      electrical: new Electrical(),
      propulsion: new Propulsion(),
      guidance: new Guidance(),
      ecs: new Ecs(),
      apu: new Apu(),
      mechanisms: new Mechanisms(),
      fire: new Fire(),
    };
    this.bind();
  }

  bind(): void {
    clock.add_ticker((dt) => this.sequencer.tick(dt), Stage.MISSION);
    clock.add_ticker((dt) => this.systems.electrical.tick(dt), Stage.POWER_GUIDANCE);
    clock.add_ticker((dt) => this.systems.guidance.tick(dt), Stage.POWER_GUIDANCE);
    clock.add_ticker((dt) => this.systems.propulsion.tick(dt), Stage.SYSTEMS);
    clock.add_ticker((dt) => this.systems.apu.tick(dt), Stage.SYSTEMS);
    clock.add_ticker((dt) => this.systems.mechanisms.tick(dt), Stage.SYSTEMS);
    clock.add_ticker((dt) => this.systems.fire.tick(dt), Stage.SYSTEMS);
    clock.add_ticker((dt) => this.dynamics.tick(dt), Stage.DYNAMICS);
    clock.add_ticker((dt) => this.systems.ecs.tick(dt), Stage.DEPENDENT);
  }

  start(phase = "prelaunch"): void {
    bus.reset_values_only();
    this.controls.reset_latched();
    this.sequencer.start(phase);
    // Publish every system's initial truth so the bus is complete from
    // t=0; the deck facade reads root channels, never adapter memory.
    this.systems.electrical.tick(0);
    this.systems.propulsion.tick(0);
    this.systems.guidance.tick(0);
    this.systems.apu.tick(0);
    this.systems.mechanisms.tick(0);
    this.systems.fire.tick(0);
    this.systems.ecs.publish_state();
    this.dynamics.publish();
    this.presenter.sync();
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
        ecs: this.systems.ecs.snapshot(),
        apu: this.systems.apu.snapshot(),
        mechanisms: this.systems.mechanisms.snapshot(),
        fire: this.systems.fire.snapshot(),
      },
      controls: this.controls.snapshot(),
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
    this.controls.restore(d.controls);
    this.systems.electrical.restore(d.systems.electrical);
    this.systems.propulsion.restore(d.systems.propulsion);
    this.systems.guidance.restore(d.systems.guidance);
    this.systems.ecs.restore(d.systems.ecs);
    this.systems.apu.restore(d.systems.apu);
    this.systems.mechanisms.restore(d.systems.mechanisms);
    // Legacy telemetry recomputation needs restored mechanism progress, not
    // the abandoned flight's command or the new instance's UP default.
    this.dynamics.restore(d.dynamics);
    this.systems.fire.restore(d.systems.fire);
    this.systems.electrical.tick(0);
    this.systems.propulsion.tick(0);
    this.systems.guidance.tick(0);
    this.systems.ecs.tick(0);
    this.systems.apu.tick(0);
    this.systems.mechanisms.tick(0);
    this.systems.fire.tick(0);
    this.dynamics.publish();
    this.presenter.sync();
    clock.paused = was;
    return true;
  }
}
