class VirtualDevice {
  constructor(deviceId, hasInternet) {
    this.deviceId = deviceId;
    this.hasInternet = hasInternet;
    this.heldPackets = new Map(); // packetId -> packet
  }

  getDeviceId() {
    return this.deviceId;
  }

  hasInternet() {
    return this.hasInternet;
  }

  hold(packet) {
    if (!this.heldPackets.has(packet.packetId)) {
      this.heldPackets.set(packet.packetId, packet);
    }
  }

  getHeldPackets() {
    return Array.from(this.heldPackets.values());
  }

  holds(packetId) {
    return this.heldPackets.has(packetId);
  }

  packetCount() {
    return this.heldPackets.size;
  }

  clear() {
    this.heldPackets.clear();
  }
}

module.exports = VirtualDevice;
