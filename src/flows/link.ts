import { fetchProjects, linkDirectory } from '../services/workspace.js';
import { task } from '../ui/feedback.js';
import { pickProject } from '../ui/prompts.js';

export async function chooseAndLinkProject(): Promise<boolean> {
  const projects = await task('Fetching projects...', 'Failed to fetch projects', fetchProjects);
  if (!projects) return false;
  if (projects.length === 0) {
    console.log('No projects found. Create one first.');
    return false;
  }
  const projectId = await pickProject(projects);
  if (!projectId) return false;
  linkDirectory(projectId);
  return true;
}
