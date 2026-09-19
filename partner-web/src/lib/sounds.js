/**
 * Order alert sound system — uses Web Audio API to synthesize
 * a two-tone chime. No audio file needed, works offline.
 *
 * The shop owner needs to hear new orders even when not looking
 * at the screen — this is the single most important UX feature.
 */

let audioCtx = null;
let muted    = false;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  // Resume if suspended (autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play a two-tone ascending chime: ding-dong.
 * Sounds similar to a shop doorbell.
 */
export function playOrderAlert() {
  if (muted) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // First tone — high C (1047 Hz)
  const osc1  = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.connect(gain1);
  gain1.connect(ctx.destination);
  osc1.type              = 'sine';
  osc1.frequency.value   = 1047;
  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.35, now + 0.05);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  osc1.start(now);
  osc1.stop(now + 0.65);

  // Second tone — G (784 Hz), delayed
  const osc2  = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.connect(gain2);
  gain2.connect(ctx.destination);
  osc2.type            = 'sine';
  osc2.frequency.value = 784;
  gain2.gain.setValueAtTime(0, now + 0.3);
  gain2.gain.linearRampToValueAtTime(0.3, now + 0.35);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
  osc2.start(now + 0.3);
  osc2.stop(now + 0.95);
}

/** Play 3 times with small gap — for "very urgent" new order */
export function playOrderAlertUrgent() {
  if (muted) return;
  playOrderAlert();
  setTimeout(playOrderAlert, 1000);
  setTimeout(playOrderAlert, 2000);
}

/**
 * Must be called once on user interaction (click/touch) to
 * unlock the audio context per browser autoplay policy.
 */
export function unlockAudio() {
  getAudioContext();
}

export function setMuted(val) { muted = val; }
export function getMuted()    { return muted; }

/** Update browser tab title with pending order count badge */
export function setTitleBadge(count) {
  if (typeof window === 'undefined') return;
  const base = 'TezzNirmaan';
  document.title = count > 0 ? `(${count}) New Order${count > 1 ? 's' : ''} — ${base}` : base;
}
