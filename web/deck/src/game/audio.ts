let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let rumble: OscillatorNode | null = null;
let rumbleGain: GainNode | null = null;
let wind: AudioBufferSourceNode | null = null;
let windGain: GainNode | null = null;

function context() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    rumble = ctx.createOscillator();
    rumble.type = "sawtooth";
    rumble.frequency.value = 42;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 180;
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumble.connect(filter);
    filter.connect(rumbleGain);
    rumbleGain.connect(master);
    rumble.start();

    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 700;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(wf);
    wf.connect(windGain);
    windGain.connect(master);
    wind.start();
  }
  return ctx;
}

export function unlockAudio() {
  const audio = context();
  if (audio.state === "suspended") void audio.resume();
}

export function syncAudio(plume: number, plasma: number, q: number, muted: boolean) {
  if (!ctx || !master || !rumbleGain || !windGain) return;
  const m = muted ? 0 : 1;
  const rumbleLevel = muted ? 0 : Math.min(0.22, plume * 0.16 + plasma * 0.08);
  const windLevel = muted ? 0 : Math.min(0.12, q / 180000);
  const now = ctx.currentTime;
  rumbleGain.gain.setTargetAtTime(rumbleLevel, now, 0.08);
  windGain.gain.setTargetAtTime(windLevel, now, 0.1);
  master.gain.setTargetAtTime(0.4 * m, now, 0.05);
  void m;
}

export function beep(freq = 740) {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
  osc.connect(gain);
  gain.connect(master);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}
