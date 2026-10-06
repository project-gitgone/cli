import { Command } from 'commander';
import { loginAction } from '../../flows/login.js';

export const loginCommand = new Command('login')
  .description('Login to GitGone server')
  .option('--password', 'Use an instance password instead of the GitGone Cloud account')
  .action(loginAction);
