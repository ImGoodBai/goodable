#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const net = require('net');

const rootDir = path.join(__dirname, '..');
const envFile = path.join(rootDir, '.env');
const webEnvFile = path.join(rootDir, 'apps', 'web', '.env.local');

// Default ports
const DEFAULT_API_PORT = 8080;
const DEFAULT_WEB_PORT = 3000;

// Check if port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

// Find available port starting from default
async function findAvailablePort(startPort) {
  let port = startPort;
  while (!(await isPortAvailable(port))) {
    port++;
  }
  return port;
}

async function setupEnvironment() {
  console.log('Setting up environment...');
  
  try {
    // Ensure data directory exists
    const dataDir = path.join(rootDir, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('  Created data directory');
    }
    
    // Find available ports
    const apiPort = await findAvailablePort(DEFAULT_API_PORT);
    const webPort = await findAvailablePort(DEFAULT_WEB_PORT);
    
    if (apiPort !== DEFAULT_API_PORT) {
      console.log(`  API port ${DEFAULT_API_PORT} is busy, using ${apiPort}`);
    } else {
      console.log(`  API port: ${apiPort}`);
    }
    
    if (webPort !== DEFAULT_WEB_PORT) {
      console.log(`  Web port ${DEFAULT_WEB_PORT} is busy, using ${webPort}`);
    } else {
      console.log(`  Web port: ${webPort}`);
    }
    
    // Create root .env file
    const envContent = `# Auto-generated environment configuration
API_PORT=${apiPort}
WEB_PORT=${webPort}
DATABASE_URL=sqlite:///${path.join(rootDir, 'data', 'cc.db')}
`;
    
    fs.writeFileSync(envFile, envContent);
    console.log(`  Created .env`);
    
    // Create web .env.local file (only if it doesn't exist)
    if (!fs.existsSync(webEnvFile)) {
      const webEnvContent = `# Auto-generated environment configuration
NEXT_PUBLIC_API_BASE=http://localhost:${apiPort}
NEXT_PUBLIC_WS_BASE=ws://localhost:${apiPort}
`;
      
      fs.writeFileSync(webEnvFile, webEnvContent);
      console.log(`  Created apps/web/.env.local`);
    } else {
      console.log(`  apps/web/.env.local already exists, skipping`);
    }
    
    console.log('  Environment setup complete!');
    
    if (apiPort !== DEFAULT_API_PORT || webPort !== DEFAULT_WEB_PORT) {
      console.log('\n  Note: Using non-default ports');
      console.log(`     API: http://localhost:${apiPort}`);
      console.log(`     Web: http://localhost:${webPort}`);
    }
    
    // Return ports for use in other scripts
    return { apiPort, webPort };
  } catch (error) {
    console.error('\nFailed to setup environment');
    console.error('Error:', error.message);
    console.error('\nHow to fix:');
    console.error('   1. Check file permissions');
    console.error('   2. Ensure you have write access to the project directory');
    console.error('   3. Try running with elevated permissions if needed');
    process.exit(1);
  }
}

// If run directly
if (require.main === module) {
  setupEnvironment().catch(console.error);
}

module.exports = { setupEnvironment, findAvailablePort };