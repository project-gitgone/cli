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
  const iv = crypto.randomBytes(12); // GCM standard IV size

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

export const generateProjectKey = () => {
    return crypto.randomBytes(32).toString('hex').slice(0, 32);
}

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

export const decryptSecret = (ciphertext: string, iv: string, authTag: string, projectKey: string) => {
  const key = crypto.createHash('sha256').update(projectKey).digest();
  
  const decipher = crypto.createDecipheriv(SECRET_ALGO, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};
