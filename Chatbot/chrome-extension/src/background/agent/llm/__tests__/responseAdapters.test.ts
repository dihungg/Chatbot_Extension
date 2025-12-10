/**
 * Unit tests for response adapters
 * Tests Llama response transformation and factory pattern
 */

import { describe, expect, it } from 'vitest';
import { LlamaResponseAdapter, ResponseAdapterFactory, type OpenAIChatCompletionResponse } from '../responseAdapters';

describe('LlamaResponseAdapter', () => {
  describe('transform', () => {
    it('transforms valid Llama response to OpenAI format', () => {
      const llamaResponse = {
        id: 'llama-123',
        completion_message: {
          content: { text: 'Hello, world!' },
          stop_reason: 'stop',
        },
        metrics: [
          { metric: 'num_prompt_tokens', value: 50 },
          { metric: 'num_completion_tokens', value: 10 },
          { metric: 'num_total_tokens', value: 60 },
        ],
      };

      const adapter = new LlamaResponseAdapter(llamaResponse, { model: 'llama-2' });
      const result = adapter.transform();

      expect(result.id).toBe('llama-123');
      expect(result.object).toBe('chat.completion');
      expect(result.model).toBe('llama-2');
      expect(result.choices).toHaveLength(1);
      expect(result.choices[0].message.content).toBe('Hello, world!');
      expect(result.choices[0].message.role).toBe('assistant');
      expect(result.choices[0].finish_reason).toBe('stop');
      expect(result.usage.prompt_tokens).toBe(50);
      expect(result.usage.completion_tokens).toBe(10);
      expect(result.usage.total_tokens).toBe(60);
    });

    it('uses default stop_reason when missing', () => {
      const llamaResponse = {
        id: 'llama-123',
        completion_message: {
          content: { text: 'Hello' },
        },
        metrics: [],
      };

      const adapter = new LlamaResponseAdapter(llamaResponse, {});
      const result = adapter.transform();

      expect(result.choices[0].finish_reason).toBe('stop');
    });

    it('generates ID when missing from response', () => {
      const llamaResponse = {
        completion_message: {
          content: { text: 'Hello' },
        },
      };

      const adapter = new LlamaResponseAdapter(llamaResponse, {});
      const result = adapter.transform();

      expect(result.id).toBe('llama-response');
    });

    it('uses string ID from response', () => {
      const llamaResponse = {
        id: 'custom-id-123',
        completion_message: {
          content: { text: 'Hello' },
        },
      };

      const adapter = new LlamaResponseAdapter(llamaResponse, {});
      const result = adapter.transform();

      expect(result.id).toBe('custom-id-123');
    });

    it('converts numeric ID to string', () => {
      const llamaResponse = {
        id: 12345,
        completion_message: {
          content: { text: 'Hello' },
        },
      };

      const adapter = new LlamaResponseAdapter(llamaResponse, {});
      const result = adapter.transform();

      expect(result.id).toBe('12345');
    });

    it('handles missing model in request', () => {
      const llamaResponse = {
        completion_message: {
          content: { text: 'Hello' },
        },
      };

      const adapter = new LlamaResponseAdapter(llamaResponse, {});
      const result = adapter.transform();

      expect(result.model).toBe('unknown');
    });

    it('handles missing metrics array', () => {
      const llamaResponse = {
        completion_message: {
          content: { text: 'Hello' },
        },
      };

      const adapter = new LlamaResponseAdapter(llamaResponse, {});
      const result = adapter.transform();

      expect(result.usage.prompt_tokens).toBe(0);
      expect(result.usage.completion_tokens).toBe(0);
      expect(result.usage.total_tokens).toBe(0);
    });

    it('handles partial metrics', () => {
      const llamaResponse = {
        completion_message: {
          content: { text: 'Hello' },
        },
        metrics: [{ metric: 'num_prompt_tokens', value: 50 }],
      };

      const adapter = new LlamaResponseAdapter(llamaResponse, {});
      const result = adapter.transform();

      expect(result.usage.prompt_tokens).toBe(50);
      expect(result.usage.completion_tokens).toBe(0);
      expect(result.usage.total_tokens).toBe(0);
    });

    it('throws for invalid response structure', () => {
      const invalidResponse = {
        some_field: 'value',
      };

      const adapter = new LlamaResponseAdapter(invalidResponse, {});

      expect(() => adapter.transform()).toThrow('Invalid Llama response structure');
    });

    it('throws when text is missing', () => {
      const invalidResponse = {
        completion_message: {
          content: { other_field: 'value' },
        },
      };

      const adapter = new LlamaResponseAdapter(invalidResponse, {});

      expect(() => adapter.transform()).toThrow('Invalid Llama response structure');
    });

    it('includes created timestamp in response', () => {
      const llamaResponse = {
        completion_message: {
          content: { text: 'Hello' },
        },
      };

      const before = Date.now();
      const adapter = new LlamaResponseAdapter(llamaResponse, {});
      const result = adapter.transform();
      const after = Date.now();

      expect(result.created).toBeGreaterThanOrEqual(before);
      expect(result.created).toBeLessThanOrEqual(after);
    });
  });

  describe('ResponseAdapterFactory', () => {
    it('creates LlamaResponseAdapter for Llama response', () => {
      const response = {
        completion_message: {
          content: { text: 'Hello' },
        },
      };

      const adapter = ResponseAdapterFactory.create(response, {});

      expect(adapter).toBeInstanceOf(LlamaResponseAdapter);
    });

    it('returns null for unrecognized response type', () => {
      const unknownResponse = {
        some_field: 'value',
      };

      const adapter = ResponseAdapterFactory.create(unknownResponse, {});

      expect(adapter).toBeNull();
    });

    it('returns null for null response', () => {
      const adapter = ResponseAdapterFactory.create(null, {});

      expect(adapter).toBeNull();
    });

    it('returns null for undefined response', () => {
      const adapter = ResponseAdapterFactory.create(undefined, {});

      expect(adapter).toBeNull();
    });

    it('created adapter transforms correctly', () => {
      const response = {
        id: 'test-123',
        completion_message: {
          content: { text: 'Test response' },
        },
      };

      const adapter = ResponseAdapterFactory.create(response, { model: 'test-model' });
      const transformed = adapter?.transform() as OpenAIChatCompletionResponse;

      expect(transformed.id).toBe('test-123');
      expect(transformed.choices[0].message.content).toBe('Test response');
      expect(transformed.model).toBe('test-model');
    });
  });

  describe('integration test: Full response flow', () => {
    it('processes Llama response through factory and adapter', () => {
      const rawLlamaResponse = {
        id: 'llama-conv-123',
        completion_message: {
          content: {
            text: 'Here are the best laptops for your needs:\n1. MacBook Pro\n2. Dell XPS',
          },
          stop_reason: 'end_turn',
        },
        metrics: [
          { metric: 'num_prompt_tokens', value: 150 },
          { metric: 'num_completion_tokens', value: 50 },
          { metric: 'num_total_tokens', value: 200 },
        ],
      };

      const request = {
        model: 'llama-3.1-70b',
        max_tokens: 256,
      };

      // Use factory to get adapter
      const adapter = ResponseAdapterFactory.create(rawLlamaResponse, request);
      expect(adapter).not.toBeNull();

      // Transform to OpenAI format
      const openaiResponse = adapter!.transform();

      // Validate transformation
      expect(openaiResponse).toMatchObject({
        id: 'llama-conv-123',
        object: 'chat.completion',
        model: 'llama-3.1-70b',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: expect.stringContaining('MacBook Pro'),
            },
            finish_reason: 'end_turn',
          },
        ],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 50,
          total_tokens: 200,
        },
      });
    });
  });
});
