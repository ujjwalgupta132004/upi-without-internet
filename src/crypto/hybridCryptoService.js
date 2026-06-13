const crypto = require('crypto');
const serverKey = require('./serverKeyHolder');

const RSA_ENCRYPTED_KEY_BYTES = 256; // 2048-bit RSA key size
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

/**
 * Hybrid encryption - RSA-OAEP + AES-256-GCM
 * Wire format: [RSA Encrypted AES Key (256B)][GCM IV (12B)][AES Ciphertext][GCM Tag (16B)]
 */
function encrypt(instruction, publicKey) {
  const plaintext = Buffer.from(JSON.stringify(instruction), 'utf8');

  // 1. Generate one-time AES key (256-bit)
  const aesKey = crypto.randomBytes(32);

  // 2. AES-GCM encrypt
  const iv = crypto.randomBytes(GCM_IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag(); // 16 bytes

  // 3. RSA-OAEP encrypt the AES key
  const encryptedAesKey = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
      mgf1Hash: 'sha256'
    },
    aesKey
  );

  // 4. Pack into single buffer
  const packed = Buffer.concat([encryptedAesKey, iv, ciphertext, tag]);
  return packed.toString('base64');
}

/**
 * Decrypt using server's private key
 */
function decrypt(base64Ciphertext) {
  const all = Buffer.from(base64Ciphertext, 'base64');

  if (all.length < RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES + GCM_TAG_BYTES) {
    throw new Error('Ciphertext too short');
  }

  // Unpack
  const encryptedAesKey = all.subarray(0, RSA_ENCRYPTED_KEY_BYTES);
  const iv = all.subarray(RSA_ENCRYPTED_KEY_BYTES, RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES);
  const aesCiphertextWithTag = all.subarray(RSA_ENCRYPTED_KEY_BYTES + GCM_IV_BYTES);

  const ciphertext = aesCiphertextWithTag.subarray(0, aesCiphertextWithTag.length - GCM_TAG_BYTES);
  const tag = aesCiphertextWithTag.subarray(aesCiphertextWithTag.length - GCM_TAG_BYTES);

  // 1. RSA-decrypt the AES key
  const aesKey = crypto.privateDecrypt(
    {
      key: serverKey.getPrivateKey(),
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
      mgf1Hash: 'sha256'
    },
    encryptedAesKey
  );

  // 2. AES-GCM decrypt and verify tag
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAuthTag(tag);
  
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

/**
 * SHA-256 Hex of the ciphertext
 */
function hashCiphertext(base64Ciphertext) {
  return crypto.createHash('sha256').update(base64Ciphertext, 'utf8').digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  hashCiphertext
};
