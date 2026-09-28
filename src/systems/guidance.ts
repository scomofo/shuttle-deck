/**
 * DAP stand-in. Reads ctl.hand.* / ctl.dap.mode and publishes
 * guid.bank_deg, guid.q_cmd, guid.att_hold, and RCS torque.
 * Not the historical digital autopilot. Tagged [estimated].
 *
 * Entry/TAEM/approach: when the requested mode is manual and the DAP is
 * in auto, the phase-appropriate aero law engages by mission phase and
 * commands control effectors ONLY (guid.eff.*_cmd, guid.brake_cmd). It
 * never writes attitude or velocity state. Flight-director targets go to
 * guid.fd.bank_deg / guid.fd.pitch_deg / guid.fd.alt_err_m for the deck.
 */

import { bus } from "../core/bus.ts";
import { len, mul, type Vec3, v3 } from "../core/frames.ts";
import { v_rel } from "../dynamics/aero.ts";
import { nose_eci, ORBITER_INERTIA, q_body_x_along, qconj, qmul, type Quat } from "../dynamics/attitude.ts";
import guide from "../../assets/data/spacecraft/entry_guidance.json" with { type: "json" };

export type DapMode = "manual" | "lvlh" | "retrograde" | "entry" | "taem" | "approach";

type Vec3n = { x: number; y: number; z: number };

const D2R = Math.PI / 180;

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** Piecewise-linear schedule lookup over {v_mps, alpha_deg} points. */
function alpha_schedule(v_mps: number): number {
  const pts = [...(guide.alpha_schedule.points as Array<{ v_mps: number; alpha_deg: number }>)].sort(
    (a, b) => b.v_mps - a.v_mps,
  );
  if (v_mps >= pts[0].v_mps) return pts[0].alpha_deg;
  for (let i = 1; i < pts.length; i++) {
    if (v_mps >= pts[i].v_mps) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = (a.v_mps - v_mps) / (a.v_mps - b.v_mps || 1);
      return a.alpha_deg + (b.alpha_deg - a.alpha_deg) * f;
    }
  }
  return pts[pts.length - 1].alpha_deg;
}

export class Guidance {
  bank_deg = 0;
  auto = true;
  mode: DapMode = "manual";
  q_cmd: Quat = { x: 0, y: 0, z: 0, w: 1 };
  att_hold = false;
  // Flight-director / effector command truth (republished every tick).
  fd_bank_deg = 0;
  fd_pitch_deg = 0;
  fd_alt_err_m = 0;
  alpha_cmd_deg = 0;
  brake_cmd = 0;
  eff_cmd = { elevon_l_deg: 0, elevon_r_deg: 0, rudder_deg: 0, speedbrake_deg: 0, bodyflap_deg: 0 };

