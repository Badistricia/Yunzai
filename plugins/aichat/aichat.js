import plugin from "../../lib/plugins/plugin.js"
import fetch from "node-fetch"
import HttpsProxyAgent from "https-proxy-agent"
import { getModelConfig, getAllModels, reloadConfig } from "./lib/configManager.js"
import {
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
} from "./lib/conversationManager.js"

export class aichat extends plugin {
  constructor() {
    super({
      name: "aichat",
      dsc: "AI Chat Plugin with Per-Group Persistence",
      event: "message",
      priority: 4999,
      rule: [
        {
          reg: "^#?设置人格",
          fnc: "setPersona",
        },
        {
          reg: "^#?人格列表",
          fnc: "listPersonas",
        },
        {
          reg: "^#?切换人格",
          fnc: "switchPersona",
        },
        {
          reg: "^#?删除人格",
          fnc: "removePersona",
        },
        {
          reg: "^#?模型列表",
          fnc: "listModels",
        },
        {
          reg: "^#?设置模型",
          fnc: "setModel",
        },
        {
          reg: "^#?当前模型",
          fnc: "currentModel",
        },
        {
          reg: "^#?设置温度",
          fnc: "setTemperature",
        },
        {
          reg: "^#?设置回复长度",
          fnc: "setMaxTokens",
        },
        {
          reg: "^#?对话记忆",
          fnc: "toggleMemory",
        },
        {
          reg: "^#?删除对话",
          fnc: "deleteConversation",
        },
        {
          reg: "^(\/t|#t|\s*\[CQ:at,qq=.*?\])",
          fnc: "chat",
        },
        {
          reg: "^#?重置会话",
          fnc: "resetHistory",
        },
        {
          reg: "^#?重载AI配置",
          fnc: "reloadPluginConfig",
        },
      ],
    })
  }

  async checkPermission(e) {
    return true // Always grant permission
  }

