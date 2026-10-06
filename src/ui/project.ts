import { getLocalConfig } from '../lib/config.js';
import { fail } from './feedback.js';

export type LinkedProject = { projectId: string; projectName?: string };

export function requireLinkedProject(): LinkedProject | undefined {
  const local = getLocalConfig();
  if (!local?.projectId) {
    fail('No linked project found. Run "gitgone init" or "gitgone link" first.');
    return undefined;
  }
  return { projectId: local.projectId, projectName: local.projectName };
}
