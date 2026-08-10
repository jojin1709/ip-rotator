#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

const ipManager = require('./lib/ip-manager');
const macManager = require('./lib/mac-manager');
const proxyManager = require('./lib/proxy-manager');
const logger = require('./lib/logger');
const Dashboard = require('./lib/dashboard');

const program = new Command();

const CONFIG_FILE = path.join(__dirname, 'config.json');
const STATE_FILE = path.join(__dirname, 'state.json');

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  return {
    mode: 'tor',
    rotationInterval: 60,
    rotateUserAgent: true,
    killSwitch: false,
    proxies: [],
    interfaces: []
  };
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return {
    currentIP: null,
    currentMAC: null,
    rotations: 0,
    startTime: null,
    isRunning: false,
    history: []
  };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, 'utf8'));
}

program.name('ip-rotator').description('Automated IP and MAC address rotator for bug bounty and security testing').version('1.0.0');

// ==================== STATUS COMMAND ====================
program.command('status').description('Show current IP, MAC, and rotation status')
  .action(async () => {
    console.log(chalk.green('\n  IP Rotator Status\n'));
    
    const state = loadState();
    const config = loadConfig();
    
    try {
      const ipInfo = await ipManager.getCurrentIP();
      
      console.log(chalk.blue('  Current IP: ') + ipInfo.ip);
      console.log(chalk.blue('  Location: ') + (ipInfo.country || 'Unknown'));
      console.log(chalk.blue('  ISP: ') + (ipInfo.isp || 'Unknown'));
      console.log(chalk.blue('  Mode: ') + config.mode);
      console.log(chalk.blue('  Rotations: ') + state.rotations);
      
      if (state.startTime) {
        const uptime = Math.floor((Date.now() - state.startTime) / 1000);
        console.log(chalk.blue('  Uptime: ') + formatUptime(uptime));
      }
      
      const macInfo = await macManager.getCurrentMAC();
      if (macInfo) {
        console.log(chalk.blue('  Current MAC: ') + macInfo.mac);
        console.log(chalk.blue('  Interface: ') + macInfo.interface);
      }
      
    } catch (error) {
      console.log(chalk.red('  Error getting status: ' + error.message));
    }
  });

