// Verified 2026-10-23: https://platform.claude.com/docs/en/about-claude/pricing
// Direct Anthropic API, global routing, 5-minute cache writes; no paid server tools.
export const ANTHROPIC_PRICING = {
  'claude-sonnet-5-5': { input: 2, cached: .1, write: 2.5, output: 10, max: 128000 },
  'claude-opus-5-5': { input: 4, cached: .2, write: 5, output: 20, max: 128000 },
  'claude-sonnet-4-6': { input: 3, cached: .3, write: 3.75, output: 15, max: 64000 },
} as const

export function anthropicPricing(model: unknown) {
  return typeof model === 'string' && Object.hasOwn(ANTHROPIC_PRICING, model)
    ? ANTHROPIC_PRICING[model as keyof typeof ANTHROPIC_PRICING] : undefined
}
