const { getDb } = require('../src/config/db');
const idempotency = require('../src/services/idempotencyService');
const demoService = require('../src/services/demoService');
const bridge = require('../src/services/bridgeIngestionService');
const serverKey = require('../src/crypto/serverKeyHolder');
const hybridCrypto = require('../src/crypto/hybridCryptoService');

describe('Idempotency and Concurrency Tests', () => {
  let db;

  beforeAll(async () => {
    db = await getDb();
  });

  beforeEach(async () => {
    idempotency.clear();
    // Reset database state to clear any modifications between runs
    await db.run("UPDATE accounts SET balance = 5000.00, version = 1 WHERE vpa = 'alice@demo'");
    await db.run("UPDATE accounts SET balance = 1000.00, version = 1 WHERE vpa = 'bob@demo'");
    await db.run("DELETE FROM transactions");
  });

  test('Encrypt Decrypt Round Trip', () => {
    const original = {
      senderVpa: 'alice@demo',
      receiverVpa: 'bob@demo',
      amount: 123.45,
      pinHash: 'abcdef',
      nonce: 'nonce-1',
      signedAt: Date.now()
    };

    const ct = hybridCrypto.encrypt(original, serverKey.getPublicKey());
    const decrypted = hybridCrypto.decrypt(ct);

    expect(decrypted.senderVpa).toBe(original.senderVpa);
    expect(decrypted.receiverVpa).toBe(original.receiverVpa);
    expect(decrypted.amount).toBe(original.amount);
    expect(decrypted.nonce).toBe(original.nonce);
    expect(decrypted.pinHash).toBe(original.pinHash);
  });

  test('Tampered Ciphertext is Rejected', async () => {
    const packet = demoService.createPacket('alice@demo', 'bob@demo', 50.00, '1234', 5);

    // Modify a character in the ciphertext base64
    const chars = packet.ciphertext.split('');
    const mid = Math.floor(chars.length / 2);
    chars[mid] = chars[mid] === 'A' ? 'B' : 'A';
    packet.ciphertext = chars.join('');

    const res = await bridge.ingest(packet, 'bridge-x', 1);
    expect(res.outcome).toBe('INVALID');
    expect(res.reason).toBe('decryption_failed');
  });

  test('Single Packet Delivered by Three Bridges Settles Exactly Once', async () => {
    // Capture starting balances
    const aliceRow = await db.get("SELECT balance FROM accounts WHERE vpa = 'alice@demo'");
    const bobRow = await db.get("SELECT balance FROM accounts WHERE vpa = 'bob@demo'");
    
    const aliceBefore = Number(aliceRow.balance);
    const bobBefore = Number(bobRow.balance);

    const packet = demoService.createPacket('alice@demo', 'bob@demo', 100.00, '1234', 5);

    // Concurrently ingest the packet through 3 different bridge nodes
    const results = await Promise.all([
      bridge.ingest(packet, 'bridge-0', 3),
      bridge.ingest(packet, 'bridge-1', 3),
      bridge.ingest(packet, 'bridge-2', 3)
    ]);

    let settledCount = 0;
    let duplicateCount = 0;

    for (const r of results) {
      if (r.outcome === 'SETTLED') settledCount++;
      else if (r.outcome === 'DUPLICATE_DROPPED') duplicateCount++;
    }

    expect(settledCount).toBe(1);
    expect(duplicateCount).toBe(2);

    // Assert balances moved exactly once
    const aliceAfterRow = await db.get("SELECT balance FROM accounts WHERE vpa = 'alice@demo'");
    const bobAfterRow = await db.get("SELECT balance FROM accounts WHERE vpa = 'bob@demo'");

    expect(Number(aliceAfterRow.balance)).toBe(aliceBefore - 100.00);
    expect(Number(bobAfterRow.balance)).toBe(bobBefore + 100.00);
  });
});
