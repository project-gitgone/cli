import { Command } from 'commander';
import { chooseAndLinkProject } from '../../flows/link.js';

export const linkCommand = new Command('link')
  .description('Link the current directory to a GitGone project')
  .action(async () => {
    if (await chooseAndLinkProject()) console.log('🔗 Project linked.');
  });
