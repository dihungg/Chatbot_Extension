/**
 * Unit tests for type guard utilities
 * Tests all type narrowing functions with valid and invalid inputs
 */

import { describe, expect, it } from 'vitest';
import {
  isLlamaResponse,
  isAzureConfig,
  safeGet,
  hasProperty,
  isArray,
  isString,
  type LlamaApiResponse,
  type AzureConfigLike,
} from '../typeGuards';

describe('TypeGuards', () => {
  describe('isLlamaResponse', () => {
    it('accepts valid Llama response with all fields', () => {
      const response: LlamaApiResponse = {
        completion_message: {
          content: { text: 'Hello' },
          stop_reason: 'stop',
        },
        id: 'llama-123',
        metrics: [{ metric: 'tokens', value: 100 }],
      };

      expect(isLlamaResponse(response)).toBe(true);
    });

    it('accepts minimal valid Llama response', () => {
      const response = {
        completion_message: {
          content: { text: 'Hello' },
        },
      };

      expect(isLlamaResponse(response)).toBe(true);
    });

    it('rejects response without completion_message', () => {
      expect(isLlamaResponse({ id: 'test' })).toBe(false);
      expect(isLlamaResponse({})).toBe(false);
    });

    it('rejects response without content.text', () => {
      const response = {
        completion_message: {
          content: { other_field: 'value' },
        },
      };

      expect(isLlamaResponse(response)).toBe(false);
    });

    it('rejects null and undefined', () => {
      expect(isLlamaResponse(null)).toBe(false);
      expect(isLlamaResponse(undefined)).toBe(false);
    });

    it('rejects non-object values', () => {
      expect(isLlamaResponse('string')).toBe(false);
      expect(isLlamaResponse(123)).toBe(false);
      expect(isLlamaResponse(true)).toBe(false);
    });
  });

  describe('isAzureConfig', () => {
    it('accepts valid Azure config', () => {
      const config: AzureConfigLike = {
        azureApiVersion: '2023-05-15',
        azureDeploymentNames: ['gpt-4', 'gpt-35-turbo'],
      };

      expect(isAzureConfig(config)).toBe(true);
    });

    it('rejects config without azureApiVersion', () => {
      const config = {
        azureDeploymentNames: ['gpt-4'],
      };

      expect(isAzureConfig(config)).toBe(false);
    });

    it('rejects config where azureDeploymentNames is not array', () => {
      const config = {
        azureApiVersion: '2023-05-15',
        azureDeploymentNames: 'gpt-4',
      };

      expect(isAzureConfig(config)).toBe(false);
    });

    it('rejects null and undefined', () => {
      expect(isAzureConfig(null)).toBe(false);
      expect(isAzureConfig(undefined)).toBe(false);
    });
  });

  describe('safeGet', () => {
    interface TestObject {
      name: string;
      age: number;
    }

    it('extracts existing property from object', () => {
      const obj: TestObject = { name: 'Alice', age: 30 };
      const name = safeGet(obj, 'name', 'Unknown');

      expect(name).toBe('Alice');
    });

    it('returns fallback when property missing', () => {
      const obj = { other: 'value' };
      const name = safeGet<TestObject>(obj as any, 'name', 'Unknown');

      expect(name).toBe('Unknown');
    });

    it('returns fallback when object is null', () => {
      const name = safeGet<TestObject>(null, 'name', 'Unknown');

      expect(name).toBe('Unknown');
    });

    it('returns fallback when object is not an object', () => {
      const name = safeGet<TestObject>('string', 'name', 'Unknown');

      expect(name).toBe('Unknown');
    });
  });

  describe('hasProperty', () => {
    it('returns true when object has property', () => {
      const obj = { name: 'Alice' };

      expect(hasProperty(obj, 'name')).toBe(true);
    });

    it('returns false when object missing property', () => {
      const obj = { other: 'value' };

      expect(hasProperty(obj, 'name')).toBe(false);
    });

    it('works with symbol keys', () => {
      const sym = Symbol('test');
      const obj = { [sym]: 'value' };

      expect(hasProperty(obj, sym as any)).toBe(true);
    });
  });

  describe('isArray', () => {
    it('returns true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(['a', 'b'])).toBe(true);
    });

    it('returns false for non-arrays', () => {
      expect(isArray(null)).toBe(false);
      expect(isArray({})).toBe(false);
      expect(isArray('string')).toBe(false);
      expect(isArray(123)).toBe(false);
    });
  });

  describe('isString', () => {
    it('returns true for strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('hello')).toBe(true);
    });

    it('returns false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(['string'])).toBe(false);
    });
  });
});
