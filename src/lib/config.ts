
import Conf from 'conf';
import fs from 'fs';
import path from 'path';


type ConfigSchema = {
  serverUrl: string;
  authToken?: string;
  userEmail?: string;
  publicKey?: string;
  encryptedPrivateKey?: string;
  keySalt?: string;
  keyEncryptionAlgo?: string;
};

const config = new Conf<ConfigSchema>({
  projectName: 'gitgone',
  defaults: {
    serverUrl: 'http://localhost:3333',
  },
});

export const getConfig = () => config.store;
export const setConfig = (key: keyof ConfigSchema, value: any) => config.set(key, value);
export const clearConfig = () => config.clear();
export const deleteConfig = (key: keyof ConfigSchema) => config.delete(key);

const LOCAL_CONFIG_FILE = '.gitgone';

const serializeGitGone = (data: Record<string, string | undefined>) => {
  let output = '# GitGone Project Configuration\n# --- DO NOT EDIT MANUALLY ---\n\n[project]\n';
  for (const [key, value] of Object.entries(data)) {
    if (value) {
      const fileKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      output += `${fileKey.padEnd(12)} : ${value}\n`;
    }
  }
  return output;
};

const parseGitGone = (content: string) => {
  const lines = content.split('\n');
  const data: any = {};
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('[') || !line.includes(':')) continue;
    const [rawKey, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();
    const key = rawKey.trim().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    data[key] = value;
  }
  return data;
};

export const getLocalConfig = () => {
  const configPath = path.resolve(process.cwd(), LOCAL_CONFIG_FILE);
  if (!fs.existsSync(configPath)) return null;
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    if (content.trim().startsWith('{')) {
        return JSON.parse(content);
    }
    return parseGitGone(content);
  } catch {
    return null;
  }
};

export const setLocalConfig = (data: { projectId?: string; teamId?: string; projectName?: string; serverUrl?: string }) => {
  const configPath = path.resolve(process.cwd(), LOCAL_CONFIG_FILE);
  const current = getLocalConfig() || {};
  const updated = { ...current, ...data };
  fs.writeFileSync(configPath, serializeGitGone(updated));
};

export const getServerUrl = () => {
  const local = getLocalConfig();
  if (local && local.serverUrl) {
    return local.serverUrl;
  }
  return config.get('serverUrl');
};
