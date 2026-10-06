import type { Recipient } from '../api/types.js';
import { deleteConfig, getConfig, setConfig } from '../lib/config.js';
import { publicKeyFingerprint } from '../lib/crypto.js';

export type TrustDecision = (recipient: Recipient, fingerprint: string) => Promise<boolean>;

export async function trustRecipient(recipient: Recipient, decide: TrustDecision): Promise<boolean> {
  const fingerprint = publicKeyFingerprint(recipient.publicKey);
  const knownKeys = getConfig().knownKeys ?? {};
  const known = knownKeys[recipient.id];

  if (known) {
    if (known.fingerprint === fingerprint) return true;
    throw new Error(
      `The public key of ${recipient.email} has changed (was ${known.fingerprint}, now ${fingerprint}). ` +
        `If they really reset their account, check the new fingerprint with them, then run "gitgone keys forget ${recipient.email}".`,
    );
  }

  if (!(await decide(recipient, fingerprint))) return false;
  setConfig('knownKeys', { ...knownKeys, [recipient.id]: { email: recipient.email, fingerprint } });
  return true;
}

export function forgetRecipientKey(email: string) {
  const knownKeys = { ...(getConfig().knownKeys ?? {}) };
  const ids = Object.keys(knownKeys).filter((id) => knownKeys[id].email === email);
  for (const id of ids) delete knownKeys[id];

  if (Object.keys(knownKeys).length === 0) deleteConfig('knownKeys');
  else setConfig('knownKeys', knownKeys);
  return ids.length > 0;
}
