"use client";
/** Generated 0:30-style loop for the "Your vibe" station: kick, hat, a filtered pad and a four-note motif.
    Audio needs one user gesture on iOS; the play button is the only unlock (brief §7). */
let ac: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nodes: (AudioNode | OscillatorNode)[] = [];

export function startSynth(bpm = 110, motif: number[] = [329.6, 392, 440, 329.6]) {
  stopSynth();
  try {
    ac = ac ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    const beat = 60 / bpm;
    let step = 0;
    const master = ac.createGain(); master.gain.value = 0.35; master.connect(ac.destination);
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 500;
    const padG = ac.createGain(); padG.gain.value = 0.15; f.connect(padG); padG.connect(master);
    const pad = ac.createOscillator(); pad.type = "sawtooth"; pad.frequency.value = 110; pad.connect(f); pad.start();
    const pad2 = ac.createOscillator(); pad2.type = "sawtooth"; pad2.frequency.value = 164.8; pad2.connect(f); pad2.start();
    nodes = [pad, pad2, master];
    timer = setInterval(() => {
      if (!ac) return;
      const tm = ac.currentTime;
      const k = ac.createOscillator(), kg = ac.createGain();
      k.frequency.setValueAtTime(150, tm); k.frequency.exponentialRampToValueAtTime(40, tm + 0.12);
      kg.gain.setValueAtTime(0.9, tm); kg.gain.exponentialRampToValueAtTime(0.001, tm + 0.25);
      k.connect(kg); kg.connect(master); k.start(tm); k.stop(tm + 0.3);
      if (step % 2 === 1) {
        const b = ac.createBuffer(1, ac.sampleRate * 0.05, ac.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const h = ac.createBufferSource(); h.buffer = b;
        const hg = ac.createGain(); hg.gain.value = 0.15;
        const hf = ac.createBiquadFilter(); hf.type = "highpass"; hf.frequency.value = 6000;
        h.connect(hf); hf.connect(hg); hg.connect(master); h.start(tm);
      }
      if (step % 4 === 0) {
        const m = ac.createOscillator(), mg = ac.createGain();
        m.type = "triangle"; m.frequency.value = motif[(step / 4) % motif.length];
        mg.gain.setValueAtTime(0.2, tm); mg.gain.exponentialRampToValueAtTime(0.001, tm + beat * 1.5);
        m.connect(mg); mg.connect(master); m.start(tm); m.stop(tm + beat * 2);
      }
      step++;
    }, beat * 1000);
  } catch {}
}

export function stopSynth() {
  if (timer) clearInterval(timer);
  timer = null;
  nodes.forEach((x) => { try { (x as OscillatorNode).stop ? (x as OscillatorNode).stop() : x.disconnect(); } catch {} });
  nodes = [];
}
