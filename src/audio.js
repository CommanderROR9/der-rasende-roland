// audio.js — Mini-WebAudio. Chiptune-Annäherung, ohne Assets, ohne Netz.
// Ohne AudioContext (z.B. in Tests) verhält es sich still.
export function createAudio() {
  let ac = null;
  let master = null;
  let enabled = true;

  function ctx() {
    if (ac) return ac;
    const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
    if (!AC) { enabled = false; return null; }
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0.22;
    master.connect(ac.destination);
    return ac;
  }

  function tone({ freq = 440, dur = 0.08, type = 'square', gain = 0.5, slide = 0, delay = 0 }) {
    const c = ctx();
    if (!c || !enabled) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.2, gain = 0.4, freq = 900 }) {
    const c = ctx();
    if (!c || !enabled) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  let engOsc = null, engGain = null;
  return {
    resume() { const c = ctx(); if (c && c.state === 'suspended') c.resume(); },
    /** Motorbrummen für das Fahr-Interludium. */
    engine(anteil = 0) {
      const c = ctx();
      if (!c || !enabled) return;
      if (!engOsc) {
        engOsc = c.createOscillator();
        engGain = c.createGain();
        engOsc.type = 'sawtooth';
        engGain.gain.value = 0.025;
        engOsc.connect(engGain);
        engGain.connect(master);
        engOsc.start();
      }
      engOsc.frequency.value = 55 + anteil * 105;
    },
    engineOff() {
      if (engOsc) { try { engOsc.stop(); } catch { /* schon aus */ } }
      engOsc = null; engGain = null;
    },
    setEnabled(on) { enabled = on; },
    play(name) {
      switch (name) {
        case 'beat': tone({ freq: 880, dur: 0.025, type: 'square', gain: 0.06 }); break;
        case 'jump': tone({ freq: 330, dur: 0.09, type: 'square', gain: 0.3, slide: 220 }); break;
        case 'pickup': tone({ freq: 660, dur: 0.07, gain: 0.3 }); tone({ freq: 990, dur: 0.09, gain: 0.3, delay: 0.07 }); break;
        case 'tritt': tone({ freq: 180, dur: 0.1, type: 'triangle', gain: 0.45, slide: -80 }); noise({ dur: 0.08, gain: 0.2, freq: 400 }); break;
        case 'hurt': tone({ freq: 200, dur: 0.18, type: 'sawtooth', gain: 0.35, slide: -120 }); break;
        case 'piccolo': tone({ freq: 2600, dur: 0.1, type: 'square', gain: 0.18, slide: -400 }); break;
        case 'shriek': tone({ freq: 1800, dur: 0.45, type: 'sawtooth', gain: 0.3, slide: 900 }); noise({ dur: 0.4, gain: 0.22, freq: 2200 }); break;
        case 'tenor': tone({ freq: 140, dur: 0.5, type: 'triangle', gain: 0.3, slide: -30 }); break;
        case 'frackoff': tone({ freq: 420, dur: 0.1, gain: 0.3 }); tone({ freq: 840, dur: 0.16, gain: 0.28, delay: 0.08 }); break;
        case 'collapse': tone({ freq: 300, dur: 0.5, type: 'triangle', gain: 0.35, slide: -200 }); break;
        case 'fanfare': [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.18, gain: 0.3, delay: i * 0.13 })); break;
        case 'morsch': noise({ dur: 0.25, gain: 0.25, freq: 1600 }); break;
        case 'gate': tone({ freq: 240, dur: 0.12, gain: 0.3 }); tone({ freq: 320, dur: 0.14, gain: 0.3, delay: 0.1 }); break;
        default: break;
      }
    },
  };
}
