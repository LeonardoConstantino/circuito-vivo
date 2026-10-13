/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class BiopunkAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private sequencerActive: boolean = false;
  private nextBeatTime: number = 0;
  private bpm: number = 60;
  private beatCount: number = 0;
  
  // Audio Nodes
  private masterGain: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private lfo: OscillatorNode | null = null;
  private schedulerIntervalId: any = null;

  constructor() {
    // Mute by default on some platforms, let user toggle, or default active but respect browsers
  }

  public init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
      
      this.startDrone();
      this.startSequencer();
    } catch (e) {
      console.warn("Web Audio API failed to initialize:", e);
    }
  }

  public setMute(muted: boolean) {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      // Smooth fade to avoid pops
      this.masterGain.gain.setTargetAtTime(muted ? 0.0 : 0.25, this.ctx.currentTime, 0.1);
    }
  }

  public toggleMute(): boolean {
    this.setMute(!this.isMuted);
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public updateBPM(nodesCollected: number, totalNodes: number) {
    if (totalNodes <= 0) return;
    const progress = nodesCollected / totalNodes;
    // Formula from GDD: 60 to 140 BPM
    this.bpm = 60 + progress * 80;
  }

  private startDrone() {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Organic breathing drone
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.setValueAtTime(0.12, now);

    // Filter to keep it deep and bio-cybernetic
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(140, now);

    // Oscillator 1 - Deep drone A1 (55Hz)
    this.droneOsc1 = this.ctx.createOscillator();
    this.droneOsc1.type = 'sine';
    this.droneOsc1.frequency.setValueAtTime(55.0, now);

    // Oscillator 2 - Subtle detune Bb1 (58Hz) for fat organic chorusing
    this.droneOsc2 = this.ctx.createOscillator();
    this.droneOsc2.type = 'sawtooth';
    this.droneOsc2.frequency.setValueAtTime(58.2, now);

    // LFO to modulate filter to sound like "breathing tissue"
    this.lfo = this.ctx.createOscillator();
    this.lfo.frequency.setValueAtTime(0.25, now); // 4 seconds cycle
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(40, now); // sway filter between 100Hz and 180Hz

    // Connections
    this.lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    this.droneOsc1.connect(filter);
    this.droneOsc2.connect(filter);
    filter.connect(this.droneGain);
    this.droneGain.connect(this.masterGain);

    // Start oscillators
    this.droneOsc1.start(now);
    this.droneOsc2.start(now);
    this.lfo.start(now);
  }

  private startSequencer() {
    if (!this.ctx || this.sequencerActive) return;
    this.sequencerActive = true;
    this.nextBeatTime = this.ctx.currentTime + 0.1;
    this.beatCount = 0;

    // Simple scheduling loop
    this.schedulerIntervalId = setInterval(() => {
      this.scheduler();
    }, 25);
  }

  private scheduler() {
    if (!this.ctx || this.isMuted) return;
    const scheduleAheadTime = 0.1; // seconds
    while (this.nextBeatTime < this.ctx.currentTime + scheduleAheadTime) {
      this.scheduleBeat(this.beatCount, this.nextBeatTime);
      this.advanceBeat();
    }
  }

  private advanceBeat() {
    // Determine beat length in seconds based on current BPM
    const beatLength = 60.0 / this.bpm;
    // We run the sequencer at 8th notes (half-beats)
    const stepLength = beatLength / 2;
    this.nextBeatTime += stepLength;
    this.beatCount = (this.beatCount + 1) % 8; // 8-step sequencer
  }

  private scheduleBeat(step: number, time: number) {
    if (!this.ctx || !this.masterGain) return;

    // 1. Biological Kick Drum on step 0 and 4 (beats 1 and 3)
    if (step === 0 || step === 4) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, time);
      // Sweeping down frequency fast to simulate a thumping heartbeat kick
      osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);

      gain.gain.setValueAtTime(0.4, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.16);
    }

    // 2. High-freq synaptical heartbeat pulse (clicky tick) on offbeats (steps 2, 6)
    if (step === 2 || step === 6) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800, time);
      osc.frequency.exponentialRampToValueAtTime(300, time + 0.04);

      gain.gain.setValueAtTime(0.05, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.06);
    }

    // 3. Subtle neural sync melodic blip on steps 3 and 7 (syncopated)
    if (step === 3 || step === 7) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'sine';
      // Pitch goes up slightly as game progresses
      const baseFreq = 220 * (this.bpm / 60); // Dynamic harmonic pitches!
      osc.frequency.setValueAtTime(baseFreq, time);

      gain.gain.setValueAtTime(0.04, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.11);
    }
  }

  // SFX: Collect green synapse node / RNA golden particle
  public playCollect() {
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1174.66, now); // D6
    osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.15); // A6

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.17);
    osc2.stop(now + 0.17);
  }

  // SFX: Jump (smooth rising pitch electronic swoosh)
  public playJump() {
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(261.63, now); // C4
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.22); // G5

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.24);
  }

  // SFX: Crash / Fail (harsh industrial down-sweep crash)
  public playFail() {
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const oscNoise = this.ctx.createOscillator();
    const oscSweeper = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Red cell cancer invasion noise
    oscNoise.type = 'sawtooth';
    oscNoise.frequency.setValueAtTime(180, now);
    oscNoise.frequency.linearRampToValueAtTime(30, now + 0.5);

    oscSweeper.type = 'triangle';
    oscSweeper.frequency.setValueAtTime(120, now);
    oscSweeper.frequency.exponentialRampToValueAtTime(10, now + 0.4);

    // Apply distortion/crushing effect by boosting gain into filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.exponentialRampToValueAtTime(50, now + 0.5);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    oscNoise.connect(filter);
    oscSweeper.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    oscNoise.start(now);
    oscSweeper.start(now);
    oscNoise.stop(now + 0.6);
    oscSweeper.stop(now + 0.6);
  }

  // SFX: Victory (Major chord arpeggio rise of synaptic resonance)
  public playWin() {
    if (!this.ctx || this.isMuted || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C Major arpeggio
    
    notes.forEach((freq, idx) => {
      const triggerTime = now + idx * 0.06;
      const osc = this.ctx!.createOscillator();
      const oscTriangle = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, triggerTime);

      oscTriangle.type = 'triangle';
      oscTriangle.frequency.setValueAtTime(freq * 1.005, triggerTime); // fat chorusing

      gain.gain.setValueAtTime(0.12, triggerTime);
      gain.gain.exponentialRampToValueAtTime(0.001, triggerTime + 0.3);

      osc.connect(gain);
      oscTriangle.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(triggerTime);
      oscTriangle.start(triggerTime);
      osc.stop(triggerTime + 0.35);
      oscTriangle.stop(triggerTime + 0.35);
    });
  }

  public shutdown() {
    if (this.schedulerIntervalId) {
      clearInterval(this.schedulerIntervalId);
      this.schedulerIntervalId = null;
    }
    this.sequencerActive = false;
    
    if (this.droneOsc1) {
      try { this.droneOsc1.stop(); } catch(e) {}
      this.droneOsc1 = null;
    }
    if (this.droneOsc2) {
      try { this.droneOsc2.stop(); } catch(e) {}
      this.droneOsc2 = null;
    }
    if (this.lfo) {
      try { this.lfo.stop(); } catch(e) {}
      this.lfo = null;
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
