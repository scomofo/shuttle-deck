/**
 * Cabin-fixed presentation. Consumes the bus only.
 * Never writes dyn.* / guid.* / elec.* / prop.* / mission.*.
 *
 * Gemini: cabin stays at the origin; Earth is placed from the inverse
 * of dyn.r_eci_m and attitude. Same rule. No mesh is truth.
 */

import { bus } from "../core/bus.ts";
import { len, type Vec3 } from "../core/frames.ts";

export type WorldView = {
  world_r_cabin_m: number[];
  earth_distance_m: number;
  phase: string;
  get_s: number;
};

export class Presenter {
  last: WorldView = {
    world_r_cabin_m: [0, 0, 0],
    earth_distance_m: 0,
    phase: "",
    get_s: 0,
  };

  /** Off the truth path. Safe to call from a render frame. */
  sync(): WorldView {
    const r = (bus.get_value("dyn.r_eci_m", [0, 0, 0]) as number[]) ?? [0, 0, 0];
    const world = [-r[0], -r[1], -r[2]];
    this.last = {
      world_r_cabin_m: world,
      earth_distance_m: len({ x: r[0], y: r[1], z: r[2] } as Vec3),
      phase: String(bus.get_value("mission.phase", "")),
      get_s: Number(bus.get_value("time.get_s", 0)),
    };
    bus.set_value("present.world_r_cabin_m", world);
    bus.set_value("present.earth_distance_m", this.last.earth_distance_m);
    return this.last;
  }
}