  async chat(e) {
    if (!e.isGroup || !e.group_id) return false

    // Concurrent control
    if (isProcessing(e.group_id)) {
      this.reply("等待回复中，请稍后再对话")
      return true
    }
    setProcessing(e.group_id, true)

    const msg = e.msg.replace(/^#t/, "").trim()

    if (!msg) {
      setProcessing(e.group_id, false)
      return false
    }

    const groupData = getGroupData(e.group_id)
    const modelConfig = getModelConfig(groupData.model)

    if (!modelConfig) {
      console.error(
        `[AI Chat] No model configured for group ${e.group_id} and no default model found.`,
      )
      setProcessing(e.group_id, false)
      return true
    }

    groupData.history.push({ role: "user", content: msg })

    let payload
    const systemPrompt = { role: "system", content: groupData.persona.description }

    if (modelConfig.provider === "gemini") {
      payload = {
        contents: [
          ...groupData.history.map(item => ({
            role: item.role === "assistant" ? "model" : "user",
            parts: [{ text: item.content }],
          })),
        ],
        systemInstruction: {
          role: "system",
          parts: [{ text: groupData.persona.description }],
        },
        generationConfig: {
          temperature: groupData.parameters.temperature,
          maxOutputTokens: groupData.parameters.max_tokens,
        },
      }
    } else {
      payload = {
        model: modelConfig.modelId.split(".")[1],
        messages: [systemPrompt, ...groupData.history],
        temperature: groupData.parameters.temperature,
        max_tokens: groupData.parameters.max_tokens,
      }
    }

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${modelConfig.apiKey}`,
      },
      body: JSON.stringify(payload),
    }

    if (modelConfig.proxy?.enable && modelConfig.proxy?.url) {
      fetchOptions.agent = new HttpsProxyAgent(modelConfig.proxy.url)
    }

    try {
      console.log("[AI Chat] Sending request to:", modelConfig.fullUrl)
      const response = await fetch(modelConfig.fullUrl, fetchOptions)
      console.log("[AI Chat] Response status:", response.status)

      if (response.ok) {
        const result = await response.json()
        let replyText = ""

        if (modelConfig.provider === "gemini") {
          replyText = result.candidates[0]?.content?.parts[0]?.text || ""
        } else {
          replyText = result.choices[0]?.message?.content || ""
        }

        if (replyText) {
          this.reply(replyText)
          // Only save to history if memory is enabled
          if (isMemoryEnabled(e.group_id)) {
            groupData.history.push({ role: "assistant", content: replyText })
          }
        } else {
          this.reply("AI返回了空消息，是不是被你问倒了？")
          console.error("[AI Chat] Empty response from API:", result)
        }
      } else {
        const errorText = await response.text()
        console.error(`[AI Chat] API Error ${response.status}:`, errorText)
        const errorMapping = {
          400: "请求格式错误，请检查参数配置",
          401: "API密钥无效或过期，请检查配置",
          402: "账户余额不足，请充值",
          403: "访问被拒绝，权限不足",
          404: "模型或接口不存在",
          422: "参数验证失败，请检查请求格式",
          429: "请求频率过高，请稍后重试",
          500: "服务器内部错误，请稍后重试",
          502: "网关错误，网络连接问题",
          503: "服务不可用，服务器过载",
          504: "网关超时，请检查网络连接"
        }
        const errorMsg = errorMapping[response.status] || `未知错误 (${response.status})`
        this.reply(`AI出错了: ${errorMsg}`)
      }
    } catch (error) {
      this.reply("AI服务连接失败，请检查网络、代理或配置。")
      console.error("[AI Chat] Fetch Error:", error)
    } finally {
      setProcessing(e.group_id, false)
    }

    saveGroupData(e.group_id, groupData)

    return true
  }

  async setPersona(e) {
    if (!e.isGroup) return this.reply("该功能仅限群聊使用。")
    if (!(await this.checkPermission(e))) return true

    const personaDesc = e.msg.replace(/^#?设置人格/, "").trim()
    if (!personaDesc) {
      this.reply("人格设定不能为空，例如：\n#设置人格 你是一个只会说'喵'的猫娘。")
      return true
    }

    const groupData = getGroupData(e.group_id)
    groupData.persona.description = personaDesc
    saveGroupData(e.group_id, groupData)

    this.reply(`本群人格已更新。`)
    return true
  }

  async listPersonas(e) {
    const personasList = getPersonasList()
    this.reply(`可用人格列表:\n- ${personasList.join("\n- ")}`)
    return true
  }

  async switchPersona(e) {
    if (!e.isGroup) return this.reply("该功能仅限群聊使用。")
    if (!(await this.checkPermission(e))) return true

    const personaName = e.msg.replace(/^#?切换人格/, "").trim()
    if (!personaName) {
      this.reply("请指定要切换的人格名称。")
      return true
    }

    const persona = getPersona(personaName)
    if (!persona) {
      this.reply(`人格 '${personaName}' 不存在。`)
      return true
    }

    const groupData = getGroupData(e.group_id)
    groupData.persona = persona
    groupData.history = [] // Clear history when switching persona
    saveGroupData(e.group_id, groupData)

    this.reply(`已切换到人格: ${personaName}`)
    return true
  }

  async removePersona(e) {
    if (!e.isGroup) return this.reply("该功能仅限群聊使用。")
    if (!(await this.checkPermission(e))) return true

    const personaName = e.msg.replace(/^#?删除人格/, "").trim()
    if (!personaName) {
      this.reply("请指定要删除的人格名称。")
      return true
    }

    try {
      removePersona(personaName)
      this.reply(`人格 '${personaName}' 已删除。`)
    } catch (error) {
      this.reply(error.message)
    }
    return true
  }

  async listModels(e) {
    const models = getAllModels()
    if (models.length === 0) {
      this.reply("配置文件中没有可用的模型。")
      return true
    }
    this.reply(`可用模型列表:\n- ${models.join("\n- ")}`)
    return true
  }

  async setModel(e) {
    if (!e.isGroup) return this.reply("该功能仅限群聊使用。")
    if (!(await this.checkPermission(e))) return true

    const modelId = e.msg.replace(/^#?设置模型/, "").trim()
    if (!modelId) {
      this.reply("请指定要切换的模型ID, 例如: #设置模型 gemini.gemini-1.5-pro")
      return true
    }

    const availableModels = getAllModels()
    if (!availableModels.includes(modelId)) {
      this.reply(`模型 ${modelId} 不存在于配置中。`)
      return true
    }

    const groupData = getGroupData(e.group_id)
    groupData.model = modelId
    saveGroupData(e.group_id, groupData)

    this.reply(`本群模型已切换到: ${modelId}`)
    return true
  }

  async currentModel(e) {
    if (!e.isGroup) return this.reply("该功能仅限群聊使用。")
    const groupData = getGroupData(e.group_id)
    const modelConfig = getModelConfig(groupData.model)
    this.reply(`本群当前模型: ${modelConfig.modelId}`)
    return true
  }

  async setTemperature(e) {
    if (!e.isGroup) return this.reply("该功能仅限群聊使用。")
    if (!(await this.checkPermission(e))) return true

    const tempStr = e.msg.replace(/^#?设置温度/, "").trim()
    const temp = parseFloat(tempStr)

    if (isNaN(temp) || temp < 0 || temp > 2) {
      this.reply("请输入有效的温度值 (0到2之间的数字)。")
      return true
    }

    const groupData = getGroupData(e.group_id)
    groupData.parameters.temperature = temp
    saveGroupData(e.group_id, groupData)

    this.reply(`本群AI温度已设置为: ${temp}`)
    return true
  }

  async setMaxTokens(e) {
    if (!e.isGroup) return this.reply("该功能仅限群聊使用。")
    if (!(await this.checkPermission(e))) return true

    const tokenStr = e.msg.replace(/^#?设置回复长度/, "").trim()
    const tokens = parseInt(tokenStr, 10)

    if (isNaN(tokens) || tokens < 1 || tokens > 8192) {
      this.reply("请输入有效的回复长度 (1到8192之间的整数)。")
      return true
    }

    const groupData = getGroupData(e.group_id)
    groupData.parameters.max_tokens = tokens
    saveGroupData(e.group_id, groupData)

    this.reply(`本群AI最大回复长度已设置为: ${tokens}`)
    return true
  }

  async toggleMemory(e) {
    if (!e.isGroup) return this.reply("该功能仅限群聊使用。")
    if (!(await this.checkPermission(e))) return true

    const action = e.msg
      .replace(/^#?对话记忆/, "")
      .trim()
      .toLowerCase()
    let enabled

    if (["开启", "开", "on", "启用"].includes(action)) {
      enabled = true
    } else if (["关闭", "关", "off", "禁用"].includes(action)) {
      enabled = false
    } else {
      this.reply("用法：对话记忆 开启/关闭 或 开/关 或 on/off 或 启用/禁用")
      return true
    }

    setMemoryEnabled(e.group_id, enabled)
    this.reply(`本群的对话记忆已${enabled ? "开启" : "关闭"}`)
    return true
  }

  async deleteConversation(e) {
    if (!e.isGroup) return this.reply("该功能仅限群聊使用。")
    if (!(await this.checkPermission(e))) return true

    const numStr = e.msg.replace(/^#?删除对话/, "").trim()
    const numPairs = parseInt(numStr, 10)

    if (isNaN(numPairs) || numPairs <= 0) {
      this.reply("请输入有效的数字（大于0）")
      return true
    }

    deleteConversationPairs(e.group_id, numPairs)
    this.reply(`已删除本群的最近 ${numPairs} 对对话`)
    return true
  }

  async resetHistory(e) {
    if (!e.isGroup) return this.reply("该功能仅限群聊使用。")
    if (!(await this.checkPermission(e))) return true

    const groupData = getGroupData(e.group_id)
    groupData.history = []
    saveGroupData(e.group_id, groupData)

    this.reply("本群的会话记忆已重置。")
    return true
  }

  async reloadPluginConfig(e) {
    if (!e.isMaster) return true
    reloadConfig()
    this.reply("AI Chat 配置已重载。")
    return true
  }
}
