import { E2EECrypto } from './crypto.js';
import { LocalKeyStore } from './db.js';

// Camouflage & Secret Access Configuration
// Default passcodes for the 2 partners (can be customized or entered via search bar)
const SECRET_RECIPE_CODE_ALICE = 'paneer123';
const SECRET_RECIPE_CODE_BOB = 'butter123';
const TOKEN_ALICE = 'zk_auth_alice_98f4c1e2b5d7a8904321fedcba654321';
const TOKEN_BOB = 'zk_auth_bob_12a3b4c5d6e7f89012345678abcdef01';

// Application State (Kept strictly in volatile RAM)
let myIdentity = null;
let partnerIdentity = null;
let myKeyPair = null;
let myPublicKeyB64 = null;
let peerPublicKey = null;
let peerPublicKeyB64 = null;
let sharedAesKey = null;
let isPartnerOnline = false;
let isKeyVerified = false;
let socket = null;
let currentAuthToken = null;

// DOM Elements - Camouflage
const camouflageView = document.getElementById('camouflage-view');
const appContainer = document.getElementById('app-container');
const recipeSearch = document.getElementById('recipe-search');
const btnSearch = document.getElementById('btn-search');
const secretFooterTrigger = document.getElementById('secret-footer-trigger');
const pinModal = document.getElementById('pin-modal');
const secretPinInput = document.getElementById('secret-pin-input');
const btnSubmitPin = document.getElementById('btn-submit-pin');
const btnCancelPin = document.getElementById('btn-cancel-pin');
const pinError = document.getElementById('pin-error');
const btnCamouflage = document.getElementById('btn-camouflage');

// DOM Elements - Chat Vault
const statusDot = document.getElementById('status-dot');
const partnerName = document.getElementById('partner-name');
const partnerStatusText = document.getElementById('partner-status-text');
const cryptoBadge = document.getElementById('crypto-badge');
const badgeIcon = document.getElementById('badge-icon');
const badgeText = document.getElementById('badge-text');
const typingIndicator = document.getElementById('typing-indicator');
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const btnSend = document.getElementById('btn-send');
const btnAttach = document.getElementById('btn-attach');
const fileInput = document.getElementById('file-input');
const btnVerify = document.getElementById('btn-verify');
const btnPanic = document.getElementById('btn-panic');
const verifyModal = document.getElementById('verify-modal');
const fingerprintDisplay = document.getElementById('fingerprint-display');
const btnMarkVerified = document.getElementById('btn-mark-verified');
const btnCloseVerify = document.getElementById('btn-close-verify');
const imageViewerModal = document.getElementById('image-viewer-modal');
const fullscreenImage = document.getElementById('fullscreen-image');
const btnCloseViewer = document.getElementById('btn-close-viewer');

// 1. Camouflage Logic: Switch between Recipe Blog and Secret Vault
function showVault() {
  camouflageView.classList.add('hidden');
  appContainer.classList.remove('hidden');
  document.title = 'Private Vault';
}

function showCamouflage() {
  appContainer.classList.add('hidden');
  camouflageView.classList.remove('hidden');
  document.title = 'SwadRasoi - Authentic Indian Recipes';
}

// Check if passcode matches Alice or Bob
function verifyAndUnlock(code) {
  const trimmed = code.trim().toLowerCase();

  if (trimmed === SECRET_RECIPE_CODE_ALICE || trimmed === TOKEN_ALICE) {
    currentAuthToken = TOKEN_ALICE;
    sessionStorage.setItem('zk_auth_token', TOKEN_ALICE);
    showVault();
    initChatVault();
    return true;
  } else if (trimmed === SECRET_RECIPE_CODE_BOB || trimmed === TOKEN_BOB) {
    currentAuthToken = TOKEN_BOB;
    sessionStorage.setItem('zk_auth_token', TOKEN_BOB);
    showVault();
    initChatVault();
    return true;
  }
  return false;
}

// DOM Elements for Search Bars
const recipeSearchMain = document.getElementById('recipe-search-main');
const btnSearchMain = document.getElementById('btn-search-main');

// 2. Triggers for Secret Code Entry
// Trigger A: Typing code into either recipe search bar
function handleSearchInput(inputEl) {
  const query = (inputEl || recipeSearch).value.trim();
  if (verifyAndUnlock(query)) {
    if (recipeSearch) recipeSearch.value = '';
    if (recipeSearchMain) recipeSearchMain.value = '';
    return;
  }
  // If not secret code, simulate a normal recipe search
  alert(`No other recipes found matching "${query}". Showing featured Paneer Butter Masala.`);
  if (recipeSearch) recipeSearch.value = '';
  if (recipeSearchMain) recipeSearchMain.value = '';
}

