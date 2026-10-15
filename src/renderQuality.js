// fps caps the render loop (null = display rate). Fewer pixels and frames is what keeps phones cool:
// a phone screen at dpr 2.25 drew ~5x the pixels of dpr 1 every frame, with a shadow pass on top.
export const QUALITY_PRESETS = {
  performance: { label: 'أداء', detail: 'أخف على الهاتف وأبرد', dpr: [0.7, 1], shadows: false, antialias: false, fps: 30, textureSize: 256, anisotropy: 1 },
  balanced: { label: 'متوازنة', detail: 'صورة جيدة وأداء ثابت', dpr: [1, 1.25], shadows: false, antialias: true, fps: 60, textureSize: 384, anisotropy: 2 },
  high: { label: 'عالية', detail: 'ظلال وأوضح تفاصيل', dpr: [1, 2], shadows: 'percentage', antialias: true, fps: null, textureSize: 512, anisotropy: 8 },
}

// First visit: pick for the device instead of defaulting everyone (phones included) to "high".
export function defaultQuality(nav = globalThis.navigator, screen = globalThis.screen) {
  const touch = nav?.maxTouchPoints > 0 || /Android|iPhone|iPad|Mobile/i.test(nav?.userAgent ?? '')
  const memory = nav?.deviceMemory ?? 8, cores = nav?.hardwareConcurrency ?? 8
  if (memory <= 4 || cores <= 4) return 'performance'
  if (touch || Math.max(screen?.width ?? 1920, screen?.height ?? 1080) < 1000) return 'balanced'
  return 'high'
}

export const normalizeQuality = value => QUALITY_PRESETS[value] ? value : defaultQuality()
