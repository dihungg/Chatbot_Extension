/**
 * Type guard utilities following DRY principle
 * Centralize complex type narrowing to prevent repetition across codebase
 */

/**
 * Represents a Llama API response structure
 */
export interface LlamaApiResponse {
  completion_message?: {
    content?: { text?: string };
    stop_reason?: string;
  };
  metrics?: Array<{ metric: string; value: number }>;
  id?: string;
}

/**
 * Represents an Azure configuration structure
 */
export interface AzureConfigLike {
  azureApiVersion?: string;
  azureDeploymentNames?: string[];
}

/**
 * Narrows unknown response to LlamaApiResponse structure
 * Guards against incomplete or malformed API responses
 *
 * @param response - Unknown value to narrow
 * @returns true if value matches LlamaApiResponse structure
 */
export function isLlamaResponse(response: unknown): response is LlamaApiResponse {
  return (
    response &&
    typeof response === 'object' &&
    'completion_message' in response &&
    response.completion_message &&
    typeof response.completion_message === 'object' &&
    'content' in response.completion_message &&
    (response as any).completion_message.content &&
    typeof (response as any).completion_message.content === 'object' &&
    'text' in (response as any).completion_message.content
  );
}

/**
 * Narrows to config with required Azure fields
 *
 * @param config - Unknown value to narrow
 * @returns true if config has Azure-specific fields
 */
export function isAzureConfig(config: unknown): config is AzureConfigLike {
  return (config &&
    typeof config === 'object' &&
    'azureApiVersion' in config &&
    'azureDeploymentNames' in config &&
    Array.isArray((config as any).azureDeploymentNames)) as boolean;
}

/**
 * Safely extract properties from object with fallback value
 * Prevents errors when accessing potentially undefined nested properties
 *
 * @param obj - Object to extract from
 * @param key - Property key to extract
 * @param fallback - Default value if property doesn't exist
 * @returns Property value or fallback
 *
 * @example
 * const text = safeGet(response, 'text', 'Unknown');
 */
export function safeGet<T, K extends keyof T>(obj: unknown, key: K, fallback: T[K]): T[K] {
  return obj && typeof obj === 'object' && key in obj ? (obj as T)[key] : fallback;
}

/**
 * Type-safe check for object with specific property
 *
 * @param value - Value to check
 * @param prop - Property name to look for
 * @returns true if value is object with property
 */
export function hasProperty<T, K extends PropertyKey>(value: T, prop: K): value is T & Record<K, unknown> {
  return value && typeof value === 'object' && prop in value;
}

/**
 * Type-safe array check
 *
 * @param value - Value to check
 * @returns true if value is an array
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * Type-safe string check
 *
 * @param value - Value to check
 * @returns true if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}
