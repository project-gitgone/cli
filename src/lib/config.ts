
import Conf from 'conf';
import fs from 'fs';
import path from 'path';
import type { KdfParams } from '@/lib/crypto.js';


export type ConfigSchema = {
  serverUrl: string;
  authToken?: string;
  userEmail?: string;
  publicKey?: string;
  encryptedPrivateKey?: string;
  keySalt?: string;
  keyEncryptionAlgo?: string;
  cryptoVersion?: number;
  kdfParams?: KdfParams;
  seenVersions?: Record<string, number>;
  keychain?: boolean;
  knownKeys?: Record<string, { email: string; fingerprint: string }>;
};

const config = new Conf<ConfigSchema>({
  projectName: 'gitgone',
  defaults: {
    serverUrl: 'http://localhost:3333',
  },
});

export const getConfig = () => config.store;
export const setConfig = <K extends keyof ConfigSchema>(key: K, value: ConfigSchema[K]) => config.set(key, value);
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
  const data: Record<string, string> = {};
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('[') || !line.includes(':')) continue;
    const [rawKey, ...valueParts] = line.split(':');
    const value = valueParts.join(':').trim();
    const key = rawKey.trim().replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    data[key] = value;
  }
  return data;
};

export const getLocalConfig = (): LocalConfig | null => {
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

export type LocalConfig = { projectId?: string; teamId?: string; projectName?: string; serverUrl?: string; environment?: string };

export const LOCAL_CONFIG_KEYS = ['projectId', 'teamId', 'projectName', 'serverUrl', 'environment'] as const;

export const setLocalConfig = (data: LocalConfig) => {
  const configPath = path.resolve(process.cwd(), LOCAL_CONFIG_FILE);
  const current = getLocalConfig() || {};
  const updated = { ...current, ...data };
  fs.writeFileSync(configPath, serializeGitGone(updated));
};

export const getServerUrl = () => {
  if (process.env.GITGONE_SERVER_URL) return process.env.GITGONE_SERVER_URL;
  const local = getLocalConfig();
  if (local && local.serverUrl) {
    return local.serverUrl;
  }
  return config.get('serverUrl');
};