// ==================== START COMMAND ====================
program.command('start').description('Start IP/MAC rotation')
  .option('-m, --mode <mode>', 'Rotation mode (tor/proxy/vpn/manual)', 'tor')
  .option('-i, --interval <seconds>', 'Rotation interval in seconds', '60')
  .option('--mac', 'Also rotate MAC address')
  .option('--no-kill-switch', 'Disable kill switch')
  .option('--proxy <proxy>', 'Use specific proxy (protocol://host:port)')
  .option('--proxy-file <file>', 'Load proxies from file')
  .option('--rotate-ua', 'Rotate User-Agent with IP')
  .action(async (options) => {
    console.log(chalk.green('\n  Starting IP Rotator\n'));
    
    const config = loadConfig();
    config.mode = options.mode;
    config.rotationInterval = parseInt(options.interval);
    config.rotateUserAgent = options.rotateUa !== false;
    config.killSwitch = options.killSwitch !== false;
    config.macRotation = options.mac || false;
    
    if (options.proxy) {
      config.proxies = [options.proxy];
    }
    
    if (options.proxyFile && fs.existsSync(options.proxyFile)) {
      const proxies = fs.readFileSync(options.proxyFile, 'utf8')
        .split('\n')
        .map(p => p.trim())
        .filter(p => p && !p.startsWith('#'));
      config.proxies = [...config.proxies, ...proxies];
    }
    
    saveConfig(config);
    
    console.log(chalk.blue('  Mode: ' + config.mode));
    console.log(chalk.blue('  Interval: ' + config.rotationInterval + 's'));
    console.log(chalk.blue('  MAC Rotation: ' + (config.macRotation ? 'ON' : 'OFF')));
    console.log(chalk.blue('  Kill Switch: ' + (config.killSwitch ? 'ON' : 'OFF')));
    
    if (config.proxies.length > 0) {
      console.log(chalk.blue('  Proxies: ' + config.proxies.length + ' loaded'));
    }
    
    // Initialize based on mode
    try {
      if (config.mode === 'tor') {
        await ipManager.initTor();
        console.log(chalk.green('  ✓ Tor connected'));
      } else if (config.mode === 'proxy' && config.proxies.length > 0) {
        proxyManager.loadProxies(config.proxies);
        console.log(chalk.green('  ✓ Proxy mode ready'));
      }
      
      // Get initial IP
      const ipInfo = await ipManager.getCurrentIP();
      console.log(chalk.green('  ✓ Current IP: ' + ipInfo.ip));
      
      // Start rotation loop
      const state = loadState();
      state.isRunning = true;
      state.startTime = Date.now();
      state.currentIP = ipInfo.ip;
      saveState(state);
      
      console.log(chalk.green('\n  Rotation started! Press Ctrl+C to stop.\n'));
      
      // Rotation loop
      const rotate = async () => {
        try {
          let newIP;
          
          if (config.mode === 'tor') {
            newIP = await ipManager.rotateTor();
          } else if (config.mode === 'proxy') {
            newIP = await proxyManager.rotate();
          } else if (config.mode === 'vpn') {
            newIP = await ipManager.rotateVPN();
          }
          
          if (newIP) {
            const state = loadState();
            state.rotations++;
            state.currentIP = newIP.ip || newIP;
            state.history.push({
              timestamp: Date.now(),
              ip: state.currentIP,
              type: config.mode
            });
            
            // Keep only last 100 history entries
            if (state.history.length > 100) {
              state.history = state.history.slice(-100);
            }
            
            saveState(state);
            
            console.log(chalk.green('  [' + new Date().toLocaleTimeString() + '] IP rotated: ' + state.currentIP));
            
            // Rotate MAC if enabled
            if (config.macRotation) {
              const mac = await macManager.randomize();
              if (mac) {
                console.log(chalk.blue('  [' + new Date().toLocaleTimeString() + '] MAC rotated: ' + mac));
              }
            }
          }
        } catch (error) {
          console.log(chalk.red('  Rotation error: ' + error.message));
          
          // Kill switch
          if (config.killSwitch) {
            console.log(chalk.red('  Kill switch activated! Blocking internet...'));
            await ipManager.blockInternet();
          }
        }
      };
      
      // Run rotation at interval
      setInterval(rotate, config.rotationInterval * 1000);
      
    } catch (error) {
      console.log(chalk.red('  Failed to start: ' + error.message));
    }
  });

// ==================== STOP COMMAND ====================
program.command('stop').description('Stop IP/MAC rotation')
  .action(() => {
    console.log(chalk.green('\n  Stopping IP Rotator\n'));
    
    const state = loadState();
    state.isRunning = false;
    saveState(state);
    
    console.log(chalk.green('  ✓ Rotation stopped'));
    console.log(chalk.blue('  Total rotations: ' + state.rotations));
  });

// ==================== ROTATE COMMAND ====================
program.command('rotate').description('Rotate IP immediately')
  .option('-m, --mode <mode>', 'Rotation mode (tor/proxy/vpn)', 'tor')
  .option('--proxy <proxy>', 'Use specific proxy')
  .action(async (options) => {
    console.log(chalk.green('\n  Rotating IP\n'));
    
    try {
      let newIP;
      
      if (options.mode === 'tor') {
        await ipManager.initTor();
        newIP = await ipManager.rotateTor();
      } else if (options.mode === 'proxy' && options.proxy) {
        newIP = await ipManager.rotateViaProxy(options.proxy);
      }
      
      if (newIP) {
        console.log(chalk.green('  ✓ New IP: ' + (newIP.ip || newIP)));
        
        const state = loadState();
        state.rotations++;
        state.currentIP = newIP.ip || newIP;
        state.history.push({
          timestamp: Date.now(),
          ip: state.currentIP,
          type: options.mode
        });
        saveState(state);
      }
    } catch (error) {
      console.log(chalk.red('  Error: ' + error.message));
    }
  });

