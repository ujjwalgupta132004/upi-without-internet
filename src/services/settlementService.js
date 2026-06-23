const { getDb } = require('../config/db');

async function settle(instruction, packetHash, bridgeNodeId, hopCount) {
  const db = await getDb();

  await db.run('BEGIN TRANSACTION');

  try {
    const sender = await db.get('SELECT * FROM accounts WHERE vpa = ?', [instruction.senderVpa]);
    if (!sender) {
      throw new Error(`Unknown sender VPA: ${instruction.senderVpa}`);
    }

    const receiver = await db.get('SELECT * FROM accounts WHERE vpa = ?', [instruction.receiverVpa]);
    if (!receiver) {
      throw new Error(`Unknown receiver VPA: ${instruction.receiverVpa}`);
    }

    const amount = Number(instruction.amount);
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    // Check balance
    if (Number(sender.balance) < amount) {
      console.warn(`Insufficient balance: ${sender.vpa} has ₹${sender.balance}, tried to send ₹${amount}`);
      const tx = await recordRejected(db, instruction, packetHash, bridgeNodeId, hopCount);
      await db.run('COMMIT');
      return tx;
    }

    // Calculate new balances
    const newSenderBalance = Number(sender.balance) - amount;
    const newReceiverBalance = Number(receiver.balance) + amount;

    // Update sender with optimistic lock
    const senderUpdate = await db.run(
      'UPDATE accounts SET balance = ?, version = version + 1 WHERE vpa = ? AND version = ?',
      [newSenderBalance, sender.vpa, sender.version]
    );
    if (senderUpdate.changes === 0) {
      throw new Error('OptimisticLockError: Concurrent update detected for sender');
    }

    // Update receiver with optimistic lock
    const receiverUpdate = await db.run(
      'UPDATE accounts SET balance = ?, version = version + 1 WHERE vpa = ? AND version = ?',
      [newReceiverBalance, receiver.vpa, receiver.version]
    );
    if (receiverUpdate.changes === 0) {
      throw new Error('OptimisticLockError: Concurrent update detected for receiver');
    }

    // Create settled transaction
    const settledAt = Date.now();
    const txResult = await db.run(
      `INSERT INTO transactions 
       (packetHash, senderVpa, receiverVpa, amount, signedAt, settledAt, bridgeNodeId, hopCount, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SETTLED')`,
      [
        packetHash,
        instruction.senderVpa,
        instruction.receiverVpa,
        amount,
        instruction.signedAt,
        settledAt,
        bridgeNodeId,
        hopCount
      ]
    );

    const tx = {
      id: txResult.lastID,
      packetHash,
      senderVpa: instruction.senderVpa,
      receiverVpa: instruction.receiverVpa,
      amount,
      signedAt: instruction.signedAt,
      settledAt: settledAt,
      bridgeNodeId,
      hopCount,
      status: 'SETTLED'
    };

    await db.run('COMMIT');
    console.log(`SETTLED ₹${amount} from ${sender.vpa} to ${receiver.vpa} (packetHash=${packetHash.substring(0, 12)}..., bridge=${bridgeNodeId}, hops=${hopCount})`);
    return tx;
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }
}

async function recordRejected(db, instruction, packetHash, bridgeNodeId, hopCount) {
  const settledAt = Date.now();
  const txResult = await db.run(
    `INSERT INTO transactions 
     (packetHash, senderVpa, receiverVpa, amount, signedAt, settledAt, bridgeNodeId, hopCount, status) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REJECTED')`,
    [
      packetHash,
      instruction.senderVpa,
      instruction.receiverVpa,
      Number(instruction.amount),
      instruction.signedAt,
      settledAt,
      bridgeNodeId,
      hopCount
    ]
  );

  return {
    id: txResult.lastID,
    packetHash,
    senderVpa: instruction.senderVpa,
    receiverVpa: instruction.receiverVpa,
    amount: Number(instruction.amount),
    signedAt: instruction.signedAt,
    settledAt: settledAt,
    bridgeNodeId,
    hopCount,
    status: 'REJECTED'
  };
}

module.exports = {
  settle
};
