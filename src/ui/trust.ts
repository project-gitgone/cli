import chalk from 'chalk';
import type { TrustDecision } from '../services/trust.js';
import { confirm } from './prompts.js';
import { hint } from './feedback.js';

export const askToTrust: TrustDecision = async (recipient, fingerprint) => {
  console.log(`\nFirst time sharing with ${chalk.cyan(recipient.email)}. Key fingerprint:\n  ${chalk.bold(fingerprint)}`);
  hint('They can display theirs with "gitgone keys fingerprint".');
  return confirm(`Trust this key for ${recipient.email}?`, true);
};