// ==================== MAC COMMAND ====================
program.command('mac').description('MAC address operations')
  .option('--show', 'Show current MAC')
  .option('--random', 'Randomize MAC')
  .option('--set <mac>', 'Set specific MAC')
  .option('--interface <iface>', 'Network interface', 'eth0')
  .option('--restore', 'Restore original MAC')
  .action(async (options) => {
    console.log(chalk.green('\n  MAC Address Manager\n'));
    
    try {
      if (options.show || (!options.random && !options.set && !options.restore)) {
        const mac = await macManager.getCurrentMAC(options.interface);
        if (mac) {
          console.log(chalk.blue('  Interface: ') + mac.interface);
          console.log(chalk.blue('  MAC: ') + mac.mac);
          console.log(chalk.blue('  Vendor: ') + (mac.vendor || 'Unknown'));
        } else {
          console.log(chalk.yellow('  No MAC found for interface: ' + options.interface));
        }
      }
      
      if (options.random) {
        const newMac = await macManager.randomize(options.interface);
        if (newMac) {
          console.log(chalk.green('  ✓ MAC randomized: ' + newMac));
        }
      }
      
      if (options.set) {
        const success = await macManager.setMAC(options.interface, options.set);
        if (success) {
          console.log(chalk.green('  ✓ MAC set to: ' + options.set));
        }
      }
      
      if (options.restore) {
        const success = await macManager.restore(options.interface);
        if (success) {
          console.log(chalk.green('  ✓ MAC restored'));
        }
      }
    } catch (error) {
      console.log(chalk.red('  Error: ' + error.message));
    }
  });

// ==================== PROXY COMMAND ====================
program.command('proxy').description('Manage proxies')
  .option('--add <proxy>', 'Add proxy (protocol://host:port)')
  .option('--file <file>', 'Load proxies from file')
  .option('--list', 'List all proxies')
  .option('--test', 'Test all proxies')
  .option('--clear', 'Clear all proxies')
  .option('--current', 'Show current proxy')
  .action(async (options) => {
    console.log(chalk.green('\n  Proxy Manager\n'));
    
    const config = loadConfig();
    
    if (options.add) {
      config.proxies = config.proxies || [];
      config.proxies.push(options.add);
      saveConfig(config);
      console.log(chalk.green('  ✓ Proxy added: ' + options.add));
    }
    
    if (options.file && fs.existsSync(options.file)) {
      const proxies = fs.readFileSync(options.file, 'utf8')
        .split('\n')
        .map(p => p.trim())
        .filter(p => p && !p.startsWith('#'));
      config.proxies = [...(config.proxies || []), ...proxies];
      saveConfig(config);
      console.log(chalk.green('  ✓ Loaded ' + proxies.length + ' proxies'));
    }
    
    if (options.list) {
      const proxies = config.proxies || [];
      if (proxies.length === 0) {
        console.log(chalk.yellow('  No proxies configured'));
      } else {
        console.log(chalk.blue('  Proxies:'));
        proxies.forEach((p, i) => {
          console.log('    ' + (i + 1) + '. ' + p);
        });
      }
    }
    
    if (options.test) {
      const proxies = config.proxies || [];
      console.log(chalk.blue('  Testing ' + proxies.length + ' proxies...\n'));
      
      for (const proxy of proxies) {
        try {
          const result = await proxyManager.test(proxy);
          console.log(chalk.green('  ✓ ' + proxy + ' - ' + result.ip));
        } catch (error) {
          console.log(chalk.red('  ✗ ' + proxy + ' - ' + error.message));
        }
      }
    }
    
    if (options.clear) {
      config.proxies = [];
      saveConfig(config);
      console.log(chalk.green('  ✓ All proxies cleared'));
    }
    
    if (options.current) {
      const current = proxyManager.getCurrent();
      if (current) {
        console.log(chalk.blue('  Current proxy: ') + current);
      } else {
        console.log(chalk.yellow('  No proxy in use'));
      }
    }
  });

