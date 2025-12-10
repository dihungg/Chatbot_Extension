/**
 * Utility module for detecting user intent from raw task descriptions.
 * Helps determine whether a task is a comparison/analysis request
 * or a genuine shopping/purchase request.
 */

/** English keywords for comparison/analysis intent */
const COMPARISON_KEYWORDS_EN = [
  'compare',
  'comparison',
  'versus',
  'vs',
  'vs.',
  'analyze',
  'analysis',
  'review',
  'benchmark',
];

/** Vietnamese keywords for comparison/analysis intent */
const COMPARISON_KEYWORDS_VI = [
  'so sánh',
  'đối chiếu',
  'phân tích',
  'đánh giá',
  'review',
  'benchmark',
  'cái nào tốt hơn',
  'tốt hơn cái',
];

/** Keywords indicating multiple models or SKUs being mentioned */
const SKU_INDICATOR_KEYWORDS = ['vs', 'vs.', 'hay', 'or', 'hay là', 'hoặc', 'versus', 'with', 'và'];

/**
 * Detects if the user's task intent is comparison/analysis rather than purchase.
 *
 * Strategy:
 * 1. Look for explicit comparison keywords (e.g., "compare", "so sánh")
 * 2. Optionally look for SKU references (e.g., "iPhone 15 vs Galaxy S24")
 * 3. Use flexible matching to handle Vietnamese diacritics properly
 *
 * Vietnamese users are the primary end-user base, so Vietnamese keywords
 * are given equal weight to English ones.
 *
 * @param rawTask - The raw user input/task description
 * @returns true if the intent appears to be comparison/analysis; false otherwise
 */
export function detectClarificationBypassIntent(rawTask: string): boolean {
  if (!rawTask || rawTask.trim().length === 0) {
    return false;
  }

  const normalized = rawTask.toLowerCase().trim();
  const original = rawTask.trim(); // Keep original for capital letter detection

  // Check for explicit comparison/analysis keywords
  // For better Vietnamese support, use includes() instead of word boundaries
  // since Vietnamese diacritics can interfere with word boundary detection
  const hasComparisonKeyword = [...COMPARISON_KEYWORDS_EN, ...COMPARISON_KEYWORDS_VI].some(keyword => {
    return normalized.includes(keyword.toLowerCase());
  });

  if (hasComparisonKeyword) {
    return true;
  }

  // Check for SKU indicators (multiple models mentioned with vs/hay/or etc.)
  // e.g., "iPhone 15 vs Galaxy S24", "MacBook M3 hay M4"
  const skuIndicatorFound = SKU_INDICATOR_KEYWORDS.some(indicator => {
    return normalized.includes(indicator.toLowerCase());
  });

  if (skuIndicatorFound) {
    // Also check that there are likely multiple product names/models mentioned
    // Simple heuristic: look for capital letters indicating brand/model names
    // and the presence of SKU indicators
    const hasMultipleCapitals = (original.match(/[A-Z]/g) || []).length >= 2;

    if (hasMultipleCapitals) {
      return true;
    }
  }

  return false;
}
