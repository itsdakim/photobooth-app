let ctx: AudioContext | null = null

function getContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/** A short percussive click shaped with a fast decay envelope. */
function click(context: AudioContext, time: number, freq: number, duration: number, gain: number): void {
  const osc = context.createOscillator()
  const env = context.createGain()
  osc.type = 'square'
  osc.frequency.value = freq
  env.gain.setValueAtTime(gain, time)
  env.gain.exponentialRampToValueAtTime(0.001, time + duration)
  osc.connect(env)
  env.connect(context.destination)
  osc.start(time)
  osc.stop(time + duration)
}

/** Synthesized camera-shutter "clack" — two quick clicks, no audio asset needed. */
export function playShutterSound(): void {
  try {
    const context = getContext()
    if (context.state === 'suspended') context.resume()
    const now = context.currentTime
    click(context, now, 1400, 0.04, 0.25)
    click(context, now + 0.06, 900, 0.05, 0.2)
  } catch {
    // audio isn't critical to the capture flow
  }
}
