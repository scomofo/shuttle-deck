/**
 * Master simulation clock. Port of gemini-capsule src/core/sim_clock.gd.
 *
 * Fixed-step, independent of render rate. Time acceleration runs more
 * fixed steps per frame rather than enlarging dt. Stages run in order
 * regardless of registration order (ARCHITECTURE.md §7.1).
 */

import { bus } from "./bus.ts";

export const FIXED_DT = 0.02;
export const COAST_DT = 1.0;
export const COAST_MIN_RATE = 100;
export const INTERACTIVE_MAX_RATE = 10;
export const MAX_STEPS_PER_FRAME = 2000;
export const RATES = [1, 4, 16, 100] as const;

export const Stage = {
  INPUT: 0,
  MISSION: 1,
  POWER_GUIDANCE: 2,
  SYSTEMS: 3,
  DYNAMICS: 4,
  DEPENDENT: 5,
} as const;

export type StageId = (typeof Stage)[keyof typeof Stage];

type Ticker = (dt: number) => void;

export class SimClock {
  get_seconds = 0;
  /** STS-1 liftoff 1981-04-12 12:00:04 UTC as a default epoch. */
  liftoff_jd = 2444707.000046296;
  rate = 1;
  paused = false;
  manual = false;
  step_count = 0;
  last_step_ms = 0;

  private accumulator = 0;
  private epoch_seen = 0;
  private tickers: Ticker[][] = [[], [], [], [], [], []];
  private rate_index = 0;

  add_ticker(callback: Ticker, stage: StageId = Stage.SYSTEMS): void {
    for (const st of this.tickers) if (st.includes(callback)) return;
    this.tickers[stage].push(callback);
  }

  remove_ticker(callback: Ticker): void {
    for (const st of this.tickers) {
      const i = st.indexOf(callback);
      if (i >= 0) st.splice(i, 1);
    }
  }

  ticker_count(): number {
    return this.tickers.reduce((n, st) => n + st.length, 0);
  }

  frame(wall_delta: number): void {
    if (this.paused) return;
    this.advance(wall_delta * this.rate, MAX_STEPS_PER_FRAME);
  }

  advance(sim_seconds: number, max_steps = -1): void {
    this.accumulator += sim_seconds;
    let steps = 0;
    while (this.accumulator >= FIXED_DT - 1e-9 && (max_steps < 0 || steps < max_steps)) {
      let dt = this.step_dt();
      if (this.accumulator < dt - 1e-9) dt = FIXED_DT;
      this._step(dt);
      this.accumulator -= dt;
      steps += 1;
    }
    if (max_steps >= 0 && steps >= max_steps && this.accumulator >= FIXED_DT) {
      this.accumulator = 0;
    }
  }

  step_dt(): number {
    if (this.rate < COAST_MIN_RATE || !bus.get_value("sys.coast_ok", false)) return FIXED_DT;
    if (bus.command_epoch !== this.epoch_seen) return FIXED_DT;
    let dt = COAST_DT;
    const next = Number(bus.get_value("seq.next_event_get_s", -1));
    if (next >= 0) {
      const until = next - this.get_seconds;
      if (until < COAST_DT) {
        dt = Math.max(Math.floor(until / FIXED_DT + 1e-9) * FIXED_DT, FIXED_DT);
      }
    }
    return dt;
  }

  private _step(dt: number): void {
    const t0 = performance.now();
    this.get_seconds += dt;
    bus.set_value("time.get_s", this.get_seconds);
    for (const stage of this.tickers) {
      for (const t of stage) t(dt);
    }
    this.epoch_seen = bus.command_epoch;
    this.last_step_ms = performance.now() - t0;
    this.step_count += 1;
  }

  set_rate(rate: number): void {
    this.rate = rate;
    const idx = RATES.indexOf(rate as (typeof RATES)[number]);
    if (idx >= 0) this.rate_index = idx;
    bus.set_value("sys.controls_locked", rate > INTERACTIVE_MAX_RATE);
  }

  faster(): void {
    this.rate_index = Math.min(this.rate_index + 1, RATES.length - 1);
    this.set_rate(RATES[this.rate_index]);
  }

  slower(): void {
    this.rate_index = Math.max(this.rate_index - 1, 0);
    this.set_rate(RATES[this.rate_index]);
  }

  get_display(): string {
    const s = Math.abs(Math.floor(this.get_seconds));
    const sign = this.get_seconds < 0 ? "-" : "";
    const hh = String(Math.floor(s / 3600)).padStart(3, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${sign}${hh}:${mm}:${ss}`;
  }

  julian_date(): number {
    return this.liftoff_jd + this.get_seconds / 86400;
  }

  reset(start_get = 0): void {
    this.get_seconds = start_get;
    this.accumulator = 0;
    this.step_count = 0;
    this.rate_index = 0;
    this.rate = 1;
    this.paused = false;
    for (const st of this.tickers) st.length = 0;
  }

  snapshot() {
    return {
      get_s: this.get_seconds,
      liftoff_jd: this.liftoff_jd,
      rate: this.rate,
      paused: this.paused,
    };
  }

  restore(d: { get_s: number; liftoff_jd: number; rate?: number; paused?: boolean }): void {
    this.get_seconds = d.get_s;
    this.liftoff_jd = d.liftoff_jd;
    this.set_rate(d.rate ?? 1);
    this.paused = Boolean(d.paused);
    this.accumulator = 0;
  }
}

export const clock = new SimClock();