// ==================== DASHBOARD COMMAND ====================
program.command('dashboard').description('Start web dashboard')
  .option('-p, --port <port>', 'Port', '8080')
  .action((options) => {
    console.log(chalk.green('\n  Starting Dashboard\n'));
    
    const dashboard = new Dashboard(loadConfig, loadState, saveState);
    dashboard.start(parseInt(options.port));
    
    console.log(chalk.green('  Dashboard: http://localhost:' + options.port));
  });

// ==================== CONFIG COMMAND ====================
program.command('config').description('Manage configuration')
  .option('--show', 'Show current config')
  .option('--init', 'Initialize config')
  .option('--set <key=value>', 'Set config value')
  .action((options) => {
    if (options.show) {
      const config = loadConfig();
      console.log(chalk.green('\n  Configuration:\n'));
      console.log(JSON.stringify(config, null, 2));
    }
    
    if (options.init) {
      const config = {
        mode: 'tor',
        rotationInterval: 60,
        rotateUserAgent: true,
        killSwitch: false,
        macRotation: false,
        proxies: [],
        interfaces: []
      };
      saveConfig(config);
      console.log(chalk.green('  ✓ Config initialized'));
    }
    
    if (options.set) {
      const [key, value] = options.set.split('=');
      const config = loadConfig();
      
      if (key.includes('.')) {
        const keys = key.split('.');
        let obj = config;
        for (let i = 0; i < keys.length - 1; i++) {
          obj = obj[keys[i]] || {};
        }
        obj[keys[keys.length - 1]] = value;
      } else {
        config[key] = value;
      }
      
      saveConfig(config);
      console.log(chalk.green('  ✓ Config updated: ' + key + ' = ' + value));
    }
  });

// ==================== HISTORY COMMAND ====================
program.command('history').description('Show rotation history')
  .option('-n, --limit <num>', 'Number of entries', '20')
  .action((options) => {
    console.log(chalk.green('\n  Rotation History\n'));
    
    const state = loadState();
    const history = (state.history || []).slice(-parseInt(options.limit));
    
    if (history.length === 0) {
      console.log(chalk.yellow('  No rotation history'));
      return;
    }
    
    console.log(chalk.blue('  Time                    IP                      Type'));
    console.log(chalk.blue('  ' + '-'.repeat(60)));
    
    history.forEach(entry => {
      const time = new Date(entry.timestamp).toLocaleString();
      console.log('  ' + time.padEnd(24) + entry.ip.padEnd(24) + entry.type);
    });
  });

// ==================== INTERFACES COMMAND ====================
program.command('interfaces').description('List network interfaces')
  .action(async () => {
    console.log(chalk.green('\n  Network Interfaces\n'));
    
    const interfaces = await macManager.getInterfaces();
    
    if (interfaces.length === 0) {
      console.log(chalk.yellow('  No interfaces found'));
      return;
    }
    
    interfaces.forEach(iface => {
      console.log(chalk.blue('  ' + iface.name));
      console.log('    MAC: ' + (iface.mac || 'N/A'));
      console.log('    IP: ' + (iface.ip || 'N/A'));
      console.log('');
    });
  });

