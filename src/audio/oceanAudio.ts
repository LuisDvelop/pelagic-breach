export interface OceanAudioEngine {
  setEnabled: (enabled: boolean) => void;
  triggerEruptionSound: () => void;
  triggerImpactSplash: () => void;
  updateAmbient: (elapsedTime: number, paused: boolean) => void;
  dispose: () => void;
}

function createNoiseBuffer(ctx: AudioContext, seconds = 3): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  // Pink-ish noise via Paul Kellet's filter
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
    b6 = white * 0.115926;
    data[i] = Math.max(-1, Math.min(1, pink));
  }
  return buffer;
}

export function createOceanAudioEngine(): OceanAudioEngine {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let surfFilter: BiquadFilterNode | null = null;
  let surfGain: GainNode | null = null;
  let windFilter: BiquadFilterNode | null = null;
  let windGain: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let enabled = false;
  let initialized = false;

  const ensureInit = () => {
    if (initialized) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);

    noiseBuffer = createNoiseBuffer(ctx, 4);

    // 1. Ambient ocean swell surf bed
    const surfSrc = ctx.createBufferSource();
    surfSrc.buffer = noiseBuffer;
    surfSrc.loop = true;

    surfFilter = ctx.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 340;
    surfFilter.Q.value = 0.7;

    surfGain = ctx.createGain();
    surfGain.gain.value = 0.32;

    surfSrc.connect(surfFilter);
    surfFilter.connect(surfGain);
    surfGain.connect(masterGain);
    surfSrc.start();

    // 2. Gentle wind over calm sea & rigging
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;

    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 620;
    windFilter.Q.value = 1.9;

    windGain = ctx.createGain();
    windGain.gain.value = 0.09;

    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(masterGain);
    windSrc.start();

    initialized = true;
  };

  return {
    setEnabled: (nextEnabled: boolean) => {
      enabled = nextEnabled;
      if (enabled) {
        ensureInit();
        if (ctx && ctx.state === 'suspended') {
          void ctx.resume();
        }
        if (ctx && masterGain) {
          masterGain.gain.setTargetAtTime(0.75, ctx.currentTime, 0.35);
        }
      } else if (ctx && masterGain) {
        masterGain.gain.setTargetAtTime(0.0, ctx.currentTime, 0.25);
      }
    },

    triggerEruptionSound: () => {
      if (!enabled || !ctx || !masterGain || !noiseBuffer) return;
      const now = ctx.currentTime;

      // Deep resonant blue whale rumble call
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(52, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 1.4);

      const whaleGain = ctx.createGain();
      whaleGain.gain.setValueAtTime(0.001, now);
      whaleGain.gain.linearRampToValueAtTime(0.24, now + 0.28);
      whaleGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);

      osc.connect(whaleGain);
      whaleGain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 1.65);

      // Surging upward water breach rush
      const rushSrc = ctx.createBufferSource();
      rushSrc.buffer = noiseBuffer;
      rushSrc.loop = true;

      const rushFilter = ctx.createBiquadFilter();
      rushFilter.type = 'bandpass';
      rushFilter.frequency.setValueAtTime(220, now);
      rushFilter.frequency.exponentialRampToValueAtTime(1150, now + 0.8);
      rushFilter.Q.value = 0.8;

      const rushGain = ctx.createGain();
      rushGain.gain.setValueAtTime(0.001, now);
      rushGain.gain.linearRampToValueAtTime(0.36, now + 0.32);
      rushGain.gain.exponentialRampToValueAtTime(0.001, now + 2.2);

      rushSrc.connect(rushFilter);
      rushFilter.connect(rushGain);
      rushGain.connect(masterGain);
      rushSrc.start(now);
      rushSrc.stop(now + 2.25);
    },

    triggerImpactSplash: () => {
      if (!enabled || !ctx || !masterGain || !noiseBuffer) return;
      const now = ctx.currentTime;

      // Sub-bass water displacement thud
      const sub = ctx.createOscillator();
      sub.type = 'triangle';
      sub.frequency.setValueAtTime(76, now);
      sub.frequency.exponentialRampToValueAtTime(24, now + 0.75);

      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(0.45, now + 0.04);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

      sub.connect(subGain);
      subGain.connect(masterGain);
      sub.start(now);
      sub.stop(now + 0.95);

      // Massive broadband splash crash & lingering rolling spray
      const splashSrc = ctx.createBufferSource();
      splashSrc.buffer = noiseBuffer;
      splashSrc.loop = true;

      const splashFilter = ctx.createBiquadFilter();
      splashFilter.type = 'lowpass';
      splashFilter.frequency.setValueAtTime(2800, now);
      splashFilter.frequency.exponentialRampToValueAtTime(420, now + 3.2);
      splashFilter.Q.value = 0.6;

      const splashGain = ctx.createGain();
      splashGain.gain.setValueAtTime(0.001, now);
      splashGain.gain.linearRampToValueAtTime(0.62, now + 0.07);
      splashGain.gain.exponentialRampToValueAtTime(0.001, now + 3.6);

      splashSrc.connect(splashFilter);
      splashFilter.connect(splashGain);
      splashGain.connect(masterGain);
      splashSrc.start(now);
      splashSrc.stop(now + 3.7);
    },

    updateAmbient: (elapsedTime: number, paused: boolean) => {
      if (!enabled || !ctx || !surfFilter || !surfGain || !windFilter || !windGain || !masterGain) {
        return;
      }
      const now = ctx.currentTime;
      const swell = 0.5 + 0.5 * Math.sin(elapsedTime * 0.55);
      surfFilter.frequency.setTargetAtTime(240 + swell * 260, now, 0.12);
      surfGain.gain.setTargetAtTime(paused ? 0.14 : 0.24 + swell * 0.16, now, 0.12);

      const gust = 0.5 + 0.5 * Math.sin(elapsedTime * 0.31 + 1.3);
      windFilter.frequency.setTargetAtTime(480 + gust * 340, now, 0.2);
      windGain.gain.setTargetAtTime(paused ? 0.04 : 0.06 + gust * 0.06, now, 0.2);
    },

    dispose: () => {
      if (ctx) {
        void ctx.close();
        ctx = null;
      }
      initialized = false;
    },
  };
}
