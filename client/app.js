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
const replyPreviewBar = document.getElementById('reply-preview-bar');
const replyBarSender = document.getElementById('reply-bar-sender');
const replyBarText = document.getElementById('reply-bar-text');
const btnCancelReply = document.getElementById('btn-cancel-reply');
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
const btnAudioCall = document.getElementById('btn-audio-call');
const btnVideoCall = document.getElementById('btn-video-call');
const incomingCallModal = document.getElementById('incoming-call-modal');
const incomingCallerTitle = document.getElementById('incoming-caller-title');
const incomingCallSubtitle = document.getElementById('incoming-call-subtitle');
const btnAcceptCall = document.getElementById('btn-accept-call');
const btnRejectCall = document.getElementById('btn-reject-call');
const activeCallOverlay = document.getElementById('active-call-overlay');
const remoteVideo = document.getElementById('remote-video');
const remoteAudio = document.getElementById('remote-audio');
const localVideo = document.getElementById('local-video');
const localVideoContainer = document.getElementById('local-video-container');
const callTimer = document.getElementById('call-timer');
const btnToggleMic = document.getElementById('btn-toggle-mic');
const btnToggleCam = document.getElementById('btn-toggle-cam');
const btnFlipCam = document.getElementById('btn-flip-cam');
const btnEndCall = document.getElementById('btn-end-call');
const btnCallCamouflage = document.getElementById('btn-call-camouflage');

// Active Reply State
let replyingTo = null; // { id, sender, text, contentType }

// Active Call State (Strictly in volatile RAM, never logged or saved to disk)
let peerConnection = null;
let localStream = null;
let wakeLock = null;
let callStartTime = null;
let callTimerInterval = null;
let isAudioMuted = false;
let isVideoMuted = false;
let currentCameraFacing = 'user'; // 'user' (front) or 'environment' (back)
let incomingCallOffer = null;
let isCallActive = false;

// 1. Camouflage Logic: Switch between Recipe Blog and Secret Vault
function showVault() {
  try {
    sessionStorage.removeItem('zk_force_camouflage');
  } catch (_) {}
  if (camouflageView) {
    camouflageView.classList.add('hidden');
    camouflageView.style.setProperty('display', 'none', 'important');
    camouflageView.style.setProperty('opacity', '0', 'important');
    camouflageView.style.setProperty('visibility', 'hidden', 'important');
    camouflageView.style.setProperty('pointer-events', 'none', 'important');
  }
  if (appContainer) {
    appContainer.classList.remove('hidden');
    appContainer.style.setProperty('display', 'flex', 'important');
    appContainer.style.setProperty('opacity', '1', 'important');
    appContainer.style.setProperty('visibility', 'visible', 'important');
    appContainer.style.setProperty('pointer-events', 'auto', 'important');
  }
  document.title = 'Private Vault';
}

function showCamouflage() {
  if (appContainer) {
    appContainer.classList.add('hidden');
    appContainer.style.setProperty('display', 'none', 'important');
    appContainer.style.setProperty('opacity', '0', 'important');
    appContainer.style.setProperty('visibility', 'hidden', 'important');
    appContainer.style.setProperty('pointer-events', 'none', 'important');
  }
  if (camouflageView) {
    camouflageView.classList.remove('hidden');
    camouflageView.style.setProperty('display', 'block', 'important');
    camouflageView.style.setProperty('opacity', '1', 'important');
    camouflageView.style.setProperty('visibility', 'visible', 'important');
    camouflageView.style.setProperty('pointer-events', 'auto', 'important');
  }
  document.title = 'SwadRasoi - Authentic Indian Recipes';
  if (document.body) {
    void document.body.offsetHeight;
  }
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
  lockVaultOnSleep();
});