// ==================== SECURITY CHECKS ====================
program.command('security').description('Security leak checks')
  .option('--dns', 'Check for DNS leaks')
  .option('--webrtc', 'Check for WebRTC IP leak')
  .option('--all', 'Run all security checks')
  .action(async (options) => {
    console.log(chalk.green('\n  Security Checks\n'));
    
    const ipManager = require('./lib/ip-manager');
    
    if (options.dns || options.all) {
      console.log(chalk.blue('  Checking DNS leaks...'));
      const dnsResult = await ipManager.checkDNSLeak();
      
      if (dnsResult.leaks) {
        console.log(chalk.red('  ⚠ DNS LEAK DETECTED!'));
        console.log(chalk.yellow('  Unique IPs found: ' + dnsResult.uniqueIPs.join(', ')));
      } else {
        console.log(chalk.green('  ✓ No DNS leaks detected'));
      }
      console.log('');
    }
    
    if (options.webrtc || options.all) {
      console.log(chalk.blue('  Checking WebRTC leaks...'));
      const webrtcResult = await ipManager.checkWebRTCLeak();
      
      if (webrtcResult.leaked) {
        console.log(chalk.red('  ⚠ WEBRTC LEAK DETECTED!'));
        console.log(chalk.yellow('  Leaked IP: ' + webrtcResult.ip));
      } else {
        console.log(chalk.green('  ✓ No WebRTC leaks detected'));
      }
      console.log('');
    }
  });

// ==================== QUICK COMMANDS ====================
program.command('quick').description('Quick operations')
  .option('--test', 'Quick test - show current IP and latency')
  .option('--rotate-once', 'Rotate IP once and exit')
  .option('--safe-mode', 'Start with kill switch and security checks')
  .action(async (options) => {
    console.log(chalk.green('\n  Quick Operations\n'));
    
    const ipManager = require('./lib/ip-manager');
    
    if (options.test) {
      console.log(chalk.blue('  Testing connectivity...'));
      const start = Date.now();
      const ipInfo = await ipManager.getCurrentIP();
      const latency = Date.now() - start;
      
      console.log(chalk.green('  IP: ' + ipInfo.ip));
      console.log(chalk.green('  Location: ' + ipInfo.country + ', ' + ipInfo.city));
      console.log(chalk.green('  ISP: ' + ipInfo.isp));
      console.log(chalk.green('  Latency: ' + latency + 'ms'));
    }
    
    if (options.rotateOnce) {
      console.log(chalk.blue('  Rotating IP...'));
      try {
        const newIP = await ipManager.rotateTor();
        console.log(chalk.green('  ✓ New IP: ' + newIP.ip));
      } catch (error) {
        console.log(chalk.red('  Error: ' + error.message));
      }
    }
    
    if (options.safeMode) {
      console.log(chalk.blue('  Starting in safe mode...'));
      
      // Run security checks first
      console.log(chalk.blue('  Running security checks...'));
      const dnsResult = await ipManager.checkDNSLeak();
      const webrtcResult = await ipManager.checkWebRTCLeak();
      
      if (dnsResult.leaks || webrtcResult.leaked) {
        console.log(chalk.red('  ⚠ Security issues detected!'));
        if (dnsResult.leaks) console.log(chalk.red('    - DNS leak'));
        if (webrtcResult.leaked) console.log(chalk.red('    - WebRTC leak'));
        console.log(chalk.yellow('  Consider fixing these before proceeding'));
      } else {
        console.log(chalk.green('  ✓ All security checks passed'));
      }
    }
  });

// ==================== USER-AGENT COMMAND ====================
program.command('ua').description('User-Agent operations')
  .option('--show', 'Show current User-Agent')
  .option('--rotate', 'Get a random User-Agent')
  .option('--test', 'Test with rotated User-Agent')
  .action(async (options) => {
    console.log(chalk.green('\n  User-Agent Manager\n'));
    
    const UserAgent = require('user-agents');
    
    if (options.show || (!options.rotate && !options.test)) {
      const ua = new UserAgent();
      console.log(chalk.blue('  Current User-Agent:'));
      console.log('  ' + ua.toString());
      console.log('');
      console.log(chalk.blue('  Browser: ') + (ua.browserFamily || 'Unknown'));
      console.log(chalk.blue('  OS: ') + (ua.osFamily || 'Unknown'));
      console.log(chalk.blue('  Device: ') + (ua.deviceFamily || 'Unknown'));
    }
    
    if (options.rotate) {
      const ua = new UserAgent();
      console.log(chalk.green('  Random User-Agent:'));
      console.log('  ' + ua.toString());
    }
    
    if (options.test) {
      console.log(chalk.blue('  Testing with random User-Agent...'));
      const ua = new UserAgent();
      const axios = require('axios');
      
      try {
        const response = await axios.get('https://api.ipify.org?format=json', {
          headers: { 'User-Agent': ua.toString() },
          timeout: 10000
        });
        console.log(chalk.green('  ✓ IP: ' + response.data.ip));
        console.log(chalk.green('  Used UA: ' + ua.toString().substring(0, 50) + '...'));
      } catch (error) {
        console.log(chalk.red('  Error: ' + error.message));
      }
    }
  });

