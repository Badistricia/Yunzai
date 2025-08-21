import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();
const dataPath = path.join(__dirname, 'plugins', 'aichat', 'data', 'data.json');

let data = {};

function loadData() {
  if (fs.existsSync(dataPath)) {
    data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } else {
    // Create a default data file if it's missing
    data = {
      default: {
        description: '默认人格',
        history: []
      }
    };
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  }
}

function getData() {
  return data;
}

function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

loadData();

export { getData, saveData, loadData };
