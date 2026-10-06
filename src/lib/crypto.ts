import crypto from 'node:crypto';

const VAULT_ALGO = 'aes-256-gcm';
const SECRET_ALGO = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha256';

export type KeyPair = {
  publicKey: string;
  privateKey: string;
};

export const generateKeyPair = (): KeyPair => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { publicKey, privateKey };
};

const deriveKeyFromPassphrase = (passphrase: string, salt: string): Buffer => {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
};

export const encryptVault = (privateKey: string, passphrase: string) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = deriveKeyFromPassphrase(passphrase, salt);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv(VAULT_ALGO, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedPrivateKey: `${iv.toString('hex')}:${authTag}:${encrypted}`,
    salt,
    algo: VAULT_ALGO,
  };
};

export const decryptVault = (encryptedBundle: string, passphrase: string, salt: string) => {
  const [ivHex, authTagHex, encryptedHex] = encryptedBundle.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Invalid vault format');

  const key = deriveKeyFromPassphrase(passphrase, salt);
  const decipher = crypto.createDecipheriv(VAULT_ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

export const encryptProjectKeyForUser = (projectKey: string, recipientPublicKeyPem: string) => {
  const buffer = Buffer.from(projectKey, 'utf8');
  const encrypted = crypto.publicEncrypt(
    {
      key: recipientPublicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    buffer
  );
  return encrypted.toString('base64');
};

export const decryptProjectKey = (encryptedProjectKeyBase64: string, privateKeyPem: string) => {
  const buffer = Buffer.from(encryptedProjectKeyBase64, 'base64');
  const decrypted = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    buffer
  );
  return decrypted.toString('utf8');
};

export const generateProjectKey = () => crypto.randomBytes(32).toString('base64url');

export const publicKeyFingerprint = (publicKeyPem: string) => {
  const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  const hex = crypto.createHash('sha256').update(der).digest('hex').toUpperCase();
  return hex.match(/.{4}/g)!.join(' ');
};

export const encryptSecret = (text: string, projectKey: string) => {
  const key = crypto.createHash('sha256').update(projectKey).digest();

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(SECRET_ALGO, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag,
  };
};

export type KdfParams = {
  algo: 'scrypt';
  salt: string;
  N: number;
  r: number;
  p: number;
};

const ACCOUNT_AUTH_INFO = 'gitgone/v2/auth';
const ACCOUNT_VAULT_INFO = 'gitgone/v2/vault';
const VAULT_V2_AAD = Buffer.from('gitgone/v2/vault');
const MIN_KDF = { N: 2 ** 17, r: 8, p: 1, saltBytes: 16 };
const MAX_KDF = { N: 2 ** 20, r: 16, p: 4 };

export const createKdfParams = (): KdfParams => ({
  algo: 'scrypt',
  salt: crypto.randomBytes(MIN_KDF.saltBytes).toString('base64'),
  N: MIN_KDF.N,
  r: MIN_KDF.r,
  p: MIN_KDF.p,
});

export const assertKdfParams = (kdf: KdfParams) => {
  const isInt = (value: unknown) => Number.isInteger(value);
  if (
    !kdf ||
    kdf.algo !== 'scrypt' ||
    !isInt(kdf.N) || kdf.N < MIN_KDF.N || kdf.N > MAX_KDF.N ||
    !isInt(kdf.r) || kdf.r < MIN_KDF.r || kdf.r > MAX_KDF.r ||
    !isInt(kdf.p) || kdf.p < MIN_KDF.p || kdf.p > MAX_KDF.p ||
    Buffer.from(kdf.salt ?? '', 'base64').length < MIN_KDF.saltBytes
  ) {
    throw new Error('The server sent unsafe key derivation parameters. Aborting.');
  }
};

export const deriveAccountKeys = (password: string, kdf: KdfParams) => {
  assertKdfParams(kdf);
  const masterKey = crypto.scryptSync(
    password.normalize('NFKC'),
    Buffer.from(kdf.salt, 'base64'),
    32,
    { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * kdf.N * kdf.r },
  );
  const derive = (info: string) =>
    Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), info, 32));

  return {
    authKey: derive(ACCOUNT_AUTH_INFO).toString('base64url'),
    vaultKey: derive(ACCOUNT_VAULT_INFO),
  };
};

