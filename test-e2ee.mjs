import { webcrypto } from 'node:crypto';
const crypto = webcrypto;

// Helper to fill large buffers safely with webcrypto limits
function getLargeRandomValues(size) {
  const buf = new Uint8Array(size);
  const maxChunk = 65536;
  for (let offset = 0; offset < size; offset += maxChunk) {
    const chunkLength = Math.min(maxChunk, size - offset);
    const temp = new Uint8Array(chunkLength);
    crypto.getRandomValues(temp);
    buf.set(temp, offset);
  }
  return buf;
}

// 1. Generate ECDH Key Pair
async function generateIdentityKeyPair() {
  return await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// 2. Export and Import Public Keys
async function exportPublicKey(key) {
  const exported = await crypto.subtle.exportKey('raw', key);
  return Buffer.from(exported).toString('base64');
}

async function importPublicKey(b64) {
  const raw = Buffer.from(b64, 'base64');
  return await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

// 3. Derive Shared AES-256-GCM Key via HKDF
async function deriveSharedKey(myPrivateKey, peerPublicKey) {
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    myPrivateKey,
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
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: info,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// 4. Encrypt Payload with AES-256-GCM (12-byte random IV)
async function encryptData(aesKey, plaintextBytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    aesKey,
    plaintextBytes
  );
  return {
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64'),
  };
}

// 5. Decrypt Payload
async function decryptData(aesKey, ciphertextB64, ivB64) {
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    aesKey,
    ciphertext
  );
  return new Uint8Array(decrypted);
}

// 6. Compute Safety Number Fingerprint (Out-of-band verification)
async function computeSafetyNumber(pubKeyA_b64, pubKeyB_b64) {
  const sorted = [pubKeyA_b64, pubKeyB_b64].sort();
  const concatenated = new TextEncoder().encode(sorted.join('::'));
  const hashBuffer = await crypto.subtle.digest('SHA-256', concatenated);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  let digits = '';
  for (let i = 0; i < 6; i++) {
    const chunk = (hashArray[i * 4] << 24) | (hashArray[i * 4 + 1] << 16) | (hashArray[i * 4 + 2] << 8) | hashArray[i * 4 + 3];
    const absChunk = Math.abs(chunk) % 100000;
    digits += (i > 0 ? ' ' : '') + String(absChunk).padStart(5, '0');
  }
  return digits;
}

// Verification Test Runner
async function runTests() {
  console.log('--- Starting Cryptographic Engine Verification ---');

  const aliceKeyPair = await generateIdentityKeyPair();
  const bobKeyPair = await generateIdentityKeyPair();

  const alicePubB64 = await exportPublicKey(aliceKeyPair.publicKey);
  const bobPubB64 = await exportPublicKey(bobKeyPair.publicKey);

  console.log('[PASS] Generated Alice & Bob ECDH P-256 key pairs.');

  const aliceImportedBobPub = await importPublicKey(bobPubB64);
  const bobImportedAlicePub = await importPublicKey(alicePubB64);

  const aliceSharedKey = await deriveSharedKey(aliceKeyPair.privateKey, aliceImportedBobPub);
  const bobSharedKey = await deriveSharedKey(bobKeyPair.privateKey, bobImportedAlicePub);

  console.log('[PASS] Both parties derived AES-256-GCM keys via HKDF.');

  const aliceSafetyNum = await computeSafetyNumber(alicePubB64, bobPubB64);
  const bobSafetyNum = await computeSafetyNumber(bobPubB64, alicePubB64);
  
  if (aliceSafetyNum !== bobSafetyNum) {
    throw new Error('Safety numbers do not match!');
  }
  console.log(`[PASS] Out-of-band Safety Numbers match identically:\n       ${aliceSafetyNum}`);

  const secretText = 'CONFIDENTIAL: Meeting at safehouse 0900';
  const textBytes = new TextEncoder().encode(secretText);
  const encryptedText = await encryptData(aliceSharedKey, textBytes);
  const decryptedTextBytes = await decryptData(bobSharedKey, encryptedText.ciphertext, encryptedText.iv);
  const decryptedText = new TextDecoder().decode(decryptedTextBytes);

  if (decryptedText !== secretText) {
    throw new Error('Decrypted text does not match original!');
  }
  console.log(`[PASS] Message E2EE round-trip verified: "${decryptedText}"`);

  const fakeImageBytes = getLargeRandomValues(500 * 1024);
  const encryptedImage = await encryptData(aliceSharedKey, fakeImageBytes);
  const decryptedImageBytes = await decryptData(bobSharedKey, encryptedImage.ciphertext, encryptedImage.iv);

  let binaryMatches = true;
  for (let i = 0; i < fakeImageBytes.length; i++) {
    if (fakeImageBytes[i] !== decryptedImageBytes[i]) {
      binaryMatches = false;
      break;
    }
  }
  if (!binaryMatches) {
    throw new Error('Decrypted binary image bytes do not match original!');
  }
  console.log('[PASS] 500KB Binary Image buffer E2EE round-trip verified.');

  const corruptedCiphertext = Buffer.from(encryptedText.ciphertext, 'base64');
  corruptedCiphertext[10] ^= 0x01;
  let tamperCaught = false;
  try {
    await decryptData(bobSharedKey, corruptedCiphertext.toString('base64'), encryptedText.iv);
  } catch (err) {
    tamperCaught = true;
  }

  if (!tamperCaught) {
    throw new Error('FAIL: Tampered ciphertext was accepted without error!');
  }
  console.log('[PASS] Tamper-resistance verified: Authenticated AES-GCM rejects corrupted data.');

  console.log('\n>>> ALL CRYPTOGRAPHIC TESTS PASSED SUCCESSFULLY! <<<');
}

runTests().catch(err => {
  console.error('[FAIL] Cryptographic verification failed:', err);
  process.exit(1);
});
