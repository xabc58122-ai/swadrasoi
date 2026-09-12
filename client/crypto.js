// Browser Native Web Crypto Module for E2EE (P-256 ECDH + HKDF + AES-256-GCM)

export class E2EECrypto {
  // 1. Generate identity ECDH P-256 key pair
  static async generateKeyPair() {
    return await window.crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true, // extractable for local IndexedDB persistence
      ['deriveKey', 'deriveBits']
    );
  }

  // 2. Export public key to base64 string
  static async exportPublicKey(key) {
    const raw = await window.crypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(raw);
  }

  // 3. Import peer public key from base64 string
  static async importPublicKey(b64) {
    const raw = this.base64ToArrayBuffer(b64);
    return await window.crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      []
    );
  }

  // 4. Derive shared AES-256-GCM key using ECDH + HKDF SHA-256
  static async deriveSharedKey(myPrivateKey, peerPublicKey) {
    const sharedBits = await window.crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerPublicKey },
      myPrivateKey,
      256
    );

    const hkdfKey = await window.crypto.subtle.importKey(
      'raw',
      sharedBits,
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );

    const salt = new TextEncoder().encode('ZeroKnowledge-E2EE-Salt-v1');
    const info = new TextEncoder().encode('E2EE-AES-GCM-256-Session');

    return await window.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt,
        info: info,
      },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable session key in browser RAM
      ['encrypt', 'decrypt']
    );
  }

  // 5. Encrypt arbitrary Uint8Array or ArrayBuffer with AES-256-GCM
  static async encrypt(aesKey, plaintextBuffer) {
    // 96-bit (12 bytes) cryptographically secure random IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      aesKey,
      plaintextBuffer
    );

    return {
      iv: this.arrayBufferToBase64(iv.buffer),
      ciphertext: this.arrayBufferToBase64(ciphertext),
    };
  }

  // 6. Decrypt ciphertext using AES-256-GCM
  static async decrypt(aesKey, ciphertextB64, ivB64) {
    const iv = this.base64ToArrayBuffer(ivB64);
    const ciphertext = this.base64ToArrayBuffer(ciphertextB64);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      aesKey,
      ciphertext
    );

    return new Uint8Array(decrypted);
  }

  // 7. Compute deterministic Safety Number Fingerprint (Out-of-band verification)
  static async computeSafetyNumber(pubKeyA_b64, pubKeyB_b64) {
    const sorted = [pubKeyA_b64, pubKeyB_b64].sort();
    const concatenated = new TextEncoder().encode(sorted.join('::'));
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', concatenated);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    let digits = '';
    for (let i = 0; i < 6; i++) {
      const chunk =
        (hashArray[i * 4] << 24) |
        (hashArray[i * 4 + 1] << 16) |
        (hashArray[i * 4 + 2] << 8) |
        hashArray[i * 4 + 3];
      const absChunk = Math.abs(chunk) % 100000;
      digits += (i > 0 ? ' ' : '') + String(absChunk).padStart(5, '0');
    }
    return digits;
  }

  // Helpers
  static arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  static base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
