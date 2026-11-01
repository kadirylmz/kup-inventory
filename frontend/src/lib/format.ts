export interface NumberFormatConfig {
  number_decimals: number
  trim_trailing_zeros: boolean
  code_padding_digits: number
  code_prefix: string
}

const STORAGE_KEY = 'kup_format_settings'

export const DEFAULT_FORMAT_CONFIG: NumberFormatConfig = {
  number_decimals: 0,
  trim_trailing_zeros: true,
  code_padding_digits: 2,
  code_prefix: 'KUP',
}

export function getFormatConfig(): NumberFormatConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_FORMAT_CONFIG
    return { ...DEFAULT_FORMAT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_FORMAT_CONFIG
  }
}

export function saveFormatConfigLocal(cfg: Partial<NumberFormatConfig>) {
  try {
    const merged = { ...getFormatConfig(), ...cfg }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch {
    // ignore
  }
}

/**
 * Fiyat ve para tutarlarını kullanıcının Ayarlar'da seçtiği basamak/sıfır tercihine göre biçimlendirir.
 * Örn: 9500.00 -> trim_trailing_zeros açıksa "9.500", kuruş varsa "9.500,50"
 */
export function fmtMoney(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0'
  const num = typeof val === 'number' ? val : Number(val)
  if (Number.isNaN(num)) return '0'

  const cfg = getFormatConfig()
  const maxDec = Math.max(0, Math.min(4, cfg.number_decimals ?? 0))
  const isWhole = Math.abs(num - Math.round(num)) < 0.0001

  if (cfg.trim_trailing_zeros && isWhole) {
    return new Intl.NumberFormat('tr-TR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num)
  }

  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: cfg.trim_trailing_zeros ? 0 : maxDec,
    maximumFractionDigits: Math.max(maxDec, 2),
  }).format(num)
}

/**
 * Adet / miktar değerlerindeki gereksiz ".000" sıfırlarını temizler (Örn: "10.000" -> "10", "2.500" -> "2,5").
 */
export function fmtQty(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0'
  const num = typeof val === 'number' ? val : Number(val)
  if (Number.isNaN(num)) return '0'
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Form inputlarına sayı doldururken sondaki gereksiz ".00" veya ".000" sıfırlarını temizler.
 */
export function cleanNumInput(val: string | number | null | undefined): string {
  if (val === null || val === undefined || val === '') return ''
  const num = Number(val)
  if (Number.isNaN(num)) return String(val)
  return String(num)
}
