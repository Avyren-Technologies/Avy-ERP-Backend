import Handlebars from 'handlebars';

const cache = new Map<string, HandlebarsTemplateDelegate>();

/**
 * Compile a handlebars template source and cache it in-memory.
 * Subsequent calls with the same source return the cached delegate.
 */
export function compile(source: string): HandlebarsTemplateDelegate {
  const cached = cache.get(source);
  if (cached) return cached;
  const compiled = Handlebars.compile(source, { noEscape: true, strict: false });
  cache.set(source, compiled);
  return compiled;
}

export function validateTemplate(source: string): { valid: boolean; error?: string } {
  try {
    Handlebars.compile(source, { strict: false });
    return { valid: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { valid: false, error };
  }
}

export function extractVariables(source: string): string[] {
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return Array.from(out);
}

export function clearCompilerCache(): void {
  cache.clear();
}
