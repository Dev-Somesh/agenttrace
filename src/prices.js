/**
 * Approximate USD per million tokens, by model family.
 *
 * These are a local table you maintain — nothing is fetched. Edit the numbers
 * to match what you actually pay. They are not a quote, and they will drift.
 *
 * Matching is by prefix, longest first: "claude-sonnet-4" wins over "claude".
 */
export const PRICES = {
  "claude-opus-4": { input: 15, output: 75 },
  "claude-opus": { input: 15, output: 75 },
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-sonnet": { input: 3, output: 15 },
  "claude-haiku": { input: 0.8, output: 4 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o": { input: 2.5, output: 10 },
  "o3": { input: 2, output: 8 },
  "o4-mini": { input: 1.1, output: 4.4 },
};

export function priceFor(model) {
  if (!model || typeof model !== "string") return null;
  const id = model.toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const [key, rate] of Object.entries(PRICES)) {
    if (id.includes(key) && key.length > bestLen) {
      best = rate;
      bestLen = key.length;
    }
  }
  return best;
}

/**
 * USD for a run. `tokens` is consumed (input + output + cache creation);
 * cache creation is priced as input because that is the closest figure we
 * have without a separate field.
 *
 * Returns null when the model is unknown rather than inventing a rate.
 */
export function estimateCostUsd(tokens, outputTokens, model) {
  const rate = priceFor(model);
  if (!rate) return null;
  const output = outputTokens || 0;
  const input = Math.max(0, (tokens || 0) - output);
  return (input * rate.input + output * rate.output) / 1_000_000;
}

export function sumCostUsd(runs) {
  let total = 0;
  let known = 0;
  for (const r of runs) {
    const n = r.costUsd ?? estimateCostUsd(r.tokens, r.outputTokens, r.model);
    if (n == null) continue;
    total += n;
    known++;
  }
  return known ? total : null;
}