// ==================== EXPORT COMMAND ====================
program.command('export').description('Export data')
  .option('-f, --format <fmt>', 'Format (json/csv)', 'json')
  .option('--history', 'Export rotation history')
  .option('--logs', 'Export logs')
  .option('--config', 'Export config')
  .option('--all', 'Export all')
  .action((options) => {
    console.log(chalk.green('\n  Export Data\n'));
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (options.history || options.all) {
      const state = loadState();
      const file = `history-${ts}.${options.format}`;
      if (options.format === 'csv') {
        const csv = 'Time,IP,Type\n' + (state.history || [])
          .map(h => `${new Date(h.timestamp).toISOString()},${h.ip},${h.type}`).join('\n');
        fs.writeFileSync(file, csv);
      } else {
        fs.writeFileSync(file, JSON.stringify(state.history || [], null, 2));
      }
      console.log(chalk.green('  ✓ History -> ' + file));
    }
    
    if (options.logs || options.all) {
      const logs = logger.getLogs(1000);
      const file = `logs-${ts}.txt`;
      fs.writeFileSync(file, logs.join('\n'));
      console.log(chalk.green('  ✓ Logs -> ' + file));
    }
    
    if (options.config || options.all) {
      const file = `config-${ts}.json`;
      fs.writeFileSync(file, JSON.stringify(loadConfig(), null, 2));
      console.log(chalk.green('  ✓ Config -> ' + file));
    }
  });

// ==================== PROFILES COMMAND ====================
program.command('profiles').description('Manage config profiles')
  .option('--list', 'List profiles')
  .option('--save <name>', 'Save current as profile')
  .option('--load <name>', 'Load profile')
  .option('--delete <name>', 'Delete profile')
  .action((options) => {
    console.log(chalk.green('\n  Config Profiles\n'));
    const dir = path.join(__dirname, 'profiles');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    
    if (options.list) {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
      if (files.length === 0) {
        console.log(chalk.yellow('  No profiles'));
      } else {
        files.forEach(f => console.log('    - ' + path.basename(f, '.json')));
      }
    }
    if (options.save) {
      fs.writeFileSync(path.join(dir, options.save + '.json'), JSON.stringify(loadConfig(), null, 2));
      console.log(chalk.green('  ✓ Saved: ' + options.save));
    }
    if (options.load) {
      const f = path.join(dir, options.load + '.json');
      if (fs.existsSync(f)) {
        saveConfig(JSON.parse(fs.readFileSync(f, 'utf8')));
        console.log(chalk.green('  ✓ Loaded: ' + options.load));
      } else {
        console.log(chalk.red('  Not found: ' + options.load));
      }
    }
    if (options.delete) {
      const f = path.join(dir, options.delete + '.json');
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
        console.log(chalk.green('  ✓ Deleted: ' + options.delete));
      }
    }
  });

