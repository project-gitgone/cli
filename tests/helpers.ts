import fs from 'fs';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';
import { clearConfig } from '../src/lib/config.js';

export const setupEnvironment = () => {
  const testId = nanoid();
  const tmpDir = path.join(os.tmpdir(), `gitgone-test-${testId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };

  process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'config');
  process.chdir(tmpDir);
  clearConfig();

  return {
    tmpDir,
    cleanup: () => {
      process.chdir(originalCwd);
      process.env = originalEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
};

export const mockFetch = (handler: (url: string, options: any) => Promise<any>) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    return handler(url, init);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
};

export const spyConsole = () => {
  const originalLog = console.log;
  const originalTable = console.table;
  const logs: string[] = [];

  console.log = (...args: any[]) => {
    logs.push(args.map(a => String(a)).join(' '));
  };
  console.table = (data: any) => {
    logs.push(JSON.stringify(data));
  };

  return {
    logs,
    restore: () => {
      console.log = originalLog;
      console.table = originalTable;
    }
  };
};

export const spyExit = () => {
  const originalExit = process.exit;
  let resolveExit: (code?: number) => void = () => {};
  const exited = new Promise<number | undefined>((resolve) => (resolveExit = resolve));
  // @ts-ignore
  process.exit = (code?: number) => {
    resolveExit(code);
  };
  return {
    exited,
    restore: () => {
      process.exit = originalExit;
    },
  };
};