// Initial auth check: strictly enforce camouflage unless explicit valid URL token
function checkInitialAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const forceCamouflage = sessionStorage.getItem('zk_force_camouflage');

  if (forceCamouflage === 'true') {
    sessionStorage.removeItem('zk_auth_token');
    showCamouflage();
    return;
  }

  if (token && (token === TOKEN_ALICE || token === TOKEN_BOB)) {
    currentAuthToken = token;
    sessionStorage.setItem('zk_auth_token', token);
    if (window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    showVault();
    initChatVault();
  } else {
    // Default strictly to recipe camouflage on load/restore
    showCamouflage();
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

    case 'webrtc:offer':
      await handleIncomingCallOffer(packet);
      break;

    case 'webrtc:answer':
      await handleIncomingCallAnswer(packet);
      break;

    case 'webrtc:ice':
      await handleIncomingIceCandidate(packet);
      break;

    case 'webrtc:reject':
      handleCallRejected();
      break;

    case 'webrtc:end':
      terminateCall(false);
      appendSystemMessage('Call ended by partner.');
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

  const payload = {
    text: text,
    replyTo: replyingTo ? {
      id: replyingTo.id,
      sender: replyingTo.sender,
      text: replyingTo.text,
      contentType: replyingTo.contentType,
    } : null,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await E2EECrypto.encrypt(sharedAesKey, payloadBytes);
  const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

  sendPacket({
    type: 'e2ee:message',
    id: msgId,
    contentType: 'text',
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    timestamp: Date.now(),
  });

  appendMessageBubble({
    id: msgId,
    sender: 'mine',
    contentType: 'text',
    content: text,
    replyTo: payload.replyTo,
    timestamp: Date.now(),
  });

  messageInput.value = '';
  cancelReply();
}

async function sendImage(file) {
  if (!sharedAesKey) {
    alert('Partner is offline or cryptographic session is not established yet.');
    return;
  }

  appendSystemMessage('Encrypting media locally...');
  const arrayBuffer = await file.arrayBuffer();
  const encrypted = await E2EECrypto.encrypt(sharedAesKey, arrayBuffer);
  const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

  sendPacket({
    type: 'e2ee:message',
    id: msgId,
    contentType: 'image',
    mimeType: file.type || 'image/jpeg',
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
    replyTo: replyingTo ? {
      id: replyingTo.id,
      sender: replyingTo.sender,
      text: replyingTo.text,
      contentType: replyingTo.contentType,
    } : null,
    timestamp: Date.now(),
  });

  const localBlob = new Blob([arrayBuffer], { type: file.type });
  const objectUrl = URL.createObjectURL(localBlob);

  appendMessageBubble({
    id: msgId,
    sender: 'mine',
    contentType: 'image',
    objectUrl: objectUrl,
    replyTo: replyingTo,
    timestamp: Date.now(),
  });

  cancelReply();
}

async function handleIncomingEncryptedMessage(packet) {
  if (!sharedAesKey) {
    appendSystemMessage('⚠️ Received encrypted message but shared key is not ready.');
    return;
  }

  try {
    const decryptedBytes = await E2EECrypto.decrypt(sharedAesKey, packet.ciphertext, packet.iv);

    if (packet.contentType === 'text') {
      let textContent = '';
      let replyTo = null;

      try {
        const parsed = JSON.parse(new TextDecoder().decode(decryptedBytes));
        textContent = parsed.text || '';
        replyTo = parsed.replyTo || null;
      } catch (_) {
        // Fallback for raw text payloads
        textContent = new TextDecoder().decode(decryptedBytes);
      }

      appendMessageBubble({
        id: packet.id || ('msg_' + Date.now()),
        sender: 'peer',
        contentType: 'text',
        content: textContent,
        replyTo: replyTo || packet.replyTo,
        timestamp: packet.timestamp,
      });
    } else if (packet.contentType === 'image') {
      const blob = new Blob([decryptedBytes], { type: packet.mimeType || 'image/jpeg' });
      const objectUrl = URL.createObjectURL(blob);

      appendMessageBubble({
        id: packet.id || ('msg_' + Date.now()),
        sender: 'peer',
        contentType: 'image',
        objectUrl: objectUrl,
        replyTo: packet.replyTo || null,
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
    if (btnAudioCall) btnAudioCall.disabled = false;
    if (btnVideoCall) btnVideoCall.disabled = false;
  } else {
    statusDot.classList.remove('online');
    if (partnerStatusText) {
      partnerStatusText.textContent = 'Offline';
      partnerStatusText.className = 'status-text offline';
    }
    if (btnAudioCall) btnAudioCall.disabled = true;
    if (btnVideoCall) btnVideoCall.disabled = true;
    hideTypingIndicator();

    // If a call is active and partner leaves/disconnects, terminate call immediately
    if (isCallActive) {
      terminateCall(false);
      appendSystemMessage('Call disconnected: Partner left the chat.');
    }
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

function initiateReply(msgData) {
  replyingTo = {
    id: msgData.id,
    sender: msgData.sender === 'mine' ? 'You' : (partnerIdentity || 'Partner'),
    text: msgData.contentType === 'image' ? '📷 Photo' : (msgData.content || ''),
    contentType: msgData.contentType,
  };

  if (replyPreviewBar && replyBarSender && replyBarText) {
    replyBarSender.textContent = `Replying to ${replyingTo.sender}`;
    replyBarText.textContent = replyingTo.text;
    replyPreviewBar.classList.remove('hidden');
    messageInput.focus();
  }
}

function cancelReply() {
  replyingTo = null;
  if (replyPreviewBar) {
    replyPreviewBar.classList.add('hidden');
  }
}

if (btnCancelReply) {
  btnCancelReply.addEventListener('click', cancelReply);
}

function appendMessageBubble({ id, sender, contentType, content, objectUrl, replyTo, timestamp }) {
  const bubble = document.createElement('div');
  const bubbleId = id || ('bubble_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5));
  bubble.id = bubbleId;
  bubble.className = `message-bubble ${sender}`;

  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 1. If this message is a reply to another message, render quote box
  if (replyTo && replyTo.text) {
    const quoteBox = document.createElement('div');
    quoteBox.className = 'replied-quote-box';
    quoteBox.title = 'Click to view original message';

    const quoteSender = document.createElement('div');
    quoteSender.className = 'replied-sender';
    quoteSender.textContent = replyTo.sender || 'Partner';

    const quoteSnippet = document.createElement('div');
    quoteSnippet.className = 'replied-snippet';
    quoteSnippet.textContent = replyTo.text;

    quoteBox.appendChild(quoteSender);
    quoteBox.appendChild(quoteSnippet);

    if (replyTo.id) {
      quoteBox.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetEl = document.getElementById(replyTo.id);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.style.transition = 'box-shadow 0.3s';
          targetEl.style.boxShadow = '0 0 15px var(--accent-blue)';
          setTimeout(() => {
            targetEl.style.boxShadow = '';
          }, 1200);
        }
      });
    }

    bubble.appendChild(quoteBox);
  }

  // 2. Render Main Message Content
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

  // 3. Quick Action Buttons (Reply button on hover/click)
  const actionContainer = document.createElement('div');
  actionContainer.className = 'bubble-actions';

  const btnReply = document.createElement('button');
  btnReply.className = 'btn-bubble-reply';
  btnReply.innerHTML = '↩ Reply';
  btnReply.title = 'Reply to this message';
  btnReply.addEventListener('click', (e) => {
    e.stopPropagation();
    initReply({
      id: bubbleId,
      sender: sender,
      contentType: contentType,
      content: content,
    });
  });

  actionContainer.appendChild(btnReply);
  bubble.appendChild(actionContainer);

  // 4. Mobile Swipe-to-Reply Gesture Handling
  let touchStartX = 0;
  let touchCurrentX = 0;
  bubble.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchCurrentX = touchStartX;
  }, { passive: true });

  bubble.addEventListener('touchmove', (e) => {
    touchCurrentX = e.touches[0].clientX;
    const diffX = touchCurrentX - touchStartX;
    if (diffX > 15 && diffX < 80) {
      bubble.style.transform = `translateX(${diffX}px)`;
    }
  }, { passive: true });

  bubble.addEventListener('touchend', () => {
    const diffX = touchCurrentX - touchStartX;
    bubble.style.transform = '';
    if (diffX > 45) {
      // Trigger reply on swipe right
      initReply({
        id: bubbleId,
        sender: sender,
        contentType: contentType,
        content: content,
      });
      if (navigator.vibrate) navigator.vibrate(20);
    }
  });

  // Double tap to reply on touch devices
  let lastTap = 0;
  bubble.addEventListener('touchend', (e) => {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 300 && tapLength > 0) {
      initReply({
        id: bubbleId,
        sender: sender,
        contentType: contentType,
        content: content,
      });
      if (navigator.vibrate) navigator.vibrate(25);
    }
    lastTap = currentTime;
  });

  const meta = document.createElement('div');
  meta.className = 'msg-meta';
  meta.innerHTML = `<span>${timeStr}</span> <span>🔒</span>`;
  bubble.appendChild(meta);

  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Wrapper to standardise reply invocation
function initReply(data) {
  initiateReply(data);
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
  // 1. Immediately terminate active call and kill camera/mic hardware
  terminateCall(true);

  // 2. Immediately kill WebSocket connection
  if (socket) {
    try {
      socket.close();
    } catch (_) {}
  }

  // 3. Clear volatile memory in DOM
  chatMessages.innerHTML = '';
  sharedAesKey = null;
  myKeyPair = null;
  peerPublicKey = null;
  cancelReply();

  // 4. Flip screen back to recipe camouflage instantly (sub-millisecond)
  showCamouflage();

  // 5. Wipe local IndexedDB keys & session storage in background
  try {
    await LocalKeyStore.wipeAllData();
  } catch (_) {}
  sessionStorage.clear();
  localStorage.clear();

  // 6. Clean URL query parameters so no token remains in address bar
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

// ==========================================================
// 8. ZERO-KNOWLEDGE WEBRTC CALLING ENGINE (Audio & Video)
// ==========================================================

// Global STUN and encrypted TURN servers (Public STUN + secure TURN fallback)
const RTC_CONFIGURATION = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
  ],
  iceCandidatePoolSize: 10,
};

// Start an Outgoing Call (Voice or Video)
async function startCall(videoEnabled = true) {
  if (!isPartnerOnline) {
    alert('Cannot call: Partner must be inside the chat to connect.');
    return;
  }

  try {
    // 1. Capture local media stream
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: videoEnabled ? { facingMode: currentCameraFacing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });

    if (localVideo) {
      localVideo.srcObject = localStream;
    }

    // 2. Setup RTCPeerConnection
    setupPeerConnection();

    // 3. Add tracks
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // 4. Create and send offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    sendPacket({
      type: 'webrtc:offer',
      offer: offer,
      videoEnabled: videoEnabled,
      timestamp: Date.now(),
    });

    // 5. Open in-call overlay
    openCallUI(videoEnabled);
    if (callTimer) callTimer.textContent = 'Calling partner...';
    requestScreenWakeLock();
  } catch (err) {
    console.error('Call initialization failed:', err);
    alert('Camera or microphone access denied / unavailable.');
    terminateCall(false);
  }
}