  tick(dt: number): void {
    const locked = Boolean(bus.get_value("sys.controls_locked", false));
    const requested = String(bus.get_value("ctl.dap.mode", this.mode));
    if (
      requested === "manual" ||
      requested === "lvlh" ||
      requested === "retrograde" ||
      requested === "entry" ||
      requested === "taem" ||
      requested === "approach"
    ) {
      this.mode = requested as DapMode;
    }
    if (bus.get_value("ctl.oms.burn", false) && this.mode === "manual") this.mode = "retrograde";

    const roll = locked ? 0 : Number(bus.get_value("ctl.hand.roll", 0));
    if (!this.auto || Math.abs(roll) > 0.05) {
      this.bank_deg = clamp(this.bank_deg + roll * 40 * dt, -70, 70);
    }
    const pitch = locked ? 0 : Number(bus.get_value("ctl.hand.pitch", 0));
    const yaw = locked ? 0 : Number(bus.get_value("ctl.hand.yaw", 0));

    this.att_hold = false;
    const v = bus.get_value("dyn.v_eci_mps") as number[] | null;
    if (this.mode === "retrograde" && v && v.length === 3) {
      const vel: Vec3 = { x: v[0], y: v[1], z: v[2] };
      const n = len(vel) || 1;
      this.q_cmd = q_body_x_along(mul(vel, -1 / n));
      this.att_hold = true;
    }

    // Aero laws engage by phase when the crew leaves the DAP in manual+auto.
    const phase = String(bus.get_value("mission.phase", "prelaunch"));
    const config = String(bus.get_value("seq.config", "stack"));
    const aero_law =
      this.auto && this.mode === "manual" && config === "entry"
        ? phase === "taem"
          ? "taem"
          : phase === "approach" || phase === "rollout"
            ? "approach"
            : phase === "entry"
              ? "entry"
              : null
        : this.mode === "entry" || this.mode === "taem" || this.mode === "approach"
          ? this.mode
          : null;

    let torque: Vec3;
    if (aero_law) {
      this.aero_tick(dt, aero_law, phase);
      torque = v3(); // moments come from the aero surfaces, not RCS
    } else {
      this.fd_bank_deg = this.bank_deg;
      this.fd_pitch_deg = 0;
      this.fd_alt_err_m = 0;
      this.alpha_cmd_deg = 0;
      this.brake_cmd = 0;
      this.eff_cmd = { elevon_l_deg: 0, elevon_r_deg: 0, rudder_deg: 0, speedbrake_deg: 0, bodyflap_deg: 0 };
      torque = this.att_hold ? this.hold_torque() : this.manual_rcs_torque(roll, pitch, yaw);
    }

    bus.set_value("guid.mode", aero_law ?? this.mode);
    bus.set_value("guid.att_hold", this.att_hold);
    bus.set_value("guid.q_cmd", [this.q_cmd.x, this.q_cmd.y, this.q_cmd.z, this.q_cmd.w]);
    bus.set_value("guid.bank_deg", this.bank_deg);
    bus.set_value("guid.fd.bank_deg", this.fd_bank_deg);
    bus.set_value("guid.fd.pitch_deg", this.fd_pitch_deg);
    bus.set_value("guid.fd.alt_err_m", this.fd_alt_err_m);
    bus.set_value("guid.alpha_cmd_deg", this.alpha_cmd_deg);
    bus.set_value("guid.brake_cmd", this.brake_cmd);
    bus.set_value("guid.eff.elevon_l_cmd", this.eff_cmd.elevon_l_deg);
    bus.set_value("guid.eff.elevon_r_cmd", this.eff_cmd.elevon_r_deg);
    bus.set_value("guid.eff.rudder_cmd", this.eff_cmd.rudder_deg);
    bus.set_value("guid.eff.speedbrake_cmd", this.eff_cmd.speedbrake_deg);
    bus.set_value("guid.eff.bodyflap_cmd", this.eff_cmd.bodyflap_deg);
    bus.set_value("prop.torque_body_nm", [torque.x, torque.y, torque.z]);
  }

