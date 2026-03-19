# MAJA - Internet-Free Local Messenger

Private group messaging over the **same Wi-Fi, hotspot, or LAN** with **end-to-end encryption**, **owner-approved room access**, and **no internet requirement**.

![Version](https://img.shields.io/badge/version-3.0.0-blue)
![Encryption](https://img.shields.io/badge/Encryption-AES--256--GCM-00d4aa)
![Auth](https://img.shields.io/badge/Auth-JWT%20%2B%20bcrypt-green)
![Tests](https://img.shields.io/badge/Tests-95%20Passing-brightgreen)
![Storage](https://img.shields.io/badge/Storage-SQLite-blue)

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System design, data flow, component interactions |
| [CHALLENGES.md](./CHALLENGES.md) | Real problems I solved and what I learned |
| [SECURITY.md](./SECURITY.md) | Threat model, security measures, OWASP coverage |
| [PERFORMANCE.md](./PERFORMANCE.md) | Benchmarks, bottlenecks, scalability analysis |

---

## ✨ Features

### Private local communication
- **No internet required** - Devices talk over the same Wi-Fi, hotspot, or LAN
- **Owner-approved rooms** - The room owner decides who can join
- **Local-network boundary enforced** - HTTP and socket traffic are rejected when they come from outside the local network

### Encryption and access
- **End-to-end encryption** - AES-256-GCM + ECDH P-256 key exchange
- **Encrypted file sharing** - File bytes and file metadata are encrypted before upload and shared inside the room
- **JWT authentication** - Access tokens (15 min) + refresh tokens (7 days) with rotation
- **Ephemeral rooms** - When the owner leaves, the room and its data are removed

### Mobile and same-network access
- **QR Code Joining** - Scan to join rooms instantly
- **Multiple local join addresses** - If one LAN IP is wrong for a phone or laptop, the room shows fallback local addresses you can copy instead
- **Optional local HTTPS** - A self-signed HTTPS server can help on phones that require a secure context, but browser/device policies still vary
- **Mixed Mode** - Supports both Auth-based and Legacy (username-only) users

### 🛠️ Developer Experience
- **TypeScript** - Full type safety on frontend
- **Comprehensive Testing** - 95+ Unit (Jest) and E2E (Playwright) tests
- **Dual Server Modes** - Enhanced (Auth) and Legacy (Simple) servers

---

## 🚀 Quick Start

### Option A: One-Click Setup (Recommended) ⚡
**Right-click `setup.ps1` → "Run with PowerShell" (as Administrator)**
This automatically installs dependencies, builds the client, generates SSL certs, and starts the server.

### Option B: Manual Setup

#### 1. Install & Build
```bash
npm install         # Install server deps
npm run install-all # Install client deps
npm run build       # Build React frontend
```

#### 2. Generate SSL Certificates (Optional, but useful for Mobile)
```bash
mkdir ssl
openssl req -x509 -newkey rsa:2048 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes -subj "/CN=MAJA"
```

#### 3. Start Server
```bash
npm start           # Starts enhanced server (Auth + E2E)
# OR
npm run start:legacy # Starts legacy server (No Auth, just E2E)
```

### Access URLs
| Device | URL |
|--------|-----|
| 💻 PC | `http://localhost:3000` |
| 📱 Phone | `http://YOUR_PC_IP:3000` or `https://YOUR_PC_IP:3443` if your browser requires a secure context |

---

## How It Works

1. Connect both devices to the same Wi-Fi, hotspot, or LAN.
2. Create a room on one device.
3. Share the room code or QR code with people on that same network.
4. Approve each join request from the room owner device.
5. If a phone cannot join with the first QR link, try one of the alternate local addresses shown in the room details.

## What This Does Not Do

- It does **not** work across the public internet.
- People outside your local network are blocked from reaching the host.
- `Offline` in this project means **no internet required**, not **no local network at all**.
- Automated tests prove loopback and browser flows well, but real phone-on-hotspot behavior should still be verified on actual devices.

---

## ⚠️ Troubleshooting Mobile Connection

**"Site can't be reached" / "Connection timed out"?**

This is usually caused by **AP Isolation** on your phone's hotspot (blocks laptop from talking to phone).

**✅ The Fix: Use Windows Mobile Hotspot**
1. **On PC:** Settings → Network & Internet → Mobile hotspot → **Turn ON**
2. **On Phone:** Connect to the PC's hotspot WiFi
3. **Scan QR Code:** It will automatically detect the hotspot IP (e.g., `192.168.137.1`)
4. **Access:** `https://192.168.137.1:3443`

---

## 🧪 Testing

We use **Jest** for unit testing and **Playwright** for E2E testing.

```bash
# Run Unit Tests (Auth, Crypto, Logic)
npm test

# Run End-to-End Tests (Browser automation)
npm run test:e2e

# Run All Tests
npm run test:all
```

**Coverage:**
- ✅ **Auth:** Registration, Login, Token Refresh, Rate Limiting
- ✅ **Rooms:** Creation, Joining, Locking, Persistence
- ✅ **Security:** Injection, XSS prevention, Error handling
- ✅ **E2E:** Full user flows (Login → Create Room → Chat → Leave)

---

## 📁 Project Structure

```
e2e-messenger/
├── server-enhanced.js  # MAIN Server (Express + Socket.IO + Auth)
├── server-sqlite.js    # Legacy Server (No Auth modules)
├── backend/
│   ├── config/         # Environment & Constants
│   ├── controllers/    # API Logic (Auth, Rooms, Files)
│   ├── database/       # SQLite Wrapper (db.js)
│   ├── middleware/     # JWT Auth & Rate Limiting
│   └── routes/         # Express Routes
├── client/
│   ├── src/
│       ├── crypto/     # encryption.ts (E2E Logic)
│       ├── pages/      # React Components
│       └── types/      # TypeScript Definitions
├── tests/              # Jest Unit Tests
├── e2e/                # Playwright E2E Tests
└── ssl/                # Certificates
```

---

## 🔮 Future Roadmap
1. **Message Pagination** - Load older messages on scroll
2. **Read Receipts** - Show who has read messages
3. **Push Notifications** - Web Push API for mobile
4. **Connection diagnostics** - Explain why a phone or laptop cannot join
5. **Desktop App** - Electron wrapper

---

## 📄 License
MIT License - free to use, modify, and distribute.

---
Built for private, internet-free communication on the same local network.
