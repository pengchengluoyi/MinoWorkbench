import { getBaseUrl } from './config'

/** Screenshots belong to Nexus; a root-relative URL must not target the Workbench host. */
export function screenshotSource(raw: unknown): string {
  if (raw && typeof raw === 'object') {
    const bag = raw as Record<string, unknown>
    return screenshotSource(bag.url || bag.src || bag.thumb || bag.data || bag.base64 || bag.image_base64)
  }
  const text = String(raw || '').trim()
  if (!text || text.includes('(+')) return ''
  if (text.startsWith('data:image/')) return text.length > 64 ? text : ''
  // JPEG base64 also starts with '/', so identify image data before URL paths.
  if (text.startsWith('/9j/')) return `data:image/jpeg;base64,${text.replace(/\s/g, '')}`
  if (text.startsWith('iVBOR')) return `data:image/png;base64,${text.replace(/\s/g, '')}`
  if (text.startsWith('http://') || text.startsWith('https://')) return text
  if (text.startsWith('/') && !text.startsWith('//')) {
    const base = getBaseUrl()
    return base ? new URL(text, base).href : text
  }
  if (text.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(text.slice(0, 120))) {
    return `data:image/png;base64,${text.replace(/\s/g, '')}`
  }
  return ''
}
