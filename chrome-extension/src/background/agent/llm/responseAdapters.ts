/**
 * LLM response adapters: Convert provider-specific formats to OpenAI format
 * Follows: SRP (single responsibility), DIP (depend on abstractions)
 */

import { isLlamaResponse } from '@extension/shared';

/**
 * Represents OpenAI-compatible chat completion response format
 */
export interface OpenAIChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Base interface for provider-specific response adapters
 */
interface LLMProviderResponseAdapter {
  transform(): OpenAIChatCompletionResponse;
}

/**
 * Adapts Llama API response to OpenAI format
 * Handles type safety and null-checking for all fields
 */
export class LlamaResponseAdapter implements LLMProviderResponseAdapter {
  constructor(
    private response: unknown,
    private request: unknown,
  ) {}

  /**
   * Transform Llama response to OpenAI format
   * Throws if response structure is invalid
   */
  transform(): OpenAIChatCompletionResponse {
    if (!isLlamaResponse(this.response)) {
      throw new Error('Invalid Llama response structure: missing required fields (completion_message.content.text)');
    }

    return {
      id: this.extractId(),
      object: 'chat.completion',
      created: Date.now(),
      model: this.extractModelName(),
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: this.response.completion_message?.content?.text ?? '',
          },
          finish_reason: this.response.completion_message?.stop_reason ?? 'stop',
        },
      ],
      usage: this.extractMetrics(),
    };
  }

  /**
   * Extract response ID from Llama response
   */
  private extractId(): string {
    const id = (this.response as any).id;
    return typeof id === 'string' || typeof id === 'number' ? String(id) : 'llama-response';
  }

  /**
   * Extract model name from request metadata
   */
  private extractModelName(): string {
    if (!this.request || typeof this.request !== 'object') {
      return 'unknown';
    }

    const model = (this.request as any).model;
    return typeof model === 'string' || typeof model === 'number' ? String(model) : 'unknown';
  }

  /**
   * Extract token metrics from Llama response
   * Llama provides metrics array with named entries
   */
  private extractMetrics() {
    const metrics = (this.response as any).metrics;
    const metricsArray = Array.isArray(metrics) ? metrics : [];

    return {
      prompt_tokens: this.findMetricValue(metricsArray, 'num_prompt_tokens'),
      completion_tokens: this.findMetricValue(metricsArray, 'num_completion_tokens'),
      total_tokens: this.findMetricValue(metricsArray, 'num_total_tokens'),
    };
  }

  /**
   * Find specific metric value in metrics array
   * Returns 0 if metric not found
   */
  private findMetricValue(metrics: unknown[], metricName: string): number {
    if (!Array.isArray(metrics)) {
      return 0;
    }

    for (const item of metrics) {
      if (item && typeof item === 'object' && 'metric' in item && 'value' in item) {
        const typedItem = item as { metric: unknown; value: unknown };
        if (typedItem.metric === metricName && typeof typedItem.value === 'number') {
          return typedItem.value;
        }
      }
    }

    return 0;
  }
}

/**
 * Factory for creating response adapters based on provider
 * Can be extended to support more providers (Claude, Gemini, etc.)
 */
export class ResponseAdapterFactory {
  /**
   * Create appropriate adapter for given response
   * Uses type checking to determine provider
   *
   * @param response - Raw provider response
   * @param request - Request metadata (for context)
   * @returns Adapter instance or null if provider not recognized
   */
  static create(response: unknown, request: unknown): LLMProviderResponseAdapter | null {
    if (isLlamaResponse(response)) {
      return new LlamaResponseAdapter(response, request);
    }

    // Could add more adapters here for other providers
    // if (isClaude3Response(response)) {
    //   return new ClaudeResponseAdapter(response, request);
    // }

    return null;
  }
}
