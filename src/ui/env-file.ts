import fs from 'fs';
import path from 'path';

export const envFilePath = () => path.resolve(process.cwd(), '.env');
export const envFileExists = () => fs.existsSync(envFilePath());
export const readEnvFile = () => fs.readFileSync(envFilePath(), 'utf-8');
export const writeEnvFile = (content: string) => fs.writeFileSync(envFilePath(), content);
