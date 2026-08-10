const axios = require('axios');
const { execSync, exec } = require('child_process');
const logger = require('./logger');
const EventEmitter = require('eventemitter3');
const UserAgent = require('user-agents');

class IPManager extends EventEmitter {
  constructor() {
    super();
    this.torConnected = false;
    this.currentProxy = null;
  }

  async getCurrentIP(proxy = null, rotateUA = false) {
    try {
      const config = { timeout: 10000 };
      
      // Rotate User-Agent if enabled
      if (rotateUA) {
        const ua = new UserAgent();
        config.headers = { 'User-Agent': ua.toString() };
      }
      
      if (proxy) {
        const { HttpProxyAgent } = require('http-proxy-agent');
        const { SocksProxyAgent } = require('socks-proxy-agent');
        
        if (proxy.startsWith('socks')) {
          config.httpsAgent = new SocksProxyAgent(proxy);
          config.httpAgent = new SocksProxyAgent(proxy);
        } else {
          config.httpsAgent = new HttpProxyAgent(proxy);
          config.httpAgent = new HttpProxyAgent(proxy);
        }
      }

      const response = await axios.get('https://api.ipify.org?format=json', config);
      const ip = response.data.ip;

      // Get location info
      let location = {};
      try {
        const geoResponse = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 5000 });
        location = geoResponse.data;
      } catch (e) {}

