import WebSocket from './server/node_modules/ws/index.js';
import { webcrypto } from 'node:crypto';
const crypto = webcrypto;

const RELAY_URL = 'ws://localhost:8443';
const TOKEN_ALICE = 'zk_auth_alice_98f4c1e2b5d7a8904321fedcba654321';
const TOKEN_BOB = 'zk_auth_bob_12a3b4c5d6e7f89012345678abcdef01';

async function generateKeyPair() {
  return await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

async function exportPubKey(key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return Buffer.from(raw).toString('base64');
}

async function importPubKey(b64) {
  const raw = Buffer.from(b64, 'base64');
  return await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

async function deriveAesKey(myPriv, peerPub) {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPub },
    myPriv,
    256
  );
  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );
  const salt = new TextEncoder().encode('ZeroKnowledge-E2EE-Salt-v1');
  const info = new TextEncoder().encode('E2EE-AES-GCM-256-Session');
  return await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(key, buffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    buffer
  );
  return {
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64'),
  };
}

async function decrypt(key, ciphertextB64, ivB64) {
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new Uint8Array(dec);
}

async function testRelayFlow() {
  console.log('--- Starting Integration Test: 2 Simulated Clients over Zero-Knowledge Relay ---');

  const aliceKeys = await generateKeyPair();
  const bobKeys = await generateKeyPair();

  const alicePubB64 = await exportPubKey(aliceKeys.publicKey);
  const bobPubB64 = await exportPubKey(bobKeys.publicKey);

  let aliceSharedKey = null;
  let bobSharedKey = null;

  return new Promise((resolve, reject) => {
    const wsAlice = new WebSocket(`${RELAY_URL}/ws?token=${TOKEN_ALICE}`);
    const wsBob = new WebSocket(`${RELAY_URL}/ws?token=${TOKEN_BOB}`);

    let testCompleted = false;

    wsAlice.on('open', () => {
      console.log('[CLIENT A] Connected to relay.');
      wsAlice.send(JSON.stringify({ type: 'crypto:key_exchange', pubKey: alicePubB64 }));
    });

    wsBob.on('open', () => {
      console.log('[CLIENT B] Connected to relay.');
      wsBob.send(JSON.stringify({ type: 'crypto:key_exchange', pubKey: bobPubB64 }));
    });

    wsAlice.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'crypto:key_exchange') {
        const peerPub = await importPubKey(msg.pubKey);
        aliceSharedKey = await deriveAesKey(aliceKeys.privateKey, peerPub);
        console.log('[CLIENT A] Successfully derived shared AES-GCM session key.');

        const secretMessage = 'TOP-SECRET-DATA-ONLY-FOR-BOB';
        const enc = await encrypt(aliceSharedKey, new TextEncoder().encode(secretMessage));
        wsAlice.send(JSON.stringify({
          type: 'e2ee:message',
          contentType: 'text',
          iv: enc.iv,
          ciphertext: enc.ciphertext,
          timestamp: Date.now()
        }));
      }
    });

    wsBob.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'crypto:key_exchange') {
        const peerPub = await importPubKey(msg.pubKey);
        bobSharedKey = await deriveAesKey(bobKeys.privateKey, peerPub);
        console.log('[CLIENT B] Successfully derived shared AES-GCM session key.');
        wsBob.send(JSON.stringify({ type: 'crypto:key_exchange', pubKey: bobPubB64 }));
      } else if (msg.type === 'e2ee:message') {
        console.log('[CLIENT B] Received encrypted message packet from relay.');
        const decrypted = await decrypt(bobSharedKey, msg.ciphertext, msg.iv);
        const text = new TextDecoder().decode(decrypted);
        console.log(`[CLIENT B] Decrypted plaintext: "${text}"`);

        if (text === 'TOP-SECRET-DATA-ONLY-FOR-BOB') {
          console.log('[SUCCESS] End-to-end encryption & relay verified perfectly!');
          testCompleted = true;
          wsAlice.close();
          wsBob.close();
          resolve();
        } else {
          reject(new Error('Decrypted text mismatch'));
        }
      }
    });

    setTimeout(() => {
      if (!testCompleted) {
        wsAlice.terminate();
        wsBob.terminate();
        reject(new Error('Test timed out after 10 seconds'));
      }
    }, 10000);
  });
}

testRelayFlow().catch((err) => {
  console.error('[TEST FAILURE]:', err);
  process.exit(1);
});
