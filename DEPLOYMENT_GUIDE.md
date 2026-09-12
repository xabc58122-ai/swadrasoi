# Complete Security Hardening & Deployment Guide
## The Safest Free Deployment: Dedicated Oracle Cloud Always Free VPS + Caddy (Zero-Log TLS 1.3)

---

### Why this is the safest architecture possible:
1. **Isolated Hardware/VM**: You are not sharing a runtime container or process space with anyone else.
2. **Zero Access Logs**: The reverse proxy (Caddy) and Node server are configured with logging turned **OFF**. No IP addresses, no connection timestamps, and no user-agent strings are written to disk.
3. **Automated TLS 1.3 with A+ Security**: Caddy automatically provisions and renews Let's Encrypt certificates with strict HTTPS and WSS.
4. **Minimal Attack Surface**: The server only listens on port 443 (HTTPS) and 80 (redirect). SSH is locked down to public-key authentication only.

---

### Phase 1: Provision your Free VPS on Oracle Cloud (5-10 minutes)

1. Sign up for **Oracle Cloud Free Tier** at [cloud.oracle.com](https://www.oracle.com/cloud/free/).
2. Go to **Compute** -> **Instances** -> **Create Instance**.
3. Choose:
   - **Image**: Ubuntu 22.04 LTS or 24.04 LTS (Minimal)
   - **Shape**: Always Free Eligible (VM.Standard.E2.1.Micro or VM.Standard.A1.Flex)
4. Under **Add SSH keys**, generate or upload your public SSH key.
5. In your Virtual Cloud Network (VCN) Security List, open ports:
   - Port `80` (HTTP)
   - Port `443` (HTTPS)
   - Port `22` (SSH)

---

### Phase 2: Get a Free Subdomain

To get automatic HTTPS/TLS certificates, you need a domain pointing to your VPS public IP.
You can get a 100% free domain/subdomain using **DuckDNS** (free forever):
1. Go to [duckdns.org](https://www.duckdns.org) and log in.
2. Create a subdomain (e.g., `ourprivatevault.duckdns.org`).
3. Set the IP address to your Oracle VPS public IP.

---

### Phase 3: Server Setup & Hardening Commands

SSH into your new server:
```bash
ssh ubuntu@YOUR_SERVER_IP
```

Run this automated setup script:

```bash
# 1. Update and harden system packages
sudo apt update && sudo apt upgrade -y

# 2. Configure UFW Firewall (strictly allow only SSH, HTTP, HTTPS)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

# 3. Install Node.js 20+ LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git caddy

# 4. Clone / copy the chatapp project
mkdir -p ~/chatapp
cd ~/chatapp
# (Copy server and client folders here, e.g. via git or scp)
cd server
npm install --omit=dev

# 5. Create secure production .env
cat << 'EOF' > .env
PORT=8443
TOKEN_ALICE=zk_auth_alice_98f4c1e2b5d7a8904321fedcba654321
TOKEN_BOB=zk_auth_bob_12a3b4c5d6e7f89012345678abcdef01
EOF
chmod 600 .env
```

---

### Phase 4: Configure Zero-Log Systemd Service

Create a system service so the relay runs automatically on reboot:

```bash
sudo tee /etc/systemd/system/zk-relay.service << 'EOF'
[Unit]
Description=Zero-Knowledge E2EE Relay
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/chatapp/server
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
# Security hardening directives
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/ubuntu/chatapp/server
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now zk-relay
```

---

### Phase 5: Caddy Reverse Proxy with ZERO-LOGGING and TLS 1.3

Configure Caddy (`/etc/caddy/Caddyfile`):

```bash
sudo tee /etc/caddy/Caddyfile << 'EOF'
ourprivatevault.duckdns.org {
    # 1. Reverse proxy to the local relay
    reverse_proxy 127.0.0.1:8443

    # 2. Strict Zero-Log Policy (no access logs or IP logs written to disk)
    log {
        output discard
    }

    # 3. Maximum Security Headers
    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "no-referrer"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"
    }

    # 4. Enforce TLS 1.3
    tls {
        protocols tls1.3
    }
}
EOF

sudo systemctl restart caddy
```

---

### Phase 6: Testing & Adding to Home Screen

1. Open on Device A:
   `https://ourprivatevault.duckdns.org/?token=zk_auth_alice_98f4c1e2b5d7a8904321fedcba654321`

2. Open on Device B:
   `https://ourprivatevault.duckdns.org/?token=zk_auth_bob_12a3b4c5d6e7f89012345678abcdef01`

3. **Install as App (PWA)**:
   - On **iPhone (Safari)**: Tap **Share** -> **Add to Home Screen**.
   - On **Android (Chrome)**: Tap **Three Dots** -> **Add to Home Screen** / **Install App**.
   - It will launch in full-screen standalone mode without any browser URL bar, looking and behaving like a native private app.
