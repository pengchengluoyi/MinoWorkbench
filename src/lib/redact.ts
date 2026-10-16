const secretKey = /^(?:password|passwd|passphrase|secret|client_secret|api_key|access_token|refresh_token|authorization|cookie|set-cookie|otp_code|verification_code)$/i
export function redactSensitive(value: unknown): unknown {
 if (typeof value === 'string') return value.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [已隐藏]').replace(/((?:password|passwd|api_key|access_token|refresh_token|secret)\s*[=:]\s*["']?)[^\s,"'}]+/gi, '$1[已隐藏]')
 if (Array.isArray(value)) return value.map(redactSensitive)
 if (value && typeof value === 'object') { const row = value as Record<string, unknown>; const sensitive = row.sensitive === true; const safe = new Set(['seq','type','turn','phase','timestamp','created_at','step_ref','case_id','session_id','call_id','attempt_id','capture_id','sensitive','status']); return Object.fromEntries(Object.entries(row).map(([key, nested]) => [key, secretKey.test(key) || (sensitive && !safe.has(key)) ? '[敏感值已隐藏]' : redactSensitive(nested)])) }
 return value
}
export function redactedText(value: unknown) { const safe = redactSensitive(value); return typeof safe === 'string' ? safe : JSON.stringify(safe ?? null, null, 2) }