  /**
   * Entry/TAEM/approach control laws. All outputs are effector commands;
   * attitude and velocity are steered only through aerodynamic moments.
   * Gains are [estimated]; this is a stand-in, not the onboard software.
   */
  private aero_tick(_dt: number, law: "entry" | "taem" | "approach", phase: string): void {
    const rv = bus.get_value("dyn.r_eci_m") as number[] | null;
    const vv = bus.get_value("dyn.v_eci_mps") as number[] | null;
    const qv = bus.get_value("dyn.q_body_from_eci") as number[] | null;
    const alt_m = Number(bus.get_value("dyn.alt_m", 0));
    const alpha_meas = Number(bus.get_value("aero.alpha_deg", 0));
    const beta_meas = Number(bus.get_value("aero.beta_deg", 0));
    const bank_meas = Number(bus.get_value("aero.bank_deg", 0));
    const p_rate = Number(bus.get_value("guid.rate.roll", 0));
    const q_rate = Number(bus.get_value("guid.rate.pitch", 0));
    const r_rate = Number(bus.get_value("guid.rate.yaw", 0));

    let vrel = 0;
    let gamma_deg = 0;
    let pitch_meas = 0;
    if (rv && vv && rv.length === 3 && vv.length === 3) {
      const r: Vec3n = { x: rv[0], y: rv[1], z: rv[2] };
      const vel: Vec3n = { x: vv[0], y: vv[1], z: vv[2] };
      const vr = v_rel(r, vel);
      vrel = len(vr);
      const rn = len(r) || 1;
      const rhat = { x: r.x / rn, y: r.y / rn, z: r.z / rn };
      gamma_deg = Math.asin(clamp((vr.x * rhat.x + vr.y * rhat.y + vr.z * rhat.z) / (vrel || 1), -1, 1)) / D2R;
      if (qv && qv.length === 4) {
        const nose = nose_eci({ x: qv[0], y: qv[1], z: qv[2], w: qv[3] });
        pitch_meas = Math.asin(clamp(nose.x * rhat.x + nose.y * rhat.y + nose.z * rhat.z, -1, 1)) / D2R;
      }
    }

    const landed = Boolean(bus.get_value("dyn.landed", false));
    if (landed || phase === "rollout") {
      // Derotate, full brakes; steering stays on the hand controller.
      this.fd_bank_deg = 0;
      this.fd_pitch_deg = 0;
      this.fd_alt_err_m = 0;
      this.alpha_cmd_deg = 0;
      this.brake_cmd = 1;
      this.eff_cmd = { elevon_l_deg: 0, elevon_r_deg: 0, rudder_deg: 0, speedbrake_deg: 0, bodyflap_deg: 0 };
      return;
    }

    const cfg = guide.approach as {
      alt_ref_slope_m_per_mps: number;
      touchdown_speed_mps: number;
      gamma_cmd_deg: number;
      gamma_gain_per_m: number;
    };
    this.alpha_cmd_deg = alpha_schedule(vrel);

    if (law === "entry") {
      // Hypersonic: hold alpha schedule, bank to the crew bank command.
      this.fd_bank_deg = this.bank_deg;
      this.fd_pitch_deg = gamma_deg + this.alpha_cmd_deg;
      this.fd_alt_err_m = 0; // no reference profile yet; P2 golden trajectory
      const elevon = clamp(-1.2 * (this.alpha_cmd_deg - alpha_meas) + 4.0 * q_rate, -25, 25);
      const de_diff = clamp(0.3 * (this.bank_deg - bank_meas) - 3.0 * p_rate, -10, 10);
      this.eff_cmd.elevon_l_deg = clamp(elevon + de_diff, -25, 25);
      this.eff_cmd.elevon_r_deg = clamp(elevon - de_diff, -25, 25);
      this.eff_cmd.rudder_deg = clamp(1.0 * beta_meas - 1.0 * r_rate, -27, 27);
      this.eff_cmd.speedbrake_deg = 0;
      this.eff_cmd.bodyflap_deg = clamp(0.6 * elevon, -20, 15);
      this.brake_cmd = 0;
      return;
    }

    // TAEM / approach: outer loop on altitude error against the energy line,
    // inner loop on pitch attitude through the elevons.
    const alt_err = alt_m - cfg.alt_ref_slope_m_per_mps * Math.max(0, vrel - cfg.touchdown_speed_mps);
    this.fd_alt_err_m = alt_err;
    // Flare: blend the outer glideslope to a shallow -3 deg below 150 m.
    // (A low-L/D glider cannot sustain a long shallow flare; the rotation
    // is short and the gear comes down at ~150 m.)
    const flare = clamp((150 - alt_m) / 150, 0, 1);
    const gamma_outer = cfg.gamma_cmd_deg - cfg.gamma_gain_per_m * alt_err;
    const gamma_cmd = gamma_outer * (1 - flare) + -3.0 * flare;
    const pitch_cmd = gamma_cmd + this.alpha_cmd_deg;
    this.fd_pitch_deg = pitch_cmd;
    this.fd_bank_deg = law === "taem" ? this.bank_deg : 0;
    const elevon = clamp(-2.0 * (pitch_cmd - pitch_meas) + 3.0 * q_rate, -25, 25);
    const de_diff = clamp(0.6 * (this.fd_bank_deg - bank_meas) - 1.5 * p_rate, -10, 10);
    this.eff_cmd.elevon_l_deg = clamp(elevon + de_diff, -25, 25);
    this.eff_cmd.elevon_r_deg = clamp(elevon - de_diff, -25, 25);
    this.eff_cmd.rudder_deg = clamp(1.0 * beta_meas - 1.0 * r_rate, -27, 27);
    const v_tgt = law === "taem" ? 240 : 135;
    this.eff_cmd.speedbrake_deg = clamp(2.5 * (vrel - v_tgt), 0, 60);
    this.eff_cmd.bodyflap_deg = clamp(0.6 * elevon, -20, 15);
    this.brake_cmd = 0;
  }