export const encryptVaultV2 = (privateKey: string, vaultKey: Buffer) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(VAULT_ALGO, vaultKey, iv);
  cipher.setAAD(VAULT_V2_AAD);

  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

export const decryptVaultV2 = (encryptedBundle: string, vaultKey: Buffer) => {
  const [ivHex, authTagHex, encryptedHex] = encryptedBundle.split(':');
  if (!ivHex || !authTagHex || !encryptedHex) throw new Error('Invalid vault format');

  const decipher = crypto.createDecipheriv(VAULT_ALGO, vaultKey, Buffer.from(ivHex, 'hex'));
  decipher.setAAD(VAULT_V2_AAD);
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

const TOKEN_AUTH_INFO = 'gitgone/v2/token-auth';
const TOKEN_ENC_INFO = 'gitgone/v2/token-enc';
const TOKEN_WRAP_AAD = Buffer.from('gitgone/v2/token-project-key');

export const generateTokenSecret = () => crypto.randomBytes(32).toString('base64url');

export const deriveTokenKeys = (tokenSecret: string) => {
  const ikm = Buffer.from(tokenSecret, 'base64url');
  const derive = (info: string) =>
    Buffer.from(crypto.hkdfSync('sha256', ikm, Buffer.alloc(0), info, 32));

  return {
    authVerifier: derive(TOKEN_AUTH_INFO).toString('base64url'),
    encryptionKey: derive(TOKEN_ENC_INFO),
  };
};

export const encryptWithTokenV2 = (text: string, tokenSecret: string) => {
  const { encryptionKey } = deriveTokenKeys(tokenSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(SECRET_ALGO, encryptionKey, iv);
  cipher.setAAD(TOKEN_WRAP_AAD);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
};

export const decryptSecret = (ciphertext: string, iv: string, authTag: string, projectKey: string) => {
  const key = crypto.createHash('sha256').update(projectKey).digest();

  const decipher = crypto.createDecipheriv(SECRET_ALGO, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

export type SnapshotContext = { projectId: string; environment: string; version: number };

export type EncryptedSnapshot = {
  ciphertext: string;
  iv: string;
  tag: string;
  version: number;
  cryptoVersion?: number;
};

const SNAPSHOT_INFO = 'gitgone/v2/snapshot';

const snapshotKey = (projectKey: string) =>
  Buffer.from(crypto.hkdfSync('sha256', Buffer.from(projectKey, 'utf8'), Buffer.alloc(0), SNAPSHOT_INFO, 32));

const snapshotAad = ({ projectId, environment, version }: SnapshotContext) =>
  Buffer.from(`${SNAPSHOT_INFO}|${projectId}|${environment}|${version}`);

export const encryptSnapshot = (text: string, projectKey: string, context: SnapshotContext) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(SECRET_ALGO, snapshotKey(projectKey), iv);
  cipher.setAAD(snapshotAad(context));

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
};

export const decryptSnapshot = (
  snapshot: EncryptedSnapshot,
  projectKey: string,
  expected: { projectId: string; environment: string },
) => {
  if (snapshot.cryptoVersion !== 2) {
    return decryptSecret(snapshot.ciphertext, snapshot.iv, snapshot.tag, projectKey);
  }

  const decipher = crypto.createDecipheriv(SECRET_ALGO, snapshotKey(projectKey), Buffer.from(snapshot.iv, 'hex'));
  decipher.setAAD(snapshotAad({ ...expected, version: snapshot.version }));
  decipher.setAuthTag(Buffer.from(snapshot.tag, 'hex'));

  let decrypted = decipher.update(snapshot.ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};
