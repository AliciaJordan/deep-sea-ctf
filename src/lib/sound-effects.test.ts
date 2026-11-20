import { afterEach, describe, expect, it, vi } from 'vitest'
import { playSoundEffect, setSoundEffectsEnabled } from './sound-effects'

class FakeAudioContext {
  static instances: FakeAudioContext[] = []

  currentTime = 1
  destination = {}
  state = 'running'
  oscillators: Array<{
    frequency: { setValueAtTime: ReturnType<typeof vi.fn> }
    connect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }> = []

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createOscillator() {
    const oscillator = {
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      type: 'sine',
    }
    this.oscillators.push(oscillator)
    return oscillator
  }

  createGain() {
    return {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }
  }
}

describe('sound effects', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setSoundEffectsEnabled(true)
  })

  it('respects mute and schedules sonar and submission tones when enabled', () => {
    FakeAudioContext.instances = []
    vi.stubGlobal('window', { AudioContext: FakeAudioContext })

    setSoundEffectsEnabled(false)
    playSoundEffect('sonar')
    expect(FakeAudioContext.instances).toHaveLength(0)

    setSoundEffectsEnabled(true)
    playSoundEffect('sonar')
    playSoundEffect('correct')
    playSoundEffect('incorrect')

    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(FakeAudioContext.instances[0].oscillators).toHaveLength(6)
  })
})
