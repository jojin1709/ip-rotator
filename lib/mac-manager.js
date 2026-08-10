const { execSync, exec } = require('child_process');
const logger = require('./logger');
const os = require('os');

class MACManager {
  constructor() {
    this.originalMACs = {};
    this.platform = os.platform();
  }

  async getInterfaces() {
    return new Promise((resolve) => {
      if (this.platform === 'win32') {
        // Windows
        exec('getmac /fo csv /nh', (error, stdout) => {
          if (error) {
            resolve([]);
            return;
          }
          
          const interfaces = [];
          const lines = stdout.split('\n').filter(line => line.trim());
          
          lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 1) {
              const mac = parts[0].replace(/"/g, '').trim();
              const name = parts.length >= 3 ? parts[2].replace(/"/g, '').trim() : 'Unknown';
              
              if (mac && mac !== 'N/A' && mac !== 'Not Connected') {
                interfaces.push({
                  name,
                  mac,
                  ip: 'N/A'
                });
              }
            }
          });
          
          resolve(interfaces);
        });
      } else {
        // Linux/macOS
        exec('ip link show', (error, stdout) => {
          if (error) {
            // Try ifconfig
            exec('ifconfig', (error, stdout) => {
              if (error) {
                resolve([]);
                return;
              }
              resolve(this.parseIfconfig(stdout));
            });
            return;
          }
          
          const interfaces = [];
          const blocks = stdout.split('\n\n');
          
          blocks.forEach(block => {
            const nameMatch = block.match(/^\d+:\s+(\w+):/);
            const macMatch = block.match(/link\/ether\s+([0-9a-f:]{17})/i);
            
            if (nameMatch && macMatch) {
              const name = nameMatch[1];
              const mac = macMatch[1];
              
              // Skip loopback
              if (name === 'lo') return;
              
              interfaces.push({
                name,
                mac,
                ip: 'N/A'
              });
            }
          });
          
          resolve(interfaces);
        });
      }
    });
  }

  parseIfconfig(output) {
    const interfaces = [];
    const blocks = output.split('\n\n');
    
    blocks.forEach(block => {
      const nameMatch = block.match(/^(\w+):/);
      const macMatch = block.match(/ether\s+([0-9a-f:]{17})/i);
      
      if (nameMatch && macMatch) {
        const name = nameMatch[1];
        const mac = macMatch[1];
        
        if (name === 'lo0' || name === 'lo') return;
        
        interfaces.push({
          name,
          mac,
          ip: 'N/A'
        });
      }
    });
    
    return interfaces;
  }

  async getCurrentMAC(interfaceName = null) {
    const interfaces = await this.getInterfaces();
    
    if (interfaceName) {
      return interfaces.find(i => i.name === interfaceName) || null;
    }
    
    // Return first non-loopback interface
    return interfaces[0] || null;
  }

  async setMAC(interfaceName, newMAC) {
    return new Promise((resolve) => {
      // Save original if not saved
      if (!this.originalMACs[interfaceName]) {
        this.getCurrentMAC(interfaceName).then(mac => {
          if (mac) this.originalMACs[interfaceName] = mac.mac;
        });
      }

      if (this.platform === 'win32') {
        // Windows - modify registry
        const regPath = `HKLM\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}`;
        exec(`reg query "${regPath}" /s /f "${interfaceName}"`, (error, stdout) => {
          if (error) {
            resolve(false);
            return;
          }
          
          // Find the correct subkey
          const subkeyMatch = stdout.match(/HKEY_LOCAL_MACHINE\\[^\\]+\\[^\\]+\\(\d+)/);
          if (subkeyMatch) {
            const subkey = `${regPath}\\${subkeyMatch[1]}`;
            const macNoSeparator = newMAC.replace(/:/g, '');
            
            exec(`reg add "${subkey}" /v NetworkAddress /d ${macNoSeparator} /f`, (error) => {
              resolve(!error);
            });
          } else {
            resolve(false);
          }
        });
      } else {
        // Linux/macOS
        const commands = [
          `sudo ip link set dev ${interfaceName} down`,
          `sudo macchanger -m ${newMAC} ${interfaceName}`,
          `sudo ip link set dev ${interfaceName} up`
        ];
        
        exec(commands.join(' && '), (error) => {
          if (error) {
            // Try ifconfig method
            exec(`sudo ifconfig ${interfaceName} down && sudo ifconfig ${interfaceName} ether ${newMAC} && sudo ifconfig ${interfaceName} up`, (error) => {
              resolve(!error);
            });
          } else {
            resolve(true);
          }
        });
      }
    });
  }

  async randomize(interfaceName = null) {
    const interfaces = await this.getInterfaces();
    
    if (!interfaceName && interfaces.length > 0) {
      interfaceName = interfaces[0].name;
    }
    
    if (!interfaceName) {
      throw new Error('No network interface found');
    }

    const newMAC = this.generateRandomMAC();
    const success = await this.setMAC(interfaceName, newMAC);
    
    if (success) {
      logger.info('MAC randomized: ' + interfaceName + ' -> ' + newMAC);
      return newMAC;
    }
    
    throw new Error('Failed to set MAC address');
  }

  async restore(interfaceName = null) {
    const interfaces = await this.getInterfaces();
    
    if (!interfaceName && interfaces.length > 0) {
      interfaceName = interfaces[0].name;
    }
    
    if (!interfaceName || !this.originalMACs[interfaceName]) {
      throw new Error('No original MAC to restore');
    }

    return await this.setMAC(interfaceName, this.originalMACs[interfaceName]);
  }

  generateRandomMAC() {
    // Generate random locally administered MAC
    const hex = '0123456789abcdef';
    let mac = '';
    
    for (let i = 0; i < 6; i++) {
      let byte = Math.floor(Math.random() * 256);
      
      // Set locally administered bit, clear multicast bit
      byte = (byte & 0xFE) | 0x02;
      
      if (i > 0) mac += ':';
      mac += byte.toString(16).padStart(2, '0');
    }
    
    return mac;
  }

  async getVendor(mac) {
    try {
      const axios = require('axios');
      const response = await axios.get(`https://api.macvendors.com/${mac}`, { timeout: 5000 });
      return response.data;
    } catch (error) {
      return null;
    }
  }
}

module.exports = new MACManager();
