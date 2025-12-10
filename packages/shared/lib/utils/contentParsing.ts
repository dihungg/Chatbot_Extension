/**
 * Content parsing utilities with markdown code block handling
 * Prevents repetition of parse-with-fallback patterns across codebase
 */

import type { UnifiedProductSchema } from '../types';

/**
 * Parse JSON content wrapped in markdown code blocks
 * Handles: ```json { ... }```, plain JSON, arrays
 *
 * @param content - Raw content possibly wrapped in markdown
 * @returns Parsed content or null on failure
 *
 * @example
 * parseJsonContent('```json\n{"key": "value"}\n```') // { key: "value" }
 * parseJsonContent('[{"id": 1}]') // [{ id: 1 }]
 * parseJsonContent('invalid json') // null
 */
export function parseJsonContent<T = unknown>(content: string): T | null {
  try {
    // Remove markdown code block wrappers (```json or just ```)
    const cleaned = content.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();

    if (!cleaned) {
      return null;
    }

    return JSON.parse(cleaned) as T;
  } catch (error) {
    // Log at debug level; callers decide if this is an error
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[parseJsonContent] Failed to parse JSON content:', { content, error });
    }
    return null;
  }
}

/**
 * Extract and validate products from action result content
 * Handles single product or array of products
 *
 * @param content - Raw extracted content from action result
 * @returns Array of valid products (empty if parsing fails or no valid items)
 *
 * @example
 * const products = extractValidProducts('```json\n[{"product_type": "phone", "name": "iPhone"}]\n```');
 * // [{ product_type: "phone", name: "iPhone", ... }]
 */
export function extractValidProducts(content: string): UnifiedProductSchema[] {
  const parsed = parseJsonContent<unknown>(content);

  if (!parsed) {
    return [];
  }

  // Normalize to array
  const items = Array.isArray(parsed) ? parsed : [parsed];

  // Filter to only valid products
  return items.filter(
    (item): item is UnifiedProductSchema =>
      item && typeof item === 'object' && 'product_type' in item && Boolean((item as any).product_type),
  );
}

/**
 * Extract memory keywords from product name
 * Used for SESSION MEMORY recall in planner
 *
 * @param productName - Product name string
 * @returns Array of keywords (lowercased, deduplicated, filtered)
 *
 * @example
 * extractMemoryKeywords('iPhone 16 Pro Max') // ['iphone', '16', 'pro', 'max']
 */
export function extractMemoryKeywords(productName: string): string[] {
  return Array.from(
    new Set(
      productName
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word && word.length > 0),
    ),
  );
}

/**
 * Safely parse and validate JSON with custom fallback handler
 *
 * @param content - Content to parse
 * @param onError - Optional callback for error handling
 * @returns Parsed object or null
 */
export function parseJsonContentWithHandler<T = unknown>(content: string, onError?: (error: Error) => void): T | null {
  try {
    const cleaned = content.replace(/^```(?:json)?\n?|\n?```$/g, '').trim();

    if (!cleaned) {
      return null;
    }

    return JSON.parse(cleaned) as T;
  } catch (error) {
    if (onError && error instanceof Error) {
      onError(error);
    }
    return null;
  }
}
