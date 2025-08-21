import plugin from '../../lib/plugins/plugin.js';
import { getConfig, saveConfig, loadConfig } from './lib/configManager.js';
import { getData, saveData, loadData } from './lib/conversationManager.js';

export class aichat extends plugin {
  constructor() {
    super({
      name: "aichat",
      dsc: "AI Chat Plugin",
      event: "message",
      priority: 5000,
      rule: [
        {
          reg: "^#?(添加人格|设置人格)",
          fnc: "addPersona",
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
          reg: "^(/t|@bot)",
          fnc: "chat",
        },
        {
          reg: "^#?(重置人格|重置会话)",
          fnc: "resetPersona",
        },
        {
          reg: "^#?删除人格",
          fnc: "deletePersona",
        },
        {
          reg: "^#?对话记忆",
          fnc: "toggleMemory",
        },
        {
          reg: "^#?删除对话",
          fnc: "deleteHistory",
        },
        {
          reg: "^#?(~ai配置重载|重载配置)",
          fnc: "reloadConfig",
        },
        {
          reg: "^#?(查询模型|模型列表)",
          fnc: "listModels",
        },
        {
          reg: "^#?切换模型",
          fnc: "switchModel",
        },
      ],
    });
  }

  async addPersona(e) {
    const parts = e.msg.split(' ');
    const personaName = parts[1];
    const personaDesc = parts.slice(2).join(' ');

    if (!personaName || personaName.length > 24) {
      this.reply('人格名不能为空且不能大于24位');
      return true;
    }

    if (!personaDesc) {
      this.reply('人格设定不能为空');
      return true;
    }

    const data = getData();
    data[personaName] = { description: personaDesc, history: [] };
    saveData();
    this.reply(`人格 ${personaName} 已添加/更新`);
    return true;
  }

  async listPersonas(e) {
    const data = getData();
    const config = getConfig();
    const personaList = Object.keys(data);
    if (personaList.length === 0) {
      this.reply("当前无任何人格");
      return true;
    }

    const currentPersona = config.currentPersona || "default";
    let replyMsg = "当前所有人格：\n";
    for (const persona of personaList) {
      replyMsg += `- ${persona}`;
      if (persona === currentPersona) {
        replyMsg += " (当前)";
      }
      replyMsg += "\n";
    }
    this.reply(replyMsg);
    return true;
  }

  async switchPersona(e) {
    const config = getConfig();
    const data = getData();
    const personaName = e.msg.split(' ')[1];
    if (!personaName) {
      config.currentPersona = "default";
      saveConfig();
      this.reply("已切换到默认人格");
      return true;
    }

    if (!data[personaName]) {
      this.reply(`人格 ${personaName} 不存在`);
      return true;
    }

    config.currentPersona = personaName;
    saveConfig();
    this.reply(`已切换到人格 ${personaName}`);
    return true;
  }

  async chat(e) {
    const config = getConfig();
    const data = getData();
    const msg = e.msg.replace(/^(\/t|@bot)/, '').trim();
    if (!msg) {
      return true;
    }

    const currentPersona = config.currentPersona || 'default';
    if (!data[currentPersona]) {
      data[currentPersona] = { description: '默认人格', history: [] };
    }

    const history = data[currentPersona].history;
    if (config.MEMORY_ENABLED) {
      history.push({ role: 'user', content: msg });
    }

    const personaDesc = data[currentPersona].description;

    try {
      // Replace with your actual API endpoint and key
      const response = await fetch('https://api.example.com/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.API_KEY}`
        },
        body: JSON.stringify({
          model: config.MODEL,
          messages: [
            { role: 'system', content: personaDesc },
            ...history
          ]
        })
      });

      if (response.ok) {
        const result = await response.json();
        const reply = result.choices[0].message.content;
        this.reply(reply);
        if (config.MEMORY_ENABLED) {
          history.push({ role: 'assistant', content: reply });
          saveData();
        }
      } else {
        this.reply('AI a pouting, and does not want to talk to you.');
        console.error(await response.text());
      }
    } catch (error) {
      this.reply('There seems to be a problem with the AI service, please try again later.');
      console.error(error);
    }

    return true;
  }

  async resetPersona(e) {
    const config = getConfig();
    const data = getData();
    const personaName = e.msg.split(' ')[1] || config.currentPersona || "default";

    if (personaName === "default") {
        if (!data["default"]) {
            data["default"] = { history: [] };
        }
        data["default"].history = [];
        saveData();
        this.reply("默认人格的会话记忆已重置");
        return true;
    }

    if (!data[personaName]) {
      this.reply(`人格 ${personaName} 不存在`);
      return true;
    }

    data[personaName].history = [];
    saveData();
    this.reply(`人格 ${personaName} 的会话记忆已重置`);
    return true;
  }

  async deletePersona(e) {
    const config = getConfig();
    const data = getData();
    const personaName = e.msg.split(' ')[1];
    if (!personaName) {
      this.reply("请指定要删除的人格名");
      return true;
    }

    if (!data[personaName]) {
      this.reply(`人格 ${personaName} 不存在`);
      return true;
    }

    delete data[personaName];
    saveData();

    if (config.currentPersona === personaName) {
      config.currentPersona = "default";
      saveConfig();
      this.reply(`人格 ${personaName} 已删除，当前人格已切换到默认人格`);
    } else {
      this.reply(`人格 ${personaName} 已删除`);
    }

    return true;
  }

  async toggleMemory(e) {
    const config = getConfig();
    const option = e.msg.split(' ')[1];
    if (!option || (option !== '开' && option !== '关')) {
      this.reply("请提供有效选项 (开/关)");
      return true;
    }

    config.MEMORY_ENABLED = option === '开';
    saveConfig();
    this.reply(`对话记忆已${config.MEMORY_ENABLED ? '开启' : '关闭'}`);
    return true;
  }

  async deleteHistory(e) {
    const config = getConfig();
    const data = getData();
    const numToDelete = parseInt(e.msg.split(' ')[1]);
    if (isNaN(numToDelete) || numToDelete <= 0) {
      this.reply("请提供一个有效的数字");
      return true;
    }

    const currentPersona = config.currentPersona || "default";
    if (!data[currentPersona] || !data[currentPersona].history) {
      this.reply("当前人格没有对话历史");
      return true;
    }

    const history = data[currentPersona].history;
    const numPairsToDelete = numToDelete * 2;
    if (history.length < numPairsToDelete) {
      this.reply(`历史记录不足 ${numToDelete} 对`);
      return true;
    }

    history.splice(-numPairsToDelete);
    saveData();
    this.reply(`已删除最近 ${numToDelete} 对对话`);
    return true;
  }

  async reloadConfig(e) {
    loadConfig();
    loadData();
    this.reply("AI Chat configuration reloaded.");
    return true;
  }

  async listModels(e) {
    const config = getConfig();
    try {
      // Replace with your actual API endpoint and key
      const response = await fetch('https://api.example.com/models', {
        headers: {
          'Authorization': `Bearer ${config.API_KEY}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        const models = result.data.map(model => model.id);
        this.reply(`可用模型列表：\n${models.join('\n')}`);
      } else {
        this.reply('无法获取模型列表');
        console.error(await response.text());
      }
    } catch (error) {
      this.reply('获取模型列表时出错');
      console.error(error);
    }
    return true;
  }

  async switchModel(e) {
    const config = getConfig();
    const model = e.msg.split(' ')[1];
    if (!model) {
      this.reply('请指定要切换的模型');
      return true;
    }

    config.MODEL = model;
    saveConfig();
    this.reply(`已切换到模型 ${model}`);
    return true;
  }
}
