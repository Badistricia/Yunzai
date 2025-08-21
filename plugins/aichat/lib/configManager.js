import yaml from 'yaml';
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const configPath = path.join(__dirname, 'plugins', 'aichat', 'data', 'config.yaml');
const configDefaultPath = path.join(__dirname, 'plugins', 'aichat', 'data', 'config_default.yaml');

let config = {};

function loadConfig() {
  if (fs.existsSync(configPath)) {
    config = yaml.parse(fs.readFileSync(configPath, 'utf8'));
  } else {
    if (fs.existsSync(configDefaultPath)) {
      fs.copyFileSync(configDefaultPath, configPath);
      config = yaml.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      // Create a default config if even the default is missing
      config = {
        API_KEY: 'your_api_key_here',
        MODEL: 'default_model',
        MEMORY_ENABLED: true,
        currentPersona: 'default'
      };
      fs.writeFileSync(configPath, yaml.stringify(config));
    }
  }
}

function getConfig() {
  return config;
}

function saveConfig() {
  fs.writeFileSync(configPath, yaml.stringify(config, null, 2));
}

loadConfig();

export { getConfig, saveConfig, loadConfig };
