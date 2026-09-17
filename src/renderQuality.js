export const QUALITY_PRESETS = {
  performance: { label: 'أداء', detail: 'أخف على الهاتف', dpr: [0.8, 1], shadows: false, textureSize: 256, anisotropy: 1 },
  balanced: { label: 'متوازنة', detail: 'صورة جيدة وأداء ثابت', dpr: [1, 1.5], shadows: 'percentage', textureSize: 384, anisotropy: 4 },
  high: { label: 'عالية', detail: 'أوضح بطاقات وشخصيات', dpr: [1.5, 2.25], shadows: 'percentage', textureSize: 512, anisotropy: 8 },
}

export const normalizeQuality = value => QUALITY_PRESETS[value] ? value : 'high'
