/**
 * Model Configuration
 * Maps models to providers and provides helper functions for model management.
 */

// Parse models from environment variable
const MODELS_AVAILABLE_ENV = import.meta.env.VITE_MODELS_AVAILABLE;
const MODELS_LIST = MODELS_AVAILABLE_ENV ? JSON.parse(MODELS_AVAILABLE_ENV) : ['gpt-5-nano', 'gpt-5-mini', 'gpt-5'];

// Model to provider mapping (must match backend model_config.py)
const MODEL_TO_PROVIDER = {
  'gpt-5-nano': 'openai',
  'gpt-5-mini': 'openai',
  'gpt-5': 'openai',
  'skolegpt-v3': 'skolegpt',
};

// Models that support streaming
const STREAMING_MODELS = new Set(['gpt-5-nano', 'skolegpt-v3']);

/**
 * Get the provider name for a given model
 * @param {string} model - Model name
 * @returns {string} Provider name
 */
export function getProviderForModel(model) {
  return MODEL_TO_PROVIDER[model] || null;
}

/**
 * Get all models for a given provider
 * @param {string} provider - Provider name
 * @returns {string[]} Array of model names
 */
export function getModelsForProvider(provider) {
  return Object.entries(MODEL_TO_PROVIDER)
    .filter(([_, prov]) => prov === provider)
    .map(([model, _]) => model);
}

/**
 * Check if a model supports streaming
 * @param {string} model - Model name
 * @returns {boolean} True if model supports streaming
 */
export function isStreamingModel(model) {
  return STREAMING_MODELS.has(model);
}

/**
 * Get all available models
 * @returns {string[]} Array of available model names
 */
export function getAvailableModels() {
  // Filter to only include models that are in the environment variable
  return MODELS_LIST.filter(model => MODEL_TO_PROVIDER.hasOwnProperty(model));
}

/**
 * Get model configuration object
 * @param {string} model - Model name
 * @returns {Object|null} Model configuration with provider and streaming info
 */
export function getModelConfig(model) {
  if (!MODEL_TO_PROVIDER.hasOwnProperty(model)) {
    return null;
  }
  
  return {
    name: model,
    provider: MODEL_TO_PROVIDER[model],
    streaming: isStreamingModel(model),
  };
}

/**
 * Get all models grouped by provider
 * @returns {Object} Object with provider names as keys and arrays of models as values
 */
export function getModelsByProvider() {
  const grouped = {};
  
  for (const model of getAvailableModels()) {
    const provider = MODEL_TO_PROVIDER[model];
    if (!grouped[provider]) {
      grouped[provider] = [];
    }
    grouped[provider].push(model);
  }
  
  return grouped;
}

// Export constants
export { MODEL_TO_PROVIDER, STREAMING_MODELS };