// ==================== SPEED COMMAND ====================
program.command('speed').description('Test proxy speed')
  .option('-p, --proxy <proxy>', 'Test single proxy')
  .option('--file <file>', 'Test proxies from file')
  .action(async (options) => {
    console.log(chalk.green('\n  Proxy Speed Test\n'));
    const testProxy = async (proxy) => {
      const start = Date.now();
      try {
        const config = { timeout: 15000 };
        if (proxy.startsWith('socks')) {
          const { SocksProxyAgent } = require('socks-proxy-agent');
          config.httpsAgent = new SocksProxyAgent(proxy);
        } else {
          const { HttpProxyAgent } = require('http-proxy-agent');
          config.httpsAgent = new HttpProxyAgent(proxy);
        }
        const res = await axios.get('https://api.ipify.org?format=json', config);
        return { proxy, ip: res.data.ip, latency: Date.now() - start, status: 'alive' };
      } catch (e) {
        return { proxy, ip: null, latency: null, status: 'dead' };
      }
    };
    
    if (options.proxy) {
      const r = await testProxy(options.proxy);
      if (r.status === 'alive') {
        console.log(chalk.green(`  ✓ ${r.proxy} -> ${r.ip} (${r.latency}ms)`));
      } else {
        console.log(chalk.red(`  ✗ ${r.proxy} -> DEAD`));
      }
    }
    
    if (options.file && fs.existsSync(options.file)) {
      const proxies = fs.readFileSync(options.file, 'utf8').split('\n').map(p => p.trim()).filter(p => p && !p.startsWith('#'));
      console.log(chalk.blue(`  Testing ${proxies.length} proxies...\n`));
      const results = [];
      for (const p of proxies) {
        const r = await testProxy(p);
        results.push(r);
        const icon = r.status === 'alive' ? '✓' : '✗';
        const color = r.status === 'alive' ? chalk.green : chalk.red;
        const info = r.status === 'alive' ? `${r.ip} (${r.latency}ms)` : 'DEAD';
        console.log(color(`  ${icon} ${r.proxy} -> ${info}`));
      }
      const alive = results.filter(r => r.status === 'alive').sort((a, b) => a.latency - b.latency);
      if (alive.length > 0) {
        console.log(chalk.blue('\n  Top 5 fastest:'));
        alive.slice(0, 5).forEach((r, i) => {
          console.log(chalk.green(`    ${i + 1}. ${r.proxy} - ${r.latency}ms`));
        });
      }
    }
  });

// ==================== CHECK COMMAND ====================
program.command('check').description('Quick security audit')
  .action(async () => {
    console.log(chalk.green('\n  Security Audit\n'));
    
    // Get current IP
    const ipInfo = await ipManager.getCurrentIP();
    console.log(chalk.blue('  Current IP: ') + ipInfo.ip);
    console.log(chalk.blue('  Location: ') + ipInfo.country + ', ' + ipInfo.city);
    console.log(chalk.blue('  ISP: ') + ipInfo.isp);
    
    // DNS leak check
    console.log(chalk.blue('\n  DNS Leak Check:'));
    const dns = await ipManager.checkDNSLeak();
    if (dns.leaks) {
      console.log(chalk.red('    ⚠ LEAK DETECTED - ' + dns.uniqueIPs.length + ' different IPs'));
    } else {
      console.log(chalk.green('    ✓ No DNS leaks'));
    }
    
    // WebRTC check
    console.log(chalk.blue('\n  WebRTC Leak Check:'));
    const webrtc = await ipManager.checkWebRTCLeak();
    if (webrtc.leaked) {
      console.log(chalk.red('    ⚠ LEAK DETECTED - IP: ' + webrtc.ip));
    } else {
      console.log(chalk.green('    ✓ No WebRTC leaks'));
    }
    
    // Connectivity
    console.log(chalk.blue('\n  Connectivity:'));
    const test = await ipManager.testConnectivity();
    if (test.connected) {
      console.log(chalk.green('    ✓ Online - Latency: ' + test.latency + 'ms'));
    } else {
      console.log(chalk.red('    ✗ Offline'));
    }
    
    console.log(chalk.green('\n  Audit complete!\n'));
  });

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (days > 0) return days + 'd ' + hours + 'h ' + mins + 'm';
  if (hours > 0) return hours + 'h ' + mins + 'm ' + secs + 's';
  if (mins > 0) return mins + 'm ' + secs + 's';
  return secs + 's';
}

program.parse();