      return {
        ip,
        country: location.country_name || 'Unknown',
        city: location.city || 'Unknown',
        isp: location.org || 'Unknown',
        timezone: location.timezone || 'Unknown'
      };
    } catch (error) {
      throw new Error('Failed to get IP: ' + error.message);
    }
  }

  async initTor() {
    return new Promise((resolve, reject) => {
      exec('tor --version', (error) => {
        if (error) {
          reject(new Error('Tor not installed. Install with: sudo apt install tor'));
          return;
        }

        // Start Tor service
        exec('sudo systemctl start tor', (error) => {
          if (error) {
            // Try starting directly
            exec('tor &', (error) => {
              if (error) {
                reject(new Error('Failed to start Tor'));
                return;
              }
              setTimeout(() => {
                this.torConnected = true;
                resolve(true);
              }, 3000);
            });
          } else {
            setTimeout(() => {
              this.torConnected = true;
              resolve(true);
            }, 3000);
          }
        });
      });
    });
  }

  async rotateTor() {
    if (!this.torConnected) {
      await this.initTor();
    }

    return new Promise((resolve, reject) => {
      // Send SIGHUP to Tor to get new circuit
      exec('sudo kill -HUP $(cat /var/run/tor/tor.pid 2>/dev/null || pgrep tor)', (error) => {
        if (error) {
          // Try alternative method
          exec('echo -e \'AUTHENTICATE ""\\r\\nSIGNAL NEWNYM\\r\\nQUIT\\r\' | nc 127.0.0.1 9051', (error) => {
            if (error) {
              reject(new Error('Failed to rotate Tor'));
              return;
            }
            setTimeout(async () => {
              try {
                const ip = await this.getCurrentIP('socks5://127.0.0.1:9050');
                resolve(ip);
              } catch (e) {
                reject(e);
              }
            }, 3000);
          });
        } else {
          setTimeout(async () => {
            try {
              const ip = await this.getCurrentIP('socks5://127.0.0.1:9050');
              resolve(ip);
            } catch (e) {
              reject(e);
            }
          }, 3000);
        }
      });
    });
  }

  async rotateViaProxy(proxy) {
    return await this.getCurrentIP(proxy);
  }

  async rotateVPN() {
    return new Promise((resolve, reject) => {
      // Disconnect and reconnect VPN
      exec('sudo pkill openvpn; sleep 2; sudo openvpn --config /etc/openvpn/client.conf --daemon', (error) => {
        if (error) {
          reject(new Error('Failed to rotate VPN. Check OpenVPN config.'));
          return;
        }
        
        setTimeout(async () => {
          try {
            const ip = await this.getCurrentIP();
            resolve(ip);
          } catch (e) {
            reject(e);
          }
        }, 5000);
      });
    });
  }

  async blockInternet() {
    return new Promise((resolve) => {
      // Block all outbound traffic except Tor
      exec('sudo iptables -F OUTPUT; sudo iptables -A OUTPUT -d 127.0.0.0/8 -j ACCEPT; sudo iptables -A OUTPUT -d 10.0.0.0/8 -j ACCEPT; sudo iptables -A OUTPUT -p tcp --dport 9050 -j ACCEPT; sudo iptables -A OUTPUT -j DROP', (error) => {
        if (error) {
          logger.error('Failed to block internet: ' + error.message);
        }
        resolve(!error);
      });
    });
  }

  async unblockInternet() {
    return new Promise((resolve) => {
      exec('sudo iptables -F OUTPUT', (error) => {
        resolve(!error);
      });
    });
  }

  async testConnectivity(proxy = null) {
    try {
      const start = Date.now();
      await this.getCurrentIP(proxy);
      const latency = Date.now() - start;
      return { connected: true, latency };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  async checkDNSLeak(proxy = null) {
    const dnsServers = [];
    const tests = [
      'https://api.ipify.org',
      'https://ifconfig.me',
      'https://icanhazip.com'
    ];
    
    for (const test of tests) {
      try {
        const config = { timeout: 5000 };
        if (proxy) {
          const { HttpProxyAgent } = require('http-proxy-agent');
          const { SocksProxyAgent } = require('socks-proxy-agent');
          
          if (proxy.startsWith('socks')) {
            config.httpsAgent = new SocksProxyAgent(proxy);
          } else {
            config.httpsAgent = new HttpProxyAgent(proxy);
          }
        }
        
        const response = await axios.get(test, config);
        dnsServers.push({ server: test, ip: response.data.trim() });
      } catch (e) {}
    }
    
    const uniqueIPs = [...new Set(dnsServers.map(d => d.ip))];
    return {
      servers: dnsServers,
      leaks: uniqueIPs.length > 1,
      uniqueIPs
    };
  }

  async checkWebRTCLeak() {
    return new Promise((resolve) => {
      try {
        const http = require('http');
        const server = http.createServer((req, res) => {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
            <body>
            <script>
            const pc = new RTCPeerConnection({iceServers: []});
            const noop = () => {};
            pc.createDataChannel('');
            pc.createOffer().then(offer => {
              pc.setLocalDescription(offer, noop, noop);
            });
            pc.onicecandidate = (event) => {
              if (event.candidate) {
                const ip = event.candidate.address;
                document.title = 'WEBRTC_IP:' + ip;
              } else {
                document.title = 'WEBRTC_DONE';
              }
            };
            setTimeout(() => {
              fetch('/result?ip=' + document.title.replace('WEBRTC_IP:', '').replace('WEBRTC_DONE', 'none'))
                .then(() => window.close());
            }, 2000);
            </script>
            </body>
            </html>
          `);
        });
        
        let webrtcIP = null;
        server.on('request', (req, res) => {
          if (req.url.startsWith('/result')) {
            const url = new URL(req.url, 'http://localhost');
            webrtcIP = url.searchParams.get('ip');
            res.writeHead(200);
            res.end('ok');
            server.close();
            resolve({ leaked: webrtcIP && webrtcIP !== 'none', ip: webrtcIP });
          }
        });
        
        server.listen(0, () => {
          logger.info('WebRTC test server on port ' + server.address().port);
        });
        
        setTimeout(() => {
          server.close();
          resolve({ leaked: false, ip: null, timeout: true });
        }, 5000);
      } catch (error) {
        resolve({ leaked: false, error: error.message });
      }
    });
  }
}

module.exports = new IPManager();
