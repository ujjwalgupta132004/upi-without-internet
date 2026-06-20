const crypto = require('crypto');
const serverKey = require('../crypto/serverKeyHolder');
const hybridCrypto = require('../crypto/hybridCryptoService');

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Simulates the sender's phone.
 * Encrypts a payment instruction into a MeshPacket.
 */
function createPacket(senderVpa, receiverVpa, amount, pin, ttl) {
  const instruction = {
    senderVpa,
    receiverVpa,
    amount: Number(amount),
    pinHash: sha256Hex(pin),
    nonce: crypto.randomUUID(), // Native since Node.js 15.6
    signedAt: Date.now()
  };

  const ciphertext = hybridCrypto.encrypt(instruction, serverKey.getPublicKey());

  return {
    packetId: crypto.randomUUID(),
    ttl: Number(ttl),
    createdAt: Date.now(),
    ciphertext: ciphertext
  };
}

module.exports = {
  createPacket
};