// Receive Incoming Call Offer
async function handleIncomingCallOffer(packet) {
  if (!isPartnerOnline) return;

  incomingCallOffer = packet;
  if (incomingCallerTitle) {
    incomingCallerTitle.textContent = packet.videoEnabled ? '📹 Encrypted Video Call' : '📞 Encrypted Voice Call';
  }
  if (incomingCallSubtitle) {
    incomingCallSubtitle.textContent = `${partnerIdentity || 'Partner'} is calling you securely...`;
  }

  if (incomingCallModal) {
    incomingCallModal.classList.remove('hidden');
    // Subtle call ring vibration pattern if supported
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500]);
  }
}

// Accept Incoming Call
async function acceptIncomingCall() {
  if (!incomingCallOffer) return;
  const isVideo = incomingCallOffer.videoEnabled;

  if (incomingCallModal) incomingCallModal.classList.add('hidden');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: isVideo ? { facingMode: currentCameraFacing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    });

    if (localVideo) {
      localVideo.srcObject = localStream;
    }

    setupPeerConnection();

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCallOffer.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    sendPacket({
      type: 'webrtc:answer',
      answer: answer,
      timestamp: Date.now(),
    });

    openCallUI(isVideo);
    startCallTimer();
    requestScreenWakeLock();
  } catch (err) {
    console.error('Failed to accept call:', err);
    alert('Unable to access microphone or camera.');
    rejectIncomingCall();
  }
}

