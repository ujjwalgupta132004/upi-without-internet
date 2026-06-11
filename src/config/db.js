const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');

let dbConnection = null;

async function getDb() {
  if (dbConnection) {
    return dbConnection;
  }

  // Open in-memory database
  dbConnection = await sqlite.open({
    filename: ':memory:',
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await dbConnection.run('PRAGMA foreign_keys = ON');

  // Create tables
  await dbConnection.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      vpa TEXT PRIMARY KEY,
      holderName TEXT NOT NULL,
      balance DECIMAL(19, 2) NOT NULL,
      version INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      packetHash TEXT NOT NULL UNIQUE,
      senderVpa TEXT NOT NULL,
      receiverVpa TEXT NOT NULL,
      amount DECIMAL(19, 2) NOT NULL,
      signedAt INTEGER NOT NULL,
      settledAt INTEGER NOT NULL,
      bridgeNodeId TEXT NOT NULL,
      hopCount INTEGER NOT NULL,
      status TEXT NOT NULL
    );
  `);

  // Seed default accounts
  await seedAccounts(dbConnection);

  return dbConnection;
}

async function seedAccounts(db) {
  const countObj = await db.get('SELECT COUNT(*) as count FROM accounts');
  if (countObj.count === 0) {
    const seedData = [
      ['alice@demo', 'Alice', 5000.00],
      ['bob@demo', 'Bob', 1000.00],
      ['carol@demo', 'Carol', 2500.00],
      ['dave@demo', 'Dave', 500.00]
    ];

    const stmt = await db.prepare('INSERT INTO accounts (vpa, holderName, balance, version) VALUES (?, ?, ?, 1)');
    for (const row of seedData) {
      await stmt.run(row);
    }
    await stmt.finalize();
    console.log('Seeded 4 demo accounts into database.');
  }
}

module.exports = {
  getDb
};
