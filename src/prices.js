import fs from "node:fs";
import path from "node:path";

/**
 * Approximate USD per million tokens, by model family.
 *
 * These are a local table you maintain — nothing is fetched. Edit the numbers
 * to match what you actually pay. They are not a quote, and they will drift.
 *
 * Matching is by prefix, longest first: "claude-sonnet-4" wins over "claude".
 * Current models therefore need their own exact keys, or an older, shorter
 * prefix silently prices them — "claude-opus-5" once matched "claude-opus"
 * and reported three times its real rate.
 *
 * A model that is not listed reports no cost at all. That is deliberate: a
 * blank prompts someone to check, an invented rate does not.
 */
export const PRICES = {
  // Current families.
  "claude-fable-5": { input: 10, output: 50 },
  "claude-mythos-5": { input: 10, output: 50 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },

  // Superseded. Exact keys so they cannot shadow the entries above.
  "claude-opus-4-5": { input: 5, output: 25 },
  "claude-opus-4-1": { input: 15, output: 75 },
  "claude-opus-4-0": { input: 15, output: 75 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-sonnet-4": { input: 3, output: 15 },

  // Other families, for runners that record a model at all.
  "gpt-5.4": { input: 1.25, output: 10 },
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4o": { input: 2.5, output: 10 },
  "o3": { input: 2, output: 8 },
  "o4-mini": { input: 1.1, output: 4.4 },

  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
};

/**
 * Cache tokens are billed against the input rate at these multipliers.
 * Writing to the cache costs more than plain input; reading from it costs
 * far less — but it is not free, which is the mistake this replaces.
 */
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

/**
 * Rates the reader supplied, merged over the table above.
 *
 * The README tells you to edit `src/prices.js` to match what you pay. Under
 * `npx` that file lives in a node_modules cache, so the edit is thrown away on
 * the next run — the one documented modification of this tool did not survive.
 * A price block in `runlanes.json` beside the project does survive, and it
 * is the reader's own file rather than one inside the package.
 */
let overrides = {};

/** Everything in effect: shipped defaults with the reader's rates on top. */
export function effectivePrices() {
  return { ...PRICES, ...overrides };
}

export function setPriceOverrides(table) {
  overrides = table && typeof table === "object" ? table : {};
}

/**
 * Read a `prices` block from `<cwd>/runlanes.json`, if there is one.
 *
 * Returns any complaint rather than throwing. A malformed config that silently
 * did nothing would leave every figure quietly wrong with the console
 * reporting itself healthy, which is the failure this tool exists to catch —
 * so the caller surfaces the message alongside source errors.
 */
export function loadPriceOverrides(cwd) {
  const file = path.join(cwd || ".", "runlanes.json");
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { applied: 0, problem: null }; // no config is the normal case
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { applied: 0, problem: `runlanes.json is not valid JSON: ${err.message}` };
  }

  const table = parsed?.prices;
  if (table == null) return { applied: 0, problem: null };
  if (typeof table !== "object" || Array.isArray(table)) {
    return { applied: 0, problem: "runlanes.json: `prices` must be an object of model → rate" };
  }

  const good = {};
  const bad = [];
  for (const [key, rate] of Object.entries(table)) {
    if (rate && typeof rate.input === "number" && typeof rate.output === "number") {
      good[key.toLowerCase()] = { input: rate.input, output: rate.output };
    } else {
      bad.push(key);
    }
  }
  setPriceOverrides(good);
  return {
    applied: Object.keys(good).length,
    problem: bad.length
      ? `runlanes.json: ignored ${bad.join(", ")} — each needs numeric input and output`
      : null,
  };
}

export function priceFor(model) {
  if (!model || typeof model !== "string") return null;
  const id = model.toLowerCase();
  let best = null;
  let bestLen = 0;
  for (const [key, rate] of Object.entries(effectivePrices())) {
    if (id.includes(key) && key.length > bestLen) {
      best = rate;
      bestLen = key.length;
    }
  }
  return best;
}

/**
 * USD for a run.
 *
 * `tokens` is what runlanes reports as consumed: input + output + cache
 * creation, deliberately excluding cache reads, because cache reads re-report
 * the whole prompt every turn and summing them once put a session at 382% of
 * its token budget.
 *
 * Cost is a different question from that headline, and answering it with the
 * same number was wrong. Cache reads are billed — at a tenth of the input
 * rate, but on the majority of tokens in any long session — so pricing them
 * at zero understated real spend. Cache writes are billed above input rate,
 * not at it.
 *
 * So the four classes are priced separately here while the token headline
 * stays as it was. `cache` is optional: a source that does not record cache
 * tokens simply gets the old behaviour.
 *
 * Returns null when the model is unknown rather than inventing a rate.
 */
export function estimateCostUsd(tokens, outputTokens, model, cache = null) {
  const rate = priceFor(model);
  if (!rate) return null;

  const output = outputTokens || 0;
  const cacheWrite = Math.max(0, cache?.write || 0);
  const cacheRead = Math.max(0, cache?.read || 0);

  // `tokens` already contains cache writes; subtract them so they are not
  // charged twice, once at input rate and again at the write multiplier.
  const plainInput = Math.max(0, (tokens || 0) - output - cacheWrite);

  const usd =
    plainInput * rate.input +
    output * rate.output +
    cacheWrite * rate.input * CACHE_WRITE_MULTIPLIER +
    cacheRead * rate.input * CACHE_READ_MULTIPLIER;

  return usd / 1_000_000;
}

export function sumCostUsd(runs) {
  let total = 0;
  let known = 0;
  for (const r of runs) {
    // No usage recorded means no basis for a price. Charging $0 would make an
    // unmeasured run look free rather than unmeasured.
    if (r.usageRecorded === false) continue;
    const n =
      r.costUsd ??
      estimateCostUsd(r.tokens, r.outputTokens, r.model, {
        write: r.cacheWriteTokens,
        read: r.cacheReadTokens,
      });
    if (n == null) continue;
    total += n;
    known++;
  }
  return known ? total : null;
}
