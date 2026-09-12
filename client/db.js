// IndexedDB wrapper for local key storage and verification state

const DB_NAME = 'zk_secure_e2ee_vault';
const DB_VERSION = 1;
const STORE_KEYS = 'key_vault';

export class LocalKeyStore {
  static async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_KEYS)) {
          db.createObjectStore(STORE_KEYS);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async saveIdentityKeyPair(keyPair) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEYS, 'readwrite');
      const store = tx.objectStore(STORE_KEYS);
      store.put(keyPair, 'identity_keypair');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  static async getIdentityKeyPair() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEYS, 'readonly');
      const store = tx.objectStore(STORE_KEYS);
      const req = store.get('identity_keypair');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  static async savePeerStatus(peerPubKeyB64, verified = false) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEYS, 'readwrite');
      const store = tx.objectStore(STORE_KEYS);
      store.put({ peerPubKeyB64, verified }, 'peer_verification');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  static async getPeerStatus() {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_KEYS, 'readonly');
      const store = tx.objectStore(STORE_KEYS);
      const req = store.get('peer_verification');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  // Complete Nuclear Wipe (Panic Mode)
  static async wipeAllData() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => {
        sessionStorage.clear();
        localStorage.clear();
        resolve();
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => resolve();
    });
  }
}
