/**
 * Escape untrusted text for safe interpolation into HTML body text and double-quoted attributes.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strip characters that can break or inject SMTP/email headers (e.g. Subject).
 */
export function sanitizeEmailSubjectLine(text: string): string {
  return text.replace(/[\r\n\u0000]/g, ' ').trim();
}
