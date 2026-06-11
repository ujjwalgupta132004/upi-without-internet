const express = require('express');
const path = require('path');
const { getDb } = require('./config/db');
const serverKey = require('./crypto/serverKeyHolder');
const demoService = require('./services/demoService');
const mesh = require('./services/meshSimulatorService');
const bridge = require('./services/bridgeIngestionService');
const idempotency = require('./services/idempotencyService');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------- Key
app.get('/api/server-key', (req, res) => {
  res.json({
    publicKey: serverKey.getPublicKeyBase64(),
    algorithm: 'RSA-2048 / OAEP-SHA256',
    hybridScheme: 'RSA-OAEP encrypts an AES-256-GCM session key'
  });
});

// ------------------------------------------------------------- Demo
app.post('/api/demo/send', async (req, res) => {
  try {
    const { senderVpa, receiverVpa, amount, pin, ttl, startDevice } = req.body;
    
    const packetTtl = ttl === undefined || ttl === null ? 5 : Number(ttl);
    const targetDevice = startDevice || 'phone-alice';

    const packet = demoService.createPacket(senderVpa, receiverVpa, amount, pin, packetTtl);
    mesh.inject(targetDevice, packet);

    res.json({
      packetId: packet.packetId,
      ciphertextPreview: packet.ciphertext.substring(0, 64) + '...',
      ttl: packet.ttl,
      injectedAt: targetDevice
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------- Mesh Sim
app.get('/api/mesh/state', (req, res) => {
  const deviceData = mesh.getDevices().map(d => ({
    deviceId: d.getDeviceId(),
    hasInternet: d.hasInternet(),
    packetCount: d.packetCount(),
    packetIds: d.getHeldPackets().map(p => p.packetId.substring(0, 8))
  }));

  res.json({
    devices: deviceData,
    idempotencyCacheSize: idempotency.size()
  });
});

app.post('/api/mesh/gossip', (req, res) => {
  const result = mesh.gossipOnce();
  res.json(result);
});

app.post('/api/mesh/flush', async (req, res) => {
  try {
    const uploads = mesh.collectBridgeUploads();
    
    // Execute uploads in parallel to simulate concurrent bridge delivery
    const results = await Promise.all(
      uploads.map(async (up) => {
        const r = await bridge.ingest(up.packet, up.bridgeNodeId, 5 - up.packet.ttl);
        return {
          bridgeNode: up.bridgeNodeId,
          packetId: up.packet.packetId.substring(0, 8),
          outcome: r.outcome,
          reason: r.reason || '',
          transactionId: r.transactionId === null || r.transactionId === undefined ? -1 : r.transactionId
        };
      })
    );

    res.json({
      uploadsAttempted: uploads.length,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mesh/reset', (req, res) => {
  mesh.resetMesh();
  idempotency.clear();
  res.json({ status: 'mesh and idempotency cache cleared' });
});

// ------------------------------------------------------------- Bridge (Ingest)
app.post('/api/bridge/ingest', async (req, res) => {
  try {
    const bridgeNodeId = req.headers['x-bridge-node-id'] || 'unknown';
    const hopCount = Number(req.headers['x-hop-count'] || 0);
    const packet = req.body;

    const result = await bridge.ingest(packet, bridgeNodeId, hopCount);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------- Accounts & Tx
app.get('/api/accounts', async (req, res) => {
  try {
    const db = await getDb();
    const accounts = await db.all('SELECT * FROM accounts');
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const db = await getDb();
    const txs = await db.all('SELECT * FROM transactions ORDER BY id DESC LIMIT 20');
    res.json(txs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve HTML dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Database trigger setup & start server
if (require.main === module) {
  getDb().then(() => {
    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
      console.log(`Open http://localhost:${PORT} in your browser to view the dashboard.`);
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
}

module.exports = app;
