import crypto from 'node:crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

/**
 * Encrypt a plaintext string using AES-256-GCM
 * Returns base64-encoded result containing: IV + ciphertext + authTag
 */
export function encryptSecret(plaintext: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }

  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 256-bit (32 bytes). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');

  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, Buffer.from(ciphertext, 'hex'), authTag]);

  return combined.toString('base64');
}

/**
 * Decrypt a base64-encoded secret encrypted with encryptSecret
 * Extracts: IV (16 bytes) + ciphertext + authTag (16 bytes)
 */
export function decryptSecret(encrypted: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }

  const key = Buffer.from(ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 256-bit (32 bytes)');
  }

  const combined = Buffer.from(encrypted, 'base64');

  // Extract components: IV (16) + ciphertext + authTag (16)
  const iv = combined.slice(0, 16);
  const authTag = combined.slice(-16);
  const ciphertext = combined.slice(16, -16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}
