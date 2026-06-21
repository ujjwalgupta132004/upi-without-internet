const VirtualDevice = require('./virtualDevice');

const devices = new Map();

function seedDefaultDevices() {
  devices.set('phone-alice', new VirtualDevice('phone-alice', false));
  devices.set('phone-stranger1', new VirtualDevice('phone-stranger1', false));
  devices.set('phone-stranger2', new VirtualDevice('phone-stranger2', false));
  devices.set('phone-stranger3', new VirtualDevice('phone-stranger3', false));
  devices.set('phone-bridge', new VirtualDevice('phone-bridge', true));
}

// Seed on startup
seedDefaultDevices();

function getDevices() {
  return Array.from(devices.values());
}

function getDevice(id) {
  return devices.get(id);
}

function inject(senderDeviceId, packet) {
  const sender = devices.get(senderDeviceId);
  if (!sender) {
    throw new Error(`Unknown device: ${senderDeviceId}`);
  }
  sender.hold(packet);
  console.log(`Packet ${packet.packetId.substring(0, 8)} injected at ${senderDeviceId} (TTL=${packet.ttl})`);
}

function gossipOnce() {
  let transfers = 0;
  const deviceList = getDevices();

  // Snapshot what each device holds at the start of this round
  const snapshot = new Map();
  for (const d of deviceList) {
    snapshot.set(d.getDeviceId(), d.getHeldPackets());
  }

  for (const src of deviceList) {
    const srcPackets = snapshot.get(src.getDeviceId()) || [];
    for (const pkt of srcPackets) {
      if (pkt.ttl <= 0) continue;

      for (const dst of deviceList) {
        if (dst.getDeviceId() === src.getDeviceId()) continue;
        if (dst.holds(pkt.packetId)) continue;

        // Gossip packet with decremented TTL
        const copy = {
          packetId: pkt.packetId,
          ttl: pkt.ttl - 1,
          createdAt: pkt.createdAt,
          ciphertext: pkt.ciphertext
        };
        
        dst.hold(copy);
        transfers++;
      }
    }
  }

  console.log(`Gossip round complete: ${transfers} packet transfers`);
  return {
    transfers,
    deviceCounts: snapshotMap()
  };
}

function snapshotMap() {
  const m = {};
  for (const d of getDevices()) {
    m[d.getDeviceId()] = d.packetCount();
  }
  return m;
}

function collectBridgeUploads() {
  const uploads = [];
  for (const d of getDevices()) {
    if (!d.hasInternet()) continue;
    for (const pkt of d.getHeldPackets()) {
      uploads.push({
        bridgeNodeId: d.getDeviceId(),
        packet: pkt
      });
    }
  }
  return uploads;
}

function resetMesh() {
  for (const d of getDevices()) {
    d.clear();
  }
  console.log('Mesh simulation reset.');
}

module.exports = {
  getDevices,
  getDevice,
  inject,
  gossipOnce,
  snapshotMap,
  collectBridgeUploads,
  resetMesh
};
