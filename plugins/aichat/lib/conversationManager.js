import fs from "fs"
import path from "path"
import { getConfig } from "./configManager.js"

const __dirname = path.resolve()
const dataDir = path.join(__dirname, "plugins", "aichat", "data", "groups")
const personasDir = path.join(__dirname, "plugins", "aichat", "data")
const personasFile = path.join(personasDir, "personas.json")

// Ensure the directories for data exist
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}
if (!fs.existsSync(personasDir)) {
  fs.mkdirSync(personasDir, { recursive: true })
}

const MAX_HISTORY = 50
const MAX_TOKENS = 4096 // Token limit for intelligent cleanup

// Load personas
function loadPersonas() {
  try {
    if (fs.existsSync(personasFile)) {
      return JSON.parse(fs.readFileSync(personasFile, "utf8"))
    } else {
      // Create default personas
      const defaultPersonas = {
        default: {
          name: "default",
          description: "You are a helpful assistant.",
        },
        catgirl: {
          name: "catgirl",
          description: "你是一只可爱的猫娘，说话时会带上'喵~'，喜欢撒娇。",
        },
      }
      fs.writeFileSync(personasFile, JSON.stringify(defaultPersonas, null, 2))
      return defaultPersonas
    }
  } catch (error) {
    console.error("[AI Chat] Error loading personas:", error)
    return {}
  }
}

const personas = loadPersonas()

// Processing groups set for concurrent control
const processingGroups = new Set()

// Gets the data for a specific group, merging with defaults
function getGroupData(groupId) {
  const groupDataPath = path.join(dataDir, `${groupId}.json`)
  const defaults = getConfig().default_parameters || {}
  let groupData

  if (fs.existsSync(groupDataPath)) {
    try {
      groupData = JSON.parse(fs.readFileSync(groupDataPath, "utf8"))
    } catch (error) {
      console.error(`[AI Chat] Error reading or parsing data for group ${groupId}:`, error)
      groupData = {} // Start with an empty object on error
    }
  } else {
    groupData = {} // Start with an empty object if file doesn't exist
  }

  // Merge group data with defaults
  const finalData = {
    ...getDefaultGroupData(), // Load base structure
    ...groupData, // Overwrite with saved data
  }

  // Ensure parameters exist, falling back to defaults from config
  finalData.parameters = {
    temperature: groupData.parameters?.temperature ?? defaults.temperature,
    max_tokens: groupData.parameters?.max_tokens ?? defaults.max_tokens,
    memory_enabled: groupData.parameters?.memory_enabled ?? true,
  }

  return finalData
}

// Saves the data for a specific group
function saveGroupData(groupId, data) {
  const groupDataPath = path.join(dataDir, `${groupId}.json`)

  // Intelligent cleanup before saving
  if (data.history && data.history.length > 0) {
    // Cleanup based on token count
    let totalTokens = 0
    for (const msg of data.history) {
      totalTokens += msg.content.length / 4 // Rough token estimation
    }

    // Remove oldest messages if token limit exceeded
    while (totalTokens > MAX_TOKENS && data.history.length > 2) {
      const removedMsg = data.history.shift()
      totalTokens -= removedMsg.content.length / 4
    }

    // Trim by message count
    if (data.history.length > MAX_HISTORY) {
      data.history = data.history.slice(-MAX_HISTORY)
    }
  }

  try {
    fs.writeFileSync(groupDataPath, JSON.stringify(data, null, 2))
  } catch (error) {
    console.error(`[AI Chat] Error saving data for group ${groupId}:`, error)
  }
}

// Provides a default structure for a new group
function getDefaultGroupData() {
  return {
    model: null, // Will use the default model from config.yml
    persona: {
      name: "default",
      description: "You are a helpful assistant.",
    },
    parameters: {
      // Storing parameters in a nested object
      temperature: null, // Null indicates fallback to default
      max_tokens: null,
      memory_enabled: true,
    },
    history: [],
  }
}

// Persona management functions
function getPersonasList() {
  return Object.keys(personas)
}

function getPersona(personaName) {
  return personas[personaName] || personas.default
}

function addPersona(personaName, description) {
  personas[personaName] = {
    name: personaName,
    description: description,
  }
  savePersonas()
}

function removePersona(personaName) {
  if (personaName === "default") {
    throw new Error("Cannot remove default persona")
  }
  if (!personas[personaName]) {
    throw new Error(`Persona '${personaName}' does not exist`)
  }
  delete personas[personaName]
  savePersonas()
}

function savePersonas() {
  try {
    fs.writeFileSync(personasFile, JSON.stringify(personas, null, 2))
  } catch (error) {
    console.error("[AI Chat] Error saving personas:", error)
  }
}

// Concurrent control functions
function setProcessing(groupId, processing) {
  if (processing) {
    processingGroups.add(groupId)
  } else {
    processingGroups.delete(groupId)
  }
}

function isProcessing(groupId) {
  return processingGroups.has(groupId)
}

// Memory control functions
function setMemoryEnabled(groupId, enabled) {
  const groupData = getGroupData(groupId)
  groupData.parameters.memory_enabled = enabled
  saveGroupData(groupId, groupData)
}

function isMemoryEnabled(groupId) {
  const groupData = getGroupData(groupId)
  return groupData.parameters.memory_enabled
}

// Delete specific number of conversation pairs
function deleteConversationPairs(groupId, numPairs) {
  const groupData = getGroupData(groupId)
  const numToDelete = Math.min(numPairs * 2, groupData.history.length)
  groupData.history = groupData.history.slice(0, -numToDelete)
  saveGroupData(groupId, groupData)
}

export {
  getGroupData,
  saveGroupData,
  getPersonasList,
  getPersona,
  addPersona,
  removePersona,
  setProcessing,
  isProcessing,
  setMemoryEnabled,
  isMemoryEnabled,
  deleteConversationPairs,
}
