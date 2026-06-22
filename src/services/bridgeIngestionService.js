const crypto = require('../crypto/hybridCryptoService');
const idempotency = require('./idempotencyService');
const settlement = require('./settlementService');

let maxAgeSeconds = 86400; // 24 hours default

async function ingest(packet, bridgeNodeId, hopCount) {
  try {
    const packetHash = crypto.hashCiphertext(packet.ciphertext);

    // 1. Idempotency Gate
    if (!idempotency.claim(packetHash)) {
      console.log(`DUPLICATE packet ${packetHash.substring(0, 12)}... from bridge ${bridgeNodeId} — dropped`);
      return {
        outcome: 'DUPLICATE_DROPPED',
        packetHash,
        reason: null,
        transactionId: null
      };
    }

    // 2. Decrypt Ciphertext
    let instruction;
    try {
      instruction = crypto.decrypt(packet.ciphertext);
    } catch (err) {
      console.warn(`Decryption failed for packet ${packetHash.substring(0, 12)}...: ${err.message}`);
      return {
        outcome: 'INVALID',
        packetHash,
        reason: 'decryption_failed',
        transactionId: null
      };
    }

    // 3. Freshness Check (replay protection)
    const ageSeconds = (Date.now() - instruction.signedAt) / 1000;
    if (ageSeconds > maxAgeSeconds) {
      console.warn(`Packet ${packetHash.substring(0, 12)}... too old (${ageSeconds.toFixed(1)}s), rejected`);
      return {
        outcome: 'INVALID',
        packetHash,
        reason: 'stale_packet',
        transactionId: null
      };
    }
    if (ageSeconds < -300) { // clock skew tolerance
      console.warn(`Packet ${packetHash.substring(0, 12)}... is future-dated (${ageSeconds.toFixed(1)}s), rejected`);
      return {
        outcome: 'INVALID',
        packetHash,
        reason: 'future_dated',
        transactionId: null
      };
    }

    // 4. Settle Transaction
    const tx = await settlement.settle(instruction, packetHash, bridgeNodeId, hopCount);
    return {
      outcome: 'SETTLED',
      packetHash,
      reason: null,
      transactionId: tx.id
    };

  } catch (err) {
    console.error(`Ingestion error: ${err.message}`, err);
    return {
      outcome: 'INVALID',
      packetHash: '?',
      reason: `internal_error: ${err.message}`,
      transactionId: null
    };
  }
}

function setMaxAgeSeconds(seconds) {
  maxAgeSeconds = seconds;
}

module.exports = {
  ingest,
  setMaxAgeSeconds
};
