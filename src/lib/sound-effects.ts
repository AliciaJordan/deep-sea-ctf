type SoundEffect = 'sonar' | 'correct' | 'incorrect'

type Tone = {
  frequency: number
  delay: number
  duration: number
  volume: number
  wave: OscillatorType
}

const effects: Record<SoundEffect, Tone[]> = {
  sonar: [
    { frequency: 560, delay: 0, duration: 0.16, volume: 0.055, wave: 'sine' },
    { frequency: 840, delay: 0.2, duration: 0.22, volume: 0.035, wave: 'sine' },
  ],
  correct: [
    { frequency: 660, delay: 0, duration: 0.12, volume: 0.045, wave: 'sine' },
    { frequency: 880, delay: 0.13, duration: 0.18, volume: 0.045, wave: 'sine' },
  ],
  incorrect: [
    { frequency: 240, delay: 0, duration: 0.14, volume: 0.04, wave: 'triangle' },
    { frequency: 190, delay: 0.16, duration: 0.18, volume: 0.035, wave: 'triangle' },
  ],
}

let soundEnabled = true
let audioContext: AudioContext | undefined

export function setSoundEffectsEnabled(enabled: boolean): void {
  soundEnabled = enabled
}

export function playSoundEffect(effect: SoundEffect): void {
  if (!soundEnabled || typeof window === 'undefined' || !window.AudioContext) return

  try {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new window.AudioContext()
    }
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch((error: unknown) => {
        console.error('Unable to resume audio for sound effects.', error)
      })
    }

    const now = audioContext.currentTime
    for (const tone of effects[effect]) {
      const start = now + tone.delay
      const oscillator = audioContext.createOscillator()
      const envelope = audioContext.createGain()
      oscillator.type = tone.wave
      oscillator.frequency.setValueAtTime(tone.frequency, start)
      envelope.gain.setValueAtTime(0.0001, start)
      envelope.gain.exponentialRampToValueAtTime(tone.volume, start + 0.015)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration)
      oscillator.connect(envelope)
      envelope.connect(audioContext.destination)
      oscillator.start(start)
      oscillator.stop(start + tone.duration)
    }
  } catch (error) {
    console.error('Unable to play a sound effect.', error)
  }
}