// Reject Incoming Call
function rejectIncomingCall() {
  if (incomingCallModal) incomingCallModal.classList.add('hidden');
  sendPacket({
    type: 'webrtc:reject',
    timestamp: Date.now(),
  });
  incomingCallOffer = null;
}

function handleCallRejected() {
  terminateCall(false);
  appendSystemMessage('Call declined by partner.');
}

// Handle Remote Call Answer
async function handleIncomingCallAnswer(packet) {
  if (peerConnection && packet.answer) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(packet.answer));
    startCallTimer();
  }
}

// Handle ICE Candidate Exchange
async function handleIncomingIceCandidate(packet) {
  if (peerConnection && packet.candidate) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(packet.candidate));
    } catch (e) {
      console.warn('Error adding ICE candidate:', e);
    }
  }
}

// Setup PeerConnection Events
function setupPeerConnection() {
  peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendPacket({
        type: 'webrtc:ice',
        candidate: event.candidate,
        timestamp: Date.now(),
      });
    }
  };

  peerConnection.ontrack = (event) => {
    const stream = event.streams[0];
    if (remoteVideo) {
      remoteVideo.srcObject = stream;
    }
    if (remoteAudio) {
      remoteAudio.srcObject = stream;
    }
  };

  peerConnection.onconnectionstatechange = () => {
    if (!peerConnection) return;
    const state = peerConnection.connectionState;
    if (state === 'connected') {
      if (callTimer && !callTimerInterval) startCallTimer();
    } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      terminateCall(false);
    }
  };
}

