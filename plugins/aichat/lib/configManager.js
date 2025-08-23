import yaml from "yaml"
import fs from "fs"
import path from "path"

const __dirname = path.resolve()
const configPath = path.join(__dirname, "plugins", "aichat", "config.yml")

let config = {}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      config = yaml.parse(fs.readFileSync(configPath, "utf8"))
    } else {
      console.error("[AI Chat] config.yml not found. Please create one.")
      config = { providers: {}, models: {}, default_parameters: {}, proxy: {} }
    }
  } catch (error) {
    console.error("[AI Chat] Error loading or parsing config.yml:", error)
    config = { providers: {}, models: {}, default_parameters: {}, proxy: {} }
  }
}

function getConfig() {
  return config
}

function getModelConfig(modelId) {
  if (!modelId) {
    modelId = config.default_model
  }

  const [providerName, modelName] = modelId.split(".")
  if (!providerName || !modelName) {
    console.error(`[AI Chat] Invalid modelId format: ${modelId}. Expected 'provider.model'.`)
    return null
  }

  const provider = config.providers?.[providerName]
  const model = config.models?.[providerName]?.[modelName]

  if (!provider) {
    console.error(`[AI Chat] Provider '${providerName}' not found in config.yml.`)
    return null
  }

  if (!Array.isArray(provider.api_keys) || provider.api_keys.length === 0) {
    console.error(`[AI Chat] No api_keys found for provider '${providerName}'.`)
    return null
  }

  if (!model) {
    console.error(
      `[AI Chat] Model '${modelName}' for provider '${providerName}' not found in config.yml.`,
    )
    return null
  }

  // Round-robin API key rotation with persistence
  let apiKeyIndex = 0
  const rotationFile = path.join(__dirname, "plugins", "aichat", "data", "key_rotation.json")
  
  try {
    if (fs.existsSync(rotationFile)) {
      const rotationData = JSON.parse(fs.readFileSync(rotationFile, "utf8"))
      apiKeyIndex = (rotationData[providerName] || 0) % provider.api_keys.length
    }
  } catch (error) {
    console.error("[AI Chat] Error reading rotation data:", error)
  }
  
  const apiKey = provider.api_keys[apiKeyIndex]
  
  // Save next index for rotation
  try {
    const rotationData = fs.existsSync(rotationFile) ? JSON.parse(fs.readFileSync(rotationFile, "utf8")) : {}
    rotationData[providerName] = (apiKeyIndex + 1) % provider.api_keys.length
    fs.writeFileSync(rotationFile, JSON.stringify(rotationData, null, 2))
  } catch (error) {
    console.error("[AI Chat] Error saving rotation data:", error)
  }

  return {
    apiKey: apiKey,
    baseUrl: provider.base_url,
    path: model.path,
    fullUrl: `${provider.base_url.replace(/\/$/, "")}${model.path}`,
    modelId: modelId,
    provider: providerName,
    proxy: config.proxy, // Include proxy settings
    defaultParams: config.default_parameters, // Include default chat parameters
    apiKeyIndex: apiKeyIndex, // Track which key was used for error handling
  }
}

function getAllModels() {
  const modelList = []
  if (!config.models) return modelList

  for (const providerName in config.models) {
    if (config.models.hasOwnProperty(providerName)) {
      for (const modelName in config.models[providerName]) {
        if (config.models[providerName].hasOwnProperty(modelName)) {
          modelList.push(`${providerName}.${modelName}`)
        }
      }
    }
  }
  return modelList
}

loadConfig()

export { getConfig, getModelConfig, getAllModels, loadConfig as reloadConfig }
