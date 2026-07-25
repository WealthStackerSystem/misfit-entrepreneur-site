import Anthropic from '@anthropic-ai/sdk';

export function getAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  return new Anthropic({ apiKey: key });
}

/**
 * Replace {{variable}} tokens in a prompt template.
 * Missing keys are replaced with an empty string rather than
 * left as a literal {{token}} in the prompt.
 */
export function fillTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return vars[key] !== undefined && vars[key] !== null ? vars[key] : '';
  });
}

/**
 * Models sometimes wrap JSON in markdown fences despite instructions.
 * Strip them before parsing.
 */
export function stripFences(text: string): string {
  let out = text.trim();
  if (out.startsWith('```')) {
    out = out.replace(/^```[a-zA-Z]*\s*/, '');
    out = out.replace(/```\s*$/, '');
  }
  return out.trim();
}
