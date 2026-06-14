const crypto = require('crypto');

let publicKey = null;
let privateKey = null;
let publicKeyBase64 = null;

function init() {
  const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  publicKey = pub;
  privateKey = priv;
  // Export to SPKI DER base64 to match Java's getEncoded() format exactly.
  publicKeyBase64 = publicKey.export({
    type: 'spki',
    format: 'der'
  }).toString('base64');
  console.log(`Server RSA keypair generated (2048-bit). Public key fingerprint: ${publicKeyBase64.substring(0, 32)}...`);
}

// Initialize on start
init();

module.exports = {
  getPublicKey: () => publicKey,
  getPrivateKey: () => privateKey,
  getPublicKeyBase64: () => publicKeyBase64,
  init
};
