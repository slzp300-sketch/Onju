import { createLlmGateway, type LlmRequest } from './llmGateway.ts'
import { createOpenAiResponsesAdapter } from './openAiResponsesAdapter.ts'
import { createAnthropicMessagesAdapter } from './anthropicMessagesAdapter.ts'
import { anthropicPricing } from './anthropicPricing.ts'

/** Server configuration only: visitors cannot select a provider or submit API keys. */
export function createCoachProvider(env: (name: string) => string | undefined, openAiDefault: string,
  timeoutMs?: number | ((request: LlmRequest) => number)) {
  const provider = env('ONJU_AGENT_PROVIDER') || 'anthropic'
  if (provider !== 'openai' && provider !== 'anthropic') throw new Error('invalid_agent_provider')
  if (provider === 'anthropic') {
    const model = env('ONJU_CLAUDE_MODEL') || 'claude-sonnet-4-6'
    if (!anthropicPricing(model)) throw new Error('ai_price_unavailable')
    if (model !== 'claude-sonnet-4-6') throw new Error('anthropic_unsupported_coaching_model')
    const gateway = createLlmGateway(createAnthropicMessagesAdapter({ apiKey: env('ANTHROPIC_API_KEY') || '', timeoutMs }))
    return { gateway, model, fastModel: model, fallbackModel: model }
  }
  const model = env('ONJU_AGENT_MODEL') || openAiDefault
  const gateway = createLlmGateway(createOpenAiResponsesAdapter({ apiKey: env('OPENAI_API_KEY') || '', timeoutMs }))
  return { gateway, model, fastModel: env('ONJU_AGENT_FAST_MODEL') || model, fallbackModel: env('ONJU_AGENT_FALLBACK_MODEL') || model }
}
