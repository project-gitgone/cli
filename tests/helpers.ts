import fs from 'fs';
import path from 'path';
import os from 'os';
import { nanoid } from 'nanoid';

export const setupEnvironment = () => {
  const testId = nanoid();
  const tmpDir = path.join(os.tmpdir(), `gitgone-test-${testId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };

  process.env.XDG_CONFIG_HOME = path.join(tmpDir, 'config');
  process.chdir(tmpDir);

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
  // @ts-ignore
  process.exit = (code?: number) => {
    throw new Error(`Process exit with code ${code}`);
  };
  return () => {
    process.exit = originalExit;
  };
};
