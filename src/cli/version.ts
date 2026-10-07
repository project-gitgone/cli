import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const findPackageJson = (start: string): string | null => {
  let directory = start;
  while (true) {
    const candidate = join(directory, 'package.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
};

const packageJson = findPackageJson(dirname(fileURLToPath(import.meta.url)));

export const version: string = packageJson ? JSON.parse(readFileSync(packageJson, 'utf-8')).version : '0.0.0';
