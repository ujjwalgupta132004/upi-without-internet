const seen = new Map();
let ttlSeconds = 86400; // 24 hours default

function claim(packetHash) {
  const now = Date.now();
  if (seen.has(packetHash)) {
    return false;
  }
  seen.set(packetHash, now);
  return true;
}

function size() {
  return seen.size;
}

function evictExpired() {
  const cutoff = Date.now() - (ttlSeconds * 1000);
  for (const [hash, timestamp] of seen.entries()) {
    if (timestamp < cutoff) {
      seen.delete(hash);
    }
  }
}

// Periodically run eviction every 60 seconds (like Spring's @Scheduled)
const interval = setInterval(evictExpired, 60000);
if (interval.unref) {
  interval.unref(); // Prevent hanging the process in tests
}

function clear() {
  seen.clear();
}

function setTtlSeconds(seconds) {
  ttlSeconds = seconds;
}

module.exports = {
  claim,
  size,
  clear,
  setTtlSeconds,
  evictExpired
};
