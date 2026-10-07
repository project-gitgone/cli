import type { TrustDecision } from '@/services/trust.js';
import { ask, getPromptPolicy } from '@/ui/ask.js';
import { warn } from '@/ui/messages.js';
import { writeLine } from '@/ui/output.js';
import { colors } from '@/ui/theme.js';

export const askToTrust: TrustDecision = async (recipient, fingerprint) => {
  if (!getPromptPolicy().interactive) {
    warn(`Key of ${recipient.email} not trusted yet: it is never trusted without a terminal.`, 'gitgone key share');
    return false;
  }
  writeLine(`\nFirst time sharing with ${colors.cyan(recipient.email)}. Key fingerprint:\n  ${colors.bold(fingerprint)}`);
  writeLine(colors.muted('They can display theirs with "gitgone key fingerprint".'));
  return ask.confirm({ message: `Trust this key for ${recipient.email}?`, initial: true, ignoreYes: true });
};