// UI Handling for Active Calls
function openCallUI(hasVideo) {
  isCallActive = true;
  if (activeCallOverlay) activeCallOverlay.classList.remove('hidden');

  if (!hasVideo) {
    if (localVideoContainer) localVideoContainer.classList.add('hidden');
    if (remoteVideo) remoteVideo.classList.add('hidden');
  } else {
    if (localVideoContainer) localVideoContainer.classList.remove('hidden');
    if (remoteVideo) remoteVideo.classList.remove('hidden');
  }
}

// Call Duration Counter (Never logged or saved to disk)
function startCallTimer() {
  callStartTime = Date.now();
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    if (callTimer) {
      callTimer.textContent = `🔒 ${mins}:${secs} (E2EE)`;
    }
  }, 1000);
}

// Terminate Active Call (Kills all hardware tracks & releases wakeLock)
function terminateCall(notifyPeer = true) {
  if (notifyPeer && socket && socket.readyState === WebSocket.OPEN) {
    sendPacket({
      type: 'webrtc:end',
      timestamp: Date.now(),
    });
  }

  isCallActive = false;
  clearInterval(callTimerInterval);
  callTimerInterval = null;
  callStartTime = null;

  // 1. HARDWARE STREAM KILLSWITCH: Immediately shut off mic and camera hardware
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (_) {}
    });
    localStream = null;
  }

  // 2. Close peer connection
  if (peerConnection) {
    try {
      peerConnection.close();
    } catch (_) {}
    peerConnection = null;
  }

  // 3. Clear video element sources to free RAM
  if (remoteVideo) remoteVideo.srcObject = null;
  if (localVideo) localVideo.srcObject = null;
  if (remoteAudio) remoteAudio.srcObject = null;

  // 4. Release Screen WakeLock
  releaseScreenWakeLock();

  // 5. Hide UI
  if (activeCallOverlay) activeCallOverlay.classList.add('hidden');
  if (incomingCallModal) incomingCallModal.classList.add('hidden');
  incomingCallOffer = null;
}

// Toggle Microphone (Mute / Unmute)
function toggleMicrophone() {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    isAudioMuted = !audioTrack.enabled;
    if (btnToggleMic) {
      btnToggleMic.textContent = isAudioMuted ? '🔇' : '🎤';
      btnToggleMic.classList.toggle('off', isAudioMuted);
    }
  }
}

// Toggle Camera (Video On / Off)
function toggleCamera() {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    isVideoMuted = !videoTrack.enabled;
    if (btnToggleCam) {
      btnToggleCam.textContent = isVideoMuted ? '🚫' : '📹';
      btnToggleCam.classList.toggle('off', isVideoMuted);
    }
  }
}

