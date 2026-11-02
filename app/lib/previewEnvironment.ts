// Server-only gate. A query string or a public/client flag must never enable it.
export function recordPreviewEnabled() {
  return process.env.VERCEL_ENV === "preview" && process.env.RECORD_STORAGE_PREVIEW_ENABLED === "1";
}