if (btnSearch) btnSearch.addEventListener('click', () => handleSearchInput(recipeSearch));
if (recipeSearch) recipeSearch.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSearchInput(recipeSearch);
});

if (btnSearchMain) btnSearchMain.addEventListener('click', () => handleSearchInput(recipeSearchMain));
if (recipeSearchMain) recipeSearchMain.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSearchInput(recipeSearchMain);
});

// Trigger B: Tap recipe footer copyright 3 times quickly
let footerTapCount = 0;
let lastTapTime = 0;
secretFooterTrigger.addEventListener('click', () => {
  const now = Date.now();
  if (now - lastTapTime < 600) {
    footerTapCount++;
  } else {
    footerTapCount = 1;
  }
  lastTapTime = now;

  if (footerTapCount >= 3) {
    footerTapCount = 0;
    pinModal.classList.remove('hidden');
    secretPinInput.value = '';
    secretPinInput.focus();
  }
});

btnSubmitPin.addEventListener('click', () => {
  const entered = secretPinInput.value;
  if (!verifyAndUnlock(entered)) {
    pinError.classList.remove('hidden');
  } else {
    pinModal.classList.add('hidden');
    pinError.classList.add('hidden');
  }
});

secretPinInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnSubmitPin.click();
});

btnCancelPin.addEventListener('click', () => {
  pinModal.classList.add('hidden');
  pinError.classList.add('hidden');
});

// Quick Camouflage Button in Chat Header
btnCamouflage.addEventListener('click', () => {
  showCamouflage();
});

// Auto-unlock if token is passed via URL or active session
function checkInitialAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const sessionToken = sessionStorage.getItem('zk_auth_token');

  if (token && (token === TOKEN_ALICE || token === TOKEN_BOB)) {
    currentAuthToken = token;
    sessionStorage.setItem('zk_auth_token', token);
    showVault();
    initChatVault();
  } else if (sessionToken) {
    currentAuthToken = sessionToken;
    showVault();
    initChatVault();
  }
}

// 3. Initialize Cryptographic Identity
async function initCryptoIdentity() {
  let storedKeyPair = await LocalKeyStore.getIdentityKeyPair();

  if (!storedKeyPair) {
    appendSystemMessage('Generating new ECDH P-256 identity keypair...');
    myKeyPair = await E2EECrypto.generateKeyPair();
    await LocalKeyStore.saveIdentityKeyPair(myKeyPair);
  } else {
    myKeyPair = storedKeyPair;
  }

  myPublicKeyB64 = await E2EECrypto.exportPublicKey(myKeyPair.publicKey);

  const peerStatus = await LocalKeyStore.getPeerStatus();
  if (peerStatus) {
    isKeyVerified = peerStatus.verified;
    peerPublicKeyB64 = peerStatus.peerPubKeyB64;
    try {
      peerPublicKey = await E2EECrypto.importPublicKey(peerPublicKeyB64);
      sharedAesKey = await E2EECrypto.deriveSharedKey(myKeyPair.privateKey, peerPublicKey);
      updateCryptoBadge();
    } catch (e) {
      console.warn('Failed to restore peer key from cache:', e);
    }
  }
}

