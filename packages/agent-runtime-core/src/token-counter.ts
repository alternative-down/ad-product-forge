import { getEncoding } from 'js-tiktoken';

let encoder: ReturnType<typeof getEncoding> | null = null;

function getEncoder() {
  if (!encoder) {
    encoder = getEncoding('cl100k_base');
  }
  return encoder;
}

export function countTokens(text: string): number {
  if (!text) return 0;
  
  const enc = getEncoder();
  const tokens = enc.encode(text);
  return tokens.length;
}

export function estimateTextUnits(text: string): number {
  return Math.max(1, countTokens(text));
}
