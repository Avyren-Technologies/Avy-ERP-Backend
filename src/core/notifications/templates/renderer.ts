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
 * Render a template with the given tokens. Variable allowlist (if set on
 * the template) is enforced — only listed variables are passed to handlebars.
 * Unknown variables render as empty strings.
 */
export function renderTemplate(
  template: TemplateLike,
  tokens: Record<string, unknown>,
): RenderedNotification {
  const allowlist = Array.isArray(template.variables) ? (template.variables as string[]) : [];
  const safeTokens = allowlist.length > 0
    ? Object.fromEntries(allowlist.map((k) => [k, tokens[k] ?? '']))
    : tokens;

  const title = template.subject ? compile(template.subject)(safeTokens) : template.name;
  const body = compile(template.body)(safeTokens);
  const data = { ...tokens };

  return {
    title,
    body,
    data,
    dedupHash: computeDedupHash({ title, body, data }),
  };
}