// 4. Establish Secure WebSocket Connection
function connectRelay() {
  if (!currentAuthToken) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(currentAuthToken)}`;

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    appendSystemMessage('Connected to Zero-Knowledge relay.');
  };

  socket.onmessage = async (event) => {
    try {
      const packet = JSON.parse(event.data);
      await handleIncomingPacket(packet);
    } catch (err) {
      console.error('Failed to parse incoming packet:', err);
    }
  };

  socket.onclose = () => {
    setPartnerStatus(false);
    appendSystemMessage('Disconnected from relay. Reconnecting in 3s...');
    setTimeout(connectRelay, 3000);
  };

  socket.onerror = (err) => {
    console.error('WebSocket Error:', err);
  };
}

// 5. Process Incoming Packets
async function handleIncomingPacket(packet) {
  switch (packet.type) {
    case 'system:init':
      myIdentity = packet.yourIdentity;
      partnerIdentity = myIdentity === 'alice' ? 'Bob' : 'Alice';
      partnerName.textContent = `Partner: ${partnerIdentity}`;
      setPartnerStatus(packet.partnerOnline);

      sendPacket({
        type: 'crypto:key_exchange',
        pubKey: myPublicKeyB64,
      });
      break;

    case 'system:partner_status':
      setPartnerStatus(packet.online);
      if (packet.online) {
        sendPacket({
          type: 'crypto:key_exchange',
          pubKey: myPublicKeyB64,
        });
      }
      break;

    case 'crypto:key_exchange':
      await handlePeerPublicKey(packet.pubKey);
      break;

    case 'e2ee:message':
      hideTypingIndicator();
      await handleIncomingEncryptedMessage(packet);
      break;

    case 'e2ee:typing':
      handleIncomingTyping(packet);
      break;

    case 'system:undelivered':
      appendSystemMessage(`⚠️ ${packet.reason}`);
      break;

    default:
      console.warn('Unknown packet type:', packet.type);
  }
}

async function handlePeerPublicKey(b64PubKey) {
  if (b64PubKey === myPublicKeyB64) return;

  if (peerPublicKeyB64 !== b64PubKey) {
    peerPublicKeyB64 = b64PubKey;
    peerPublicKey = await E2EECrypto.importPublicKey(peerPublicKeyB64);
    sharedAesKey = await E2EECrypto.deriveSharedKey(myKeyPair.privateKey, peerPublicKey);
    isKeyVerified = false;
    await LocalKeyStore.savePeerStatus(peerPublicKeyB64, false);
    appendSystemMessage('🔑 New session key derived with partner.');
  }

  updateCryptoBadge();
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  if (!sharedAesKey) {
    appendSystemMessage('Cannot send: Establishing cryptographic session with partner...');
    return;
  }

  const textBytes = new TextEncoder().encode(text);
  const encrypted = await E2EECrypto.encrypt(sharedAesKey, textBytes);

  sendPacket({
    type: 'e2ee:message',
    contentType: 'text',
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    timestamp: Date.now(),
  });

  appendMessageBubble({
    sender: 'mine',
    contentType: 'text',
    content: text,
    timestamp: Date.now(),
  });

  messageInput.value = '';
}

async function sendImage(file) {
  if (!sharedAesKey) {
    alert('Partner is offline or cryptographic session is not established yet.');
    return;
  }

  appendSystemMessage('Encrypting media locally...');
  const arrayBuffer = await file.arrayBuffer();
  const encrypted = await E2EECrypto.encrypt(sharedAesKey, arrayBuffer);

  sendPacket({
    type: 'e2ee:message',
    contentType: 'image',
    mimeType: file.type || 'image/jpeg',
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    timestamp: Date.now(),
  });

  const localBlob = new Blob([arrayBuffer], { type: file.type });
  const objectUrl = URL.createObjectURL(localBlob);

  appendMessageBubble({
    sender: 'mine',
    contentType: 'image',
    objectUrl: objectUrl,
    timestamp: Date.now(),
  });
}

async function handleIncomingEncryptedMessage(packet) {
  if (!sharedAesKey) {
    appendSystemMessage('⚠️ Received encrypted message but shared key is not ready.');
    return;
  }

  try {
    const decryptedBytes = await E2EECrypto.decrypt(sharedAesKey, packet.ciphertext, packet.iv);

    if (packet.contentType === 'text') {
      const text = new TextDecoder().decode(decryptedBytes);
      appendMessageBubble({
        sender: 'peer',
        contentType: 'text',
        content: text,
        timestamp: packet.timestamp,
      });
    } else if (packet.contentType === 'image') {
      const blob = new Blob([decryptedBytes], { type: packet.mimeType || 'image/jpeg' });
      const objectUrl = URL.createObjectURL(blob);

      appendMessageBubble({
        sender: 'peer',
        contentType: 'image',
        objectUrl: objectUrl,
        timestamp: packet.timestamp,
      });
    }
  } catch (err) {
    console.error('Decryption error:', err);
    appendSystemMessage('❌ Failed to decrypt packet! The data may have been tampered with or corrupted.');
  }
}

function sendPacket(data) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

let typingTimeout = null;
let peerTypingTimeout = null;

function setPartnerStatus(online) {
  isPartnerOnline = online;
  if (online) {
    statusDot.classList.add('online');
    if (partnerStatusText) {
      partnerStatusText.textContent = 'In Chat';
      partnerStatusText.className = 'status-text online';
    }
  } else {
    statusDot.classList.remove('online');
    if (partnerStatusText) {
      partnerStatusText.textContent = 'Offline';
      partnerStatusText.className = 'status-text offline';
    }
    hideTypingIndicator();
  }
}

function handleIncomingTyping(packet) {
  if (!typingIndicator) return;

  if (packet.isTyping) {
    typingIndicator.classList.remove('hidden');
    // Auto-clear typing indicator after 3.5s of inactivity
    clearTimeout(peerTypingTimeout);
    peerTypingTimeout = setTimeout(() => {
      typingIndicator.classList.add('hidden');
    }, 3500);
  } else {
    hideTypingIndicator();
  }
}

function hideTypingIndicator() {
  clearTimeout(peerTypingTimeout);
  if (typingIndicator) {
    typingIndicator.classList.add('hidden');
  }
}

function emitTypingStatus(isTyping) {
  if (!socket || socket.readyState !== WebSocket.OPEN || !isPartnerOnline) return;

  sendPacket({
    type: 'e2ee:typing',
    isTyping: isTyping,
    timestamp: Date.now(),
  });
}

function updateCryptoBadge() {
  if (isKeyVerified) {
    cryptoBadge.className = 'crypto-badge verified';
    badgeIcon.textContent = '🔒';
    badgeText.textContent = 'Verified E2EE';
  } else if (sharedAesKey) {
    cryptoBadge.className = 'crypto-badge';
    badgeIcon.textContent = '🔑';
    badgeText.textContent = 'E2EE (Unverified)';
  } else {
    cryptoBadge.className = 'crypto-badge';
    badgeIcon.textContent = '⚠️';
    badgeText.textContent = 'Awaiting Keys';
  }
}

function appendSystemMessage(msg) {
  const el = document.createElement('div');
  el.className = 'system-msg';
  el.textContent = msg;
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendMessageBubble({ sender, contentType, content, objectUrl, timestamp }) {
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${sender}`;

  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (contentType === 'text') {
    const textNode = document.createElement('div');
    textNode.textContent = content;
    bubble.appendChild(textNode);
  } else if (contentType === 'image') {
    const imgContainer = document.createElement('div');
    imgContainer.className = 'chat-image-container';

    const img = document.createElement('img');
    img.src = objectUrl;
    img.className = 'blur-overlay';

    const tapText = document.createElement('div');
    tapText.className = 'tap-to-reveal';
    tapText.textContent = 'Tap to View';

    imgContainer.appendChild(img);
    imgContainer.appendChild(tapText);

    imgContainer.addEventListener('click', () => {
      openFullscreenViewer(objectUrl);
    });

    bubble.appendChild(imgContainer);
  }

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span>${timeStr}</span> <span>🔒</span>`;
  bubble.appendChild(meta);

  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function openFullscreenViewer(url) {
  fullscreenImage.src = url;
  imageViewerModal.classList.remove('hidden');
}

btnCloseViewer.addEventListener('click', () => {
  imageViewerModal.classList.add('hidden');
  fullscreenImage.src = '';
});

btnVerify.addEventListener('click', async () => {
  if (!myPublicKeyB64 || !peerPublicKeyB64) {
    alert('Both parties must be connected to compute the safety fingerprint.');
    return;
  }
  const digits = await E2EECrypto.computeSafetyNumber(myPublicKeyB64, peerPublicKeyB64);
  fingerprintDisplay.textContent = digits;
  verifyModal.classList.remove('hidden');
});

btnCloseVerify.addEventListener('click', () => {
  verifyModal.classList.add('hidden');
});

btnMarkVerified.addEventListener('click', async () => {
  isKeyVerified = true;
  await LocalKeyStore.savePeerStatus(peerPublicKeyB64, true);
  updateCryptoBadge();
  verifyModal.classList.add('hidden');
  appendSystemMessage('✅ Safety fingerprint verified.');
});

// Instant Panic Button (Zero-delay emergency wipe & camouflage)
btnPanic.addEventListener('click', async () => {
  // 1. Immediately kill WebSocket connection
  if (socket) {
    try {
      socket.close();
    } catch (_) {}
  }

  // 2. Clear volatile memory in DOM
  chatMessages.innerHTML = '';
  sharedAesKey = null;
  myKeyPair = null;
  peerPublicKey = null;

  // 3. Flip screen back to recipe camouflage instantly (sub-millisecond)
  showCamouflage();

  // 4. Wipe local IndexedDB keys & session storage in background
  try {
    await LocalKeyStore.wipeAllData();
  } catch (_) {}
  sessionStorage.clear();
  localStorage.clear();

  // 5. Clean URL query parameters so no token remains in address bar
  if (window.history.replaceState) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
});

btnSend.addEventListener('click', () => {
  emitTypingStatus(false);
  sendMessage();
});

messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    emitTypingStatus(false);
    sendMessage();
  }
});

// Typing event detection with 2.5s debounce
messageInput.addEventListener('input', () => {
  const hasText = messageInput.value.trim().length > 0;
  if (hasText) {
    emitTypingStatus(true);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      emitTypingStatus(false);
    }, 2500);
  } else {
    emitTypingStatus(false);
  }
});

btnAttach.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    sendImage(file);
    fileInput.value = '';
  }
});

// Bootstrapping the chat vault once unlocked
async function initChatVault() {
  if (!myKeyPair) {
    await initCryptoIdentity();
  }
  if (!socket) {
    connectRelay();
  }
}

// Initial page check
checkInitialAuth();