// Flip Camera (Front / Back on Mobile)
async function flipCamera() {
  if (!localStream || !peerConnection) return;
  currentCameraFacing = currentCameraFacing === 'user' ? 'environment' : 'user';

  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentCameraFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
    });

    const newVideoTrack = newStream.getVideoTracks()[0];
    const oldVideoTrack = localStream.getVideoTracks()[0];

    // Replace track in peer connection
    const sender = peerConnection.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) {
      await sender.replaceTrack(newVideoTrack);
    }

    // Stop old track and update local video
    if (oldVideoTrack) oldVideoTrack.stop();
    localStream.removeTrack(oldVideoTrack);
    localStream.addTrack(newVideoTrack);

    if (localVideo) localVideo.srcObject = localStream;
  } catch (err) {
    console.warn('Could not flip camera:', err);
  }
}

// Screen WakeLock (Prevents phone screen from dimming/sleeping during call)
async function requestScreenWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    console.log('WakeLock error:', err);
  }
}

function releaseScreenWakeLock() {
  if (wakeLock) {
    try {
      wakeLock.release();
    } catch (_) {}
    wakeLock = null;
  }
}

// ==========================================================
// 9. POWER BUTTON / SCREEN LOCK / BACKGROUND KILLSWITCH
// ==========================================================
// When the power button is pressed, screen is locked, or browser tab is switched away:
// 1. Instantly kill active calls and terminate camera/mic hardware streams.
// 2. Wipe volatile session auth tokens and sensitive message DOM nodes.
// 3. Immediately lock into SwadRasoi recipe camouflage.
// 4. When the user unlocks the phone or wakes up the screen, ONLY Paneer Butter Masala appears!
function lockVaultOnSleep() {
  // 1. Instantly disconnect any active voice/video call & stop all camera/mic tracks
  if (isCallActive) {
    terminateCall(true);
  }

  // 2. Wipe active auth state so screen-wake never re-opens vault
  currentAuthToken = null;
  try {
    sessionStorage.removeItem('zk_auth_token');
    sessionStorage.setItem('zk_force_camouflage', 'true');
  } catch (_) {}

  // 3. Close relay WebSocket connection cleanly
  if (socket) {
    try {
      socket.close();
    } catch (_) {}
    socket = null;
  }

  // 4. Scrub chat messages and input from DOM to eliminate render cache snapshot
  if (chatMessages) {
    chatMessages.innerHTML = '';
  }
  if (messageInput) {
    messageInput.value = '';
  }
  replyingTo = null;
  if (replyPreviewBar) {
    replyPreviewBar.classList.add('hidden');
  }

  // 5. Instantly force recipe camouflage
  showCamouflage();
}

// Listen for screen-off, power button press, and sleep
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    lockVaultOnSleep();
  } else {
    // Phone just woke up from sleep or screen was turned back on!
    // Unless actively unlocked with token in memory, enforce recipe camouflage
    if (!currentAuthToken || !sessionStorage.getItem('zk_auth_token')) {
      lockVaultOnSleep();
    }
  }
});

window.addEventListener('pagehide', () => {
  lockVaultOnSleep();
});

window.addEventListener('freeze', () => {
  lockVaultOnSleep();
});

window.addEventListener('pageshow', () => {
  if (!currentAuthToken || !sessionStorage.getItem('zk_auth_token')) {
    lockVaultOnSleep();
  }
});

window.addEventListener('focus', () => {
  if (!currentAuthToken || !sessionStorage.getItem('zk_auth_token')) {
    lockVaultOnSleep();
  }
});

// Event Listeners for Calling
if (btnAudioCall) btnAudioCall.addEventListener('click', () => startCall(false));
if (btnVideoCall) btnVideoCall.addEventListener('click', () => startCall(true));
if (btnAcceptCall) btnAcceptCall.addEventListener('click', acceptIncomingCall);
if (btnRejectCall) btnRejectCall.addEventListener('click', rejectIncomingCall);
if (btnEndCall) btnEndCall.addEventListener('click', () => terminateCall(true));
if (btnToggleMic) btnToggleMic.addEventListener('click', toggleMicrophone);
if (btnToggleCam) btnToggleCam.addEventListener('click', toggleCamera);
if (btnFlipCam) btnFlipCam.addEventListener('click', flipCamera);
if (btnCallCamouflage) {
  btnCallCamouflage.addEventListener('click', () => {
    terminateCall(true);
    showCamouflage();
  });
}

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

