// Synthesized sounds (no audio files): pen strokes follow the drawn line exactly.

import { setting } from "./settings";

class Sound {
	private context: AudioContext | null = null;
	private noise: AudioBuffer | null = null;
	private active = new Set<AudioScheduledSourceNode>();
	private readonly preference = setting("mortal-jan.sound");

	get enabled(): boolean {
		return this.preference.enabled;
	}

	setEnabled(enabled: boolean): void {
		this.preference.set(enabled);
		if (!enabled) this.stop();
	}

	/** Create/resume the audio context. Must run inside a user gesture on mobile. */
	unlock(): void {
		if (!this.enabled) return;
		this.context ??= new AudioContext();
		if (this.context.state === "suspended") void this.context.resume();
		if (!this.noise) {
			const length = this.context.sampleRate * 2;
			this.noise = this.context.createBuffer(1, length, this.context.sampleRate);
			const data = this.noise.getChannelData(0);
			for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
		}
	}

	private ready(): AudioContext | null {
		return this.enabled && this.context && this.noise ? this.context : null;
	}

	private track(node: AudioScheduledSourceNode): void {
		this.active.add(node);
		node.onended = () => this.active.delete(node);
	}

	private noiseSource(context: AudioContext): AudioBufferSourceNode {
		const source = context.createBufferSource();
		source.buffer = this.noise;
		source.loop = true;
		source.playbackRate.value = 0.9 + Math.random() * 0.2;
		this.track(source);
		return source;
	}

	/** Felt-tip pen on paper for `ms` milliseconds. */
	pen(ms: number): void {
		const context = this.ready();
		if (!context) return;
		const now = context.currentTime;
		const seconds = Math.max(ms, 60) / 1000;

		const source = this.noiseSource(context);
		const highpass = new BiquadFilterNode(context, { type: "highpass", frequency: 1400 });
		const band = new BiquadFilterNode(context, { type: "bandpass", frequency: 3600, Q: 0.8 });
		const gain = context.createGain();
		// Paper grain: an irregular level that the pen drags over.
		const grain = new Float32Array(Math.max(8, Math.round(seconds * 70)));
		for (let i = 0; i < grain.length; i++) grain[i] = 0.16 + Math.random() * 0.14;
		gain.gain.setValueAtTime(0, now);
		gain.gain.linearRampToValueAtTime(0.22, now + 0.015);
		gain.gain.setValueCurveAtTime(grain, now + 0.02, Math.max(0.03, seconds - 0.06));
		gain.gain.linearRampToValueAtTime(0, now + seconds + 0.04);
		source.connect(highpass).connect(band).connect(gain).connect(context.destination);
		source.start(now, Math.random());
		source.stop(now + seconds + 0.06);
		this.tap(0.12);
	}

	/** Pen tip touching the paper, or a tile being picked. */
	tap(level = 0.25, frequency = 2400): void {
		const context = this.ready();
		if (!context) return;
		const now = context.currentTime;
		const source = this.noiseSource(context);
		const band = new BiquadFilterNode(context, { type: "bandpass", frequency, Q: 2.5 });
		const gain = context.createGain();
		gain.gain.setValueAtTime(level, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
		source.connect(band).connect(gain).connect(context.destination);
		source.start(now);
		source.stop(now + 0.05);
	}

	/** A seal pressed onto paper. */
	stamp(): void {
		const context = this.ready();
		if (!context) return;
		const now = context.currentTime;
		const osc = context.createOscillator();
		osc.frequency.setValueAtTime(140, now);
		osc.frequency.exponentialRampToValueAtTime(48, now + 0.16);
		const gain = context.createGain();
		gain.gain.setValueAtTime(0.55, now);
		gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
		osc.connect(gain).connect(context.destination);
		this.track(osc);
		osc.start(now);
		osc.stop(now + 0.25);
		this.tap(0.35, 900);
	}

	stop(): void {
		for (const node of this.active) {
			try {
				node.stop();
			} catch {
				// already stopped
			}
		}
		this.active.clear();
	}
}

export const sound = new Sound();
