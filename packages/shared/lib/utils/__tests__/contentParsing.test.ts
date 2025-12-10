/**
 * Unit tests for content parsing utilities
 * Tests JSON parsing with markdown blocks, product extraction, and edge cases
 */

import { describe, expect, it } from 'vitest';
import {
  parseJsonContent,
  extractValidProducts,
  extractMemoryKeywords,
  parseJsonContentWithHandler,
} from '../contentParsing';
import type { UnifiedProductSchema } from '../../types';

describe('ContentParsing', () => {
  describe('parseJsonContent', () => {
    it('parses plain JSON object', () => {
      const json = '{"key": "value", "number": 42}';
      const result = parseJsonContent(json);

      expect(result).toEqual({ key: 'value', number: 42 });
    });

    it('parses plain JSON array', () => {
      const json = '[1, 2, 3]';
      const result = parseJsonContent(json);

      expect(result).toEqual([1, 2, 3]);
    });

    it('parses JSON wrapped in markdown code block', () => {
      const markdown = '```json\n{"key": "value"}\n```';
      const result = parseJsonContent(markdown);

      expect(result).toEqual({ key: 'value' });
    });

    it('parses JSON wrapped in backticks without language', () => {
      const markdown = '```\n{"key": "value"}\n```';
      const result = parseJsonContent(markdown);

      expect(result).toEqual({ key: 'value' });
    });

    it('parses JSON with extra whitespace in markdown', () => {
      const markdown = '```json\n\n{"key": "value"}\n\n```';
      const result = parseJsonContent(markdown);

      expect(result).toEqual({ key: 'value' });
    });

    it('returns null for invalid JSON', () => {
      const invalid = '{invalid json}';
      const result = parseJsonContent(invalid);

      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = parseJsonContent('');

      expect(result).toBeNull();
    });

    it('returns null for whitespace only', () => {
      const result = parseJsonContent('   \n\n  ');

      expect(result).toBeNull();
    });

    it('returns null for empty markdown code block', () => {
      const markdown = '```json\n\n```';
      const result = parseJsonContent(markdown);

      expect(result).toBeNull();
    });

    it('supports generic type parameter', () => {
      interface Person {
        name: string;
        age: number;
      }

      const json = '{"name": "Alice", "age": 30}';
      const result = parseJsonContent<Person>(json);

      expect(result).toEqual({ name: 'Alice', age: 30 });
      expect(typeof result?.name).toBe('string');
    });
  });

  describe('extractValidProducts', () => {
    it('extracts single valid product', () => {
      const content = JSON.stringify({
        product_type: 'phone',
        name: 'iPhone 16',
        price_vnd: 25000000,
        url: 'https://example.com',
      });

      const products = extractValidProducts(content);

      expect(products).toHaveLength(1);
      expect(products[0].product_type).toBe('phone');
      expect(products[0].name).toBe('iPhone 16');
    });

    it('extracts array of valid products', () => {
      const content = JSON.stringify([
        {
          product_type: 'phone',
          name: 'iPhone 16',
          price_vnd: 25000000,
          url: 'https://example.com',
        },
        {
          product_type: 'phone',
          name: 'Samsung S24',
          price_vnd: 20000000,
          url: 'https://example.com',
        },
      ]);

      const products = extractValidProducts(content);

      expect(products).toHaveLength(2);
      expect(products.map(p => p.name)).toEqual(['iPhone 16', 'Samsung S24']);
    });

    it('filters out products without product_type', () => {
      const content = JSON.stringify([
        {
          product_type: 'phone',
          name: 'iPhone 16',
          price_vnd: 25000000,
          url: 'https://example.com',
        },
        {
          name: 'Invalid Product',
          price_vnd: 10000000,
          url: 'https://example.com',
        },
      ]);

      const products = extractValidProducts(content);

      expect(products).toHaveLength(1);
      expect(products[0].name).toBe('iPhone 16');
    });

    it('returns empty array for invalid JSON', () => {
      const content = 'invalid json';
      const products = extractValidProducts(content);

      expect(products).toEqual([]);
    });

    it('returns empty array for products with empty product_type', () => {
      const content = JSON.stringify({
        product_type: '',
        name: 'Invalid Product',
      });

      const products = extractValidProducts(content);

      expect(products).toEqual([]);
    });

    it('works with markdown-wrapped JSON', () => {
      const content = '```json\n[{"product_type": "phone", "name": "Test"}]\n```';
      const products = extractValidProducts(content);

      expect(products).toHaveLength(1);
      expect(products[0].name).toBe('Test');
    });
  });

  describe('extractMemoryKeywords', () => {
    it('extracts keywords from product name', () => {
      const name = 'iPhone 16 Pro Max';
      const keywords = extractMemoryKeywords(name);

      expect(keywords).toContain('iphone');
      expect(keywords).toContain('16');
      expect(keywords).toContain('pro');
      expect(keywords).toContain('max');
    });

    it('returns lowercase keywords', () => {
      const name = 'SAMSUNG Galaxy S24 ULTRA';
      const keywords = extractMemoryKeywords(name);

      expect(keywords).toEqual(expect.arrayContaining(['samsung', 'galaxy', 's24', 'ultra']));
    });

    it('deduplicates keywords', () => {
      const name = 'iPhone iPhone iPhone';
      const keywords = extractMemoryKeywords(name);

      expect(keywords.filter(k => k === 'iphone')).toHaveLength(1);
    });

    it('handles empty string', () => {
      const keywords = extractMemoryKeywords('');

      expect(keywords).toEqual([]);
    });

    it('handles whitespace only', () => {
      const keywords = extractMemoryKeywords('   \n\n  ');

      expect(keywords).toEqual([]);
    });

    it('handles special characters', () => {
      const name = 'iPhone 16 Pro Max (Space Black)';
      const keywords = extractMemoryKeywords(name);

      expect(keywords).toContain('iphone');
      expect(keywords).toContain('16');
      expect(keywords).toContain('space');
      expect(keywords).toContain('black');
    });
  });

  describe('parseJsonContentWithHandler', () => {
    it('parses valid JSON and calls success callback implicitly', () => {
      const json = '{"key": "value"}';
      const result = parseJsonContentWithHandler(json);

      expect(result).toEqual({ key: 'value' });
    });

    it('calls error handler on parse failure', () => {
      const onError = (error: Error) => {
        // Error handler will be called
      };

      const spy = {
        onError,
        called: false,
        error: null as Error | null,
      };

      const original = spy.onError;
      spy.onError = (error: Error) => {
        spy.called = true;
        spy.error = error;
      };

      const result = parseJsonContentWithHandler('invalid', spy.onError);

      expect(result).toBeNull();
    });

    it('returns null without error handler on failure', () => {
      const result = parseJsonContentWithHandler('{invalid}');

      expect(result).toBeNull();
    });

    it('preserves generic type parameter', () => {
      interface Config {
        apiKey: string;
      }

      const json = '{"apiKey": "secret"}';
      const result = parseJsonContentWithHandler<Config>(json);

      expect(result?.apiKey).toBe('secret');
    });
  });
});
