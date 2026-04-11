import { compile } from './compiler';
import { computeDedupHash } from '../dispatch/dedup';
import type { NotificationTemplate } from '@prisma/client';

export interface RenderedNotification {
  title: string;
  body: string;
  data: Record<string, unknown>;
  dedupHash: string;
}

export type TemplateLike = Pick<NotificationTemplate, 'name' | 'subject' | 'body' | 'variables'>;

/**
 * Render a template with the given tokens.
 *
 * Variable allowlist (if set on the template) is enforced — only listed
 * variables are passed to handlebars AND are written into the persisted
 * Notification.data payload. This prevents callers from accidentally
 * leaking sensitive fields (that weren't declared in `sensitiveFields` for
 * masking) into the in-app row and push payload.
 *
 * If a template has no allowlist, all tokens are passed through (fallback
 * for ad-hoc dispatches and legacy callers).
 */
export function renderTemplate(
  template: TemplateLike,
  tokens: Record<string, unknown>,
): RenderedNotification {
  const allowlist = Array.isArray(template.variables) ? (template.variables as string[]) : [];
  const safeTokens: Record<string, unknown> =
    allowlist.length > 0
      ? Object.fromEntries(allowlist.map((k) => [k, tokens[k] ?? '']))
      : { ...tokens };

  // Normalize legacy single-brace `{var}` to Handlebars double-brace `{{var}}`.
  // The old company-defaults seeder used single braces; Handlebars ignores them.
  // This regex converts `{word}` → `{{word}}` but skips already-doubled `{{word}}`.
  const normalize = (s: string) =>
    s.replace(/(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})/g, '{{$1}}');

  const title = template.subject ? compile(normalize(template.subject))(safeTokens) : template.name;
  const body = compile(normalize(template.body))(safeTokens);

  // data payload honors the allowlist — sensitive fields not listed in the
  // template variables never make it into the Notification row or push data.
  const data = { ...safeTokens };

  return {
    title,
    body,
    data,
    dedupHash: computeDedupHash({ title, body, data }),
  };
}
