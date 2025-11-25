// backend/services/crypto.js
const { webcrypto } = require('crypto');

const encoder = new TextEncoder();

async function deriveKey(passphrase, salt = 'veilfi-user-salt') {
  const keyMaterial = await webcrypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptSecret(secretUint8, passphrase, salt = 'veilfi-user-salt') {
  const key = await deriveKey(passphrase, salt);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, secretUint8);
  return { ciphertext: Buffer.from(ct).toString('base64'), iv: Buffer.from(iv).toString('base64'), salt };
}

async function decryptSecret(ciphertext_b64, iv_b64, passphrase, salt = 'veilfi-user-salt') {
  const key = await deriveKey(passphrase, salt);
  const ct = Buffer.from(ciphertext_b64, 'base64');
  const iv = Buffer.from(iv_b64, 'base64');
  const pt = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new Uint8Array(pt);
}

module.exports = { encryptSecret, decryptSecret };
