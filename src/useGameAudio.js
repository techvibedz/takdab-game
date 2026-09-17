import { useEffect, useState } from 'react'

// Original synthesized effects: no downloads, external service or audio asset licensing.
export function createGameAudio(Context) {
  const context = new Context(), master = context.createGain()
  master.gain.value = .22; master.connect(context.destination)
  const noise = context.createBuffer(1, context.sampleRate * .3, context.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const burst = (time, duration, gain, frequency, tonal = false) => {
    const source = tonal ? context.createOscillator() : context.createBufferSource()
    if (tonal) { source.type = 'sine'; source.frequency.setValueAtTime(frequency, time); source.frequency.exponentialRampToValueAtTime(frequency * .7, time + duration) }
    else source.buffer = noise
    const filter = context.createBiquadFilter(), envelope = context.createGain()
    filter.type = tonal ? 'lowpass' : 'bandpass'; filter.frequency.value = frequency; filter.Q.value = .7
    envelope.gain.setValueAtTime(.0001, time)
    envelope.gain.exponentialRampToValueAtTime(gain, time + .004)
    envelope.gain.exponentialRampToValueAtTime(.0001, time + duration)
    source.connect(filter); filter.connect(envelope); envelope.connect(master)
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect() }
    source.start(time); source.stop(time + duration + .01)
  }
  return {
    context,
    play(name) {
      if (context.state !== 'running') return
      const now = context.currentTime
      if (name === 'shuffle') for (let i = 0; i < 10; i++) burst(now + i * .045, .05, .4, 1800 + i % 3 * 700)
      if (name === 'deal') burst(now, .055, .3, 2600)
      if (name === 'slide' || name === 'collect') burst(now, .23, .35, 1700)
      if (name === 'place') { burst(now, .075, .65, 850); burst(now, .08, .45, 160, true) }
      if (name === 'select') burst(now, .035, .18, 2100)
      if (name === 'cheat') { burst(now, .16, .65, 480, true); burst(now + .12, .24, .65, 310, true) }
      if (name === 'win') [440, 554, 660, 880].forEach((note, i) => burst(now + i * .12, .25, .4, note, true))
    },
    close: () => context.close(),
  }
}

let sharedEngine = null
let sharedEnabled = true

function engine() {
  const Context = window.AudioContext || window.webkitAudioContext
  if (!Context || !sharedEnabled) return null
  if (!sharedEngine || sharedEngine.context.state === 'closed') sharedEngine = createGameAudio(Context)
  return sharedEngine
}

export function useAudioUnlock() {
  useEffect(() => {
    const unlock = () => engine()?.context.resume().catch(() => {})
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }, [])
}

export function useGameAudio(game) {
  const [enabled, setEnabled] = useState(sharedEnabled)
  const play = name => {
    const audio = engine()
    if (!audio) return
    if (audio.context.state === 'running') audio.play(name)
    else audio.context.resume().then(() => audio.play(name)).catch(() => {})
  }
  useEffect(() => {
    if (game.phase === 'dealing') play('shuffle')
    if (game.phase === 'reveal') play('cheat')
    if (game.phase === 'collect') play('collect')
    if (game.phase === 'finished') play('win')
  }, [game.phase])
  useEffect(() => { if (game.selectedCards.length) play('select') }, [game.selectedCards])
  return { play, enabled, toggle() {
    sharedEnabled = !sharedEnabled
    setEnabled(sharedEnabled)
    if (sharedEnabled) engine()?.context.resume().catch(() => {})
    else sharedEngine?.context.suspend().catch(() => {})
  } }
}
