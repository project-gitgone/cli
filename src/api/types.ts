import type { EncryptedSnapshot, KdfParams } from '@/lib/crypto.js';

export type AuthUser = {
  id?: string;
  email: string;
  full_name?: string;
  publicKey?: string | null;
  encryptedPrivateKey?: string | null;
  keySalt?: string | null;
  keyEncryptionAlgo?: string | null;
  cryptoVersion?: number;
  kdfParams?: KdfParams | null;
};

export type AuthResult = { token: { token: string }; user: AuthUser };

export type Prelogin = { cryptoVersion: 1 } | { cryptoVersion: 2; kdf: KdfParams };

export type MyTeam = { id: string; name: string; role: 'OWNER' | 'MEMBER'; roleId: string; roleKey: string | null; roleName: string };

export type Me = {
  user: { id: string; email: string; fullName: string; publicKey: string | null };
  instanceRole: { id: string; key: string | null; name: string } | null;
  permissions: string[];
  teams: MyTeam[];
};

export type User = {
  id: string;
  email: string;
  fullName: string;
  instanceRole?: { roleId: string; role?: { name: string } } | null;
};

export type Paginated<T> = { meta: { total: number; currentPage: number; lastPage: number }; data: T[] };

export type Activation = { activationCode: string; activationExpiresAt: string };

export type Team = { id: string; name: string };

export type Project = {
  id: string;
  name: string;
  teamId: string;
  disallowPull: boolean;
  keyVersion: number;
  team?: Team;
};

export type Member = {
  userId: string;
  roleId: string;
  role: string;
  roleKey: string | null;
  source?: 'team' | 'project';
  user: { id: string; email: string; fullName: string };
};

export type KeysToRotate = {
  projectsToRotate?: { id: string; name: string }[];
  environmentsToRotate?: { projectId: string; projectName: string; environment: string }[];
};

export type Recipient = { id: string; email: string; fullName?: string; publicKey: string };

export type HistoryEntry = {
  id: string;
  version: number;
  createdAt: string;
  creator?: { fullName: string } | null;
};

export type StoredSnapshot = EncryptedSnapshot & { id: string; version: number };

export type ProjectToken = {
  id: string;
  name: string;
  environment: string;
  cryptoVersion: number;
  expiresAt: string | null;
};

export type AuditEvent = {
  createdAt: string;
  actorLabel: string;
  action: string;
  environment: string | null;
};

export type Health = { initialized: boolean };

export type Capabilities = { version: string; features: string[] };

export type TimelineAuthor = { type: 'user' | 'token'; label: string };

export type TimelineEvent =
  | {
      type: 'version';
      id: string;
      environment: string;
      version: number;
      keyVersion: number;
      rollbackOf: number | null;
      author: TimelineAuthor;
      createdAt: string;
    }
  | { type: 'rotation'; environment: string | null; keyVersion: number | null; author: TimelineAuthor; createdAt: string }
  | { type: 'environment'; environment: string; author: TimelineAuthor; createdAt: string };

export type Timeline = { environments: string[]; events: TimelineEvent[]; nextBefore: string | null };