  /**
   * PD servo toward guid.q_cmd. When the DAP owns attitude the hand
   * controller is ignored. Gains are [estimated]; the DAP is a stand-in,
   * not the historical phase plane.
   */
  private hold_torque(): Vec3 {
    const qv = bus.get_value("dyn.q_body_from_eci") as number[] | null;
    if (!qv || qv.length !== 4) return v3();
    const q = { x: qv[0], y: qv[1], z: qv[2], w: qv[3] };
    // Error rotation from the current body frame to the commanded one,
    // expressed in body axes: q_err = q^-1 * q_cmd.
    let qe = qmul(qconj(q), this.q_cmd);
    if (qe.w < 0) qe = { x: -qe.x, y: -qe.y, z: -qe.z, w: -qe.w };
    const w = Math.min(1, Math.max(-1, qe.w));
    const angle = 2 * Math.acos(w);
    const s = Math.sqrt(Math.max(0, 1 - w * w));
    const axis = s > 1e-6 ? { x: qe.x / s, y: qe.y / s, z: qe.z / s } : { x: 0, y: 0, z: 0 };
    const om = {
      x: (Number(bus.get_value("guid.rate.roll", 0)) * Math.PI) / 180,
      y: (Number(bus.get_value("guid.rate.pitch", 0)) * Math.PI) / 180,
      z: (Number(bus.get_value("guid.rate.yaw", 0)) * Math.PI) / 180,
    };
    const KP = 0.05;
    const KD = 0.45;
    const TMAX = 8e5;
    return {
      x: clamp(ORBITER_INERTIA.x * (KP * angle * axis.x - KD * om.x), -TMAX, TMAX),
      y: clamp(ORBITER_INERTIA.y * (KP * angle * axis.y - KD * om.y), -TMAX, TMAX),
      z: clamp(ORBITER_INERTIA.z * (KP * angle * axis.z - KD * om.z), -TMAX, TMAX),
    };
  }

  /**
   * Manual RCS rotation with rate damping. Pure hand torque leaves any
   * stick bump as a permanent spin — there is no aerodynamic damping in
   * vacuum — so the manual path damps body rates the way the historical
   * DAP did. Authority is [estimated]: two 3870 N primary jets at ~4 m
   * moment arms ≈ 3e4 N·m per axis (the old 4e5-class values spun the
   * vehicle ~10x too hot). Damping decays a bumped rate with a ~2 s time
   * constant instead of tumbling forever.
   */
  private manual_rcs_torque(roll: number, pitch: number, yaw: number): Vec3 {
    const om = {
      x: (Number(bus.get_value("guid.rate.roll", 0)) * Math.PI) / 180,
      y: (Number(bus.get_value("guid.rate.pitch", 0)) * Math.PI) / 180,
      z: (Number(bus.get_value("guid.rate.yaw", 0)) * Math.PI) / 180,
    };
    const AUTH = { x: 4e4, y: 6e4, z: 3e4 };
    const DAMP = 0.5;
    return {
      x: clamp(AUTH.x * roll - DAMP * ORBITER_INERTIA.x * om.x, -AUTH.x, AUTH.x),
      y: clamp(AUTH.y * pitch - DAMP * ORBITER_INERTIA.y * om.y, -AUTH.y, AUTH.y),
      z: clamp(AUTH.z * yaw - DAMP * ORBITER_INERTIA.z * om.z, -AUTH.z, AUTH.z),
    };
  }

  snapshot() {
    return { bank_deg: this.bank_deg, auto: this.auto, mode: this.mode };
  }

  restore(d: { bank_deg: number; auto: boolean; mode?: DapMode }): void {
    this.bank_deg = d.bank_deg;
    this.auto = d.auto;
    if (d.mode) this.mode = d.mode;
    this.tick(0);
  }
}
