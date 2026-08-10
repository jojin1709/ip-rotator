<div align="center">

# ⚡ IP Rotator

**Automated IP & MAC Address Rotator for Bug Bounty and Security Testing**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-brightgreen.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue.svg)]()
[![Version](https://img.shields.io/badge/Version-1.0.0-orange.svg)]()

---

**IP Rotator** is a powerful CLI tool for rotating IP addresses through Tor, proxies, or VPN with MAC address randomization, security leak checks, and a web dashboard.

Run it against targets you own or have authorization to test.

---

[Quick Start](#quick-start) • [Commands](#commands) • [Dashboard](#dashboard) • [Security Checks](#security-checks) • [License](#license)

</div>

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Dashboard](#dashboard)
- [Security Checks](#security-checks)
- [Platform Support](#platform-support)
- [Requirements](#requirements)
- [License](#license)

---

## Features

| Feature | Description |
|---------|-------------|
| **IP Rotation** | Rotate through Tor, HTTP/SOCKS proxies, or VPN |
| **MAC Changer** | Randomize, set, or restore MAC addresses |
| **Proxy Pool** | Load, test, and rotate through proxy lists |
| **DNS Leak Check** | Detect if DNS requests leak your real IP |
| **WebRTC Leak Check** | Detect WebRTC IP exposure |
| **User-Agent Rotation** | Randomize browser fingerprints |
| **Kill Switch** | Block internet if rotation fails |
| **Web Dashboard** | Real-time monitoring UI |
| **Config Profiles** | Save/load different configurations |
| **Export** | Export history, logs, config to JSON/CSV |

---

## Quick Start

### Prerequisites

- **Node.js 16+**
- **Tor** (for Tor mode): `sudo apt install tor`
- **macchanger** (for MAC rotation): `sudo apt install macchanger`

### Install

```bash
git clone https://github.com/jojin1709/ip-rotator.git
cd ip-rotator
npm install
```

### Run

```bash
# Show current status
node rotator.js status

# Quick security audit
node rotator.js check

# Start rotation with Tor
node rotator.js start --mode tor --interval 60

# Rotate IP immediately
node rotator.js rotate --mode tor

# Open web dashboard
node rotator.js dashboard
```

---

## Commands

### Core

| Command | Description |
|---------|-------------|
| `status` | Show current IP, MAC, and rotation status |
| `start` | Start IP/MAC rotation |
| `stop` | Stop rotation |
| `rotate` | Rotate IP immediately |

### MAC Address

| Command | Description |
|---------|-------------|
| `mac --show` | Show current MAC address |
| `mac --random` | Randomize MAC address |
| `mac --set <mac>` | Set specific MAC address |
| `mac --restore` | Restore original MAC |

### Proxy Management

| Command | Description |
|---------|-------------|
| `proxy --add <proxy>` | Add a proxy |
| `proxy --file <file>` | Load proxies from file |
| `proxy --list` | List all proxies |
| `proxy --test` | Test all proxies |
| `speed --proxy <proxy>` | Test proxy speed |

### Security Checks

| Command | Description |
|---------|-------------|
| `security --dns` | Check for DNS leaks |
| `security --webrtc` | Check for WebRTC leaks |
| `security --all` | Run all security checks |
| `check` | Quick security audit |

### User-Agent

| Command | Description |
|---------|-------------|
| `ua --show` | Show random User-Agent |
| `ua --rotate` | Rotate User-Agent |
| `ua --test` | Test with random User-Agent |

### Data & Config

| Command | Description |
|---------|-------------|
| `export --history` | Export rotation history |
| `export --logs` | Export logs |
| `profiles --save <name>` | Save config profile |
| `profiles --load <name>` | Load config profile |
| `dashboard` | Start web dashboard |

### Start Options

```bash
node rotator.js start [options]

Options:
  -m, --mode <mode>      Rotation mode: tor, proxy, vpn (default: tor)
  -i, --interval <sec>   Rotation interval in seconds (default: 60)
  --mac                  Also rotate MAC address
  --proxy <proxy>        Use specific proxy
  --proxy-file <file>    Load proxies from file
  --rotate-ua            Rotate User-Agent with IP
  --no-kill-switch       Disable kill switch
```

---

## Dashboard

Start the web dashboard to monitor rotation in real-time:

```bash
node rotator.js dashboard --port 8080
```

Features:
- Current IP and status
- Rotation history
- Network statistics
- Log viewer
- One-click IP rotation

---

## Security Checks

### DNS Leak Check

```bash
node rotator.js security --dns
```

Detects if DNS requests are bypassing your proxy/Tor and revealing your real IP.

### WebRTC Leak Check

```bash
node rotator.js security --webrtc
```

Detects if WebRTC is exposing your local or public IP address.

### Full Audit

```bash
node rotator.js check
```

Runs all security checks and displays a complete status report.

---

## Platform Support

| Platform | IP Rotation | MAC Changer | Tor | Dashboard |
|----------|-------------|-------------|-----|-----------|
| **Windows** | ✅ | ✅ | ⚠️ | ✅ |
| **Linux (Kali)** | ✅ | ✅ | ✅ | ✅ |
| **macOS** | ✅ | ⚠️ | ⚠️ | ✅ |

---

## Requirements

- **Node.js** 16+
- **Tor** (for Tor mode)
- **macchanger** (for MAC rotation on Linux)
- **OpenVPN** (for VPN mode)

---

## License

MIT License - see [LICENSE](LICENSE)

---

<div align="center">

**Built by [JOJIN JOHN](https://github.com/jojin1709)**

</div>
