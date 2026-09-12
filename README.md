# Zero-Knowledge 2-Person Private E2EE Chat & Media App

An ultra-secure, zero-knowledge, end-to-end encrypted web application designed strictly for two users exchanging sensitive messages and media.

---

## 🛡️ Security Architecture

### 1. Zero-Knowledge Relay
- **Zero Disk Writes**: The server never writes a single byte of chat messages or media to disk or database. Packets are streamed strictly in volatile RAM between the two sockets.
- **Blind Forwarding**: The relay does not possess decryption keys and cannot read or parse payloads.
- **Strict Authentication**: Only 2 pre-configured 256-bit bearer tokens can establish connections. Unauthenticated requests are terminated immediately.

### 2. Cryptographic Specifications
- **Key Agreement**: ECDH (Elliptic Curve Diffie-Hellman) over NIST P-256 curve (`SubtleCrypto`).
- **Key Derivation**: HKDF (HMAC-based Extract-and-Expand) with SHA-256 and unique domain separation.
- **Symmetric Cipher**: Authenticated **AES-256-GCM**.
- **IV/Nonce**: Cryptographically random 96-bit (12-byte) initialization vector generated per message/image.
- **Tamper Resistance**: Modifying even 1 bit in transit fails AES-GCM tag verification and drops the packet.
- **Safety Fingerprints**: SHA-256 deterministic out-of-band numeric fingerprint (6 blocks of 5 digits) for in-person MITM verification.

### 3. Client Ephemerality & Panic Mode
- **In-Memory Media Handling**: Decrypted images are loaded into temporary memory blobs (`URL.createObjectURL`), with blur-to-reveal privacy shields.
- **Panic Wipe**: One-click nuclear button (`⚡`) immediately terminates the socket, wipes all IndexedDB key stores, clears session storage, and reloads the browser.

---

## 🚀 Running Locally

1. **Start the Relay Server**:
   ```bash
   cd server
   node server.js
   ```
   The relay will start on `http://localhost:8443`.

2. **Open User A (Alice)**:
   Open your browser (or Incognito):
   `http://localhost:8443/?token=zk_auth_alice_98f4c1e2b5d7a8904321fedcba654321`

3. **Open User B (Bob)**:
   Open a separate browser profile / separate window:
   `http://localhost:8443/?token=zk_auth_bob_12a3b4c5d6e7f89012345678abcdef01`

4. **Verify Out-of-Band Safety Numbers**:
   Click the 🔐 icon in the header on both devices. Confirm that the 30-digit numbers match identically, then click **Mark as Verified**.

5. **Send Encrypted Messages & Photos**:
   - Type messages or click 📷 to select images.
   - Observe in DevTools Network tab: only raw ciphertext strings and random IVs are transmitted.

---

## 🧪 Running Automated Cryptographic Tests

```bash
# Cryptographic primitives unit tests (ECDH, HKDF, AES-GCM, Tamper-detection)
node test-e2ee.mjs

# Full integration test with simulated Alice & Bob exchanging ciphertext over the live relay
node test-integration.mjs
```
