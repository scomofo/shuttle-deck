/**
 * Signal bus — the only coupling between controls, systems, and instruments.
 * Port of gemini-capsule src/core/bus.gd (ARCHITECTURE.md §3).
 *
 * Channels are "system.component.quantity". Writers set_value; readers
 * get_value; observers subscribe. All physical quantities on the bus are
 * SI. Display conversion happens in the instrument, never here.
 */

export type BusValue = number | boolean | string | number[] | null;

export class Bus {
  /** Incremented whenever a command channel (ctl.*) changes. SimClock
   *  uses it to keep the step after any new command at the fine length. */
  command_epoch = 0;

  private values = new Map<string, BusValue>();
  private subscribers = new Map<string, Array<(value: BusValue) => void>>();
  private any: Array<(channel: string, value: BusValue) => void> = [];

  set_value(channel: string, value: BusValue): void {
    if (this.values.has(channel) && same(this.values.get(channel), value)) return;
    this.values.set(channel, value);
    if (channel.startsWith("ctl.")) this.command_epoch += 1;
    for (const cb of this.any) cb(channel, value);
    const list = this.subscribers.get(channel);
    if (!list) return;
    for (const cb of [...list]) cb(value);
  }

  get_value<T extends BusValue = BusValue>(channel: string, fallback: T | null = null): T | null {
    if (!this.values.has(channel)) return fallback;
    return this.values.get(channel) as T;
  }

  has_channel(channel: string): boolean {
    return this.values.has(channel);
  }

  /** If the channel already has a value, the callback is invoked immediately. */
  subscribe(channel: string, callback: (value: BusValue) => void): void {
    const list = this.subscribers.get(channel) ?? [];
    list.push(callback);
    this.subscribers.set(channel, list);
    if (this.values.has(channel)) callback(this.values.get(channel) as BusValue);
  }

  unsubscribe(channel: string, callback: (value: BusValue) => void): void {
    const list = this.subscribers.get(channel);
    if (!list) return;
    this.subscribers.set(
      channel,
      list.filter((cb) => cb !== callback),
    );
  }

  on_any(callback: (channel: string, value: BusValue) => void): void {
    this.any.push(callback);
  }

  channels(): string[] {
    return [...this.values.keys()].sort();
  }

  /** Forget every value and subscription. Tests and mission reload. */
  reset(): void {
    this.values.clear();
    this.subscribers.clear();
    this.any = [];
    this.command_epoch = 0;
  }

  /** Forget values only; subscribers stay bound for a checkpoint restore. */
  reset_values_only(): void {
    this.values.clear();
    this.command_epoch = 0;
  }
}

function same(a: BusValue | undefined, b: BusValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  return a === b;
}

export const bus = new Bus();
