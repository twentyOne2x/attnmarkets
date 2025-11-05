#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');
const process = require('node:process');

const packageDir = path.resolve(__dirname, '..');
const useMockApi = process.env.USE_MOCK_API !== '0';
const mockPort = process.env.MOCK_API_PORT || '3999';
let mockProcess = null;

const cleanup = (signal) => {
  if (mockProcess && !mockProcess.killed) {
    try {
      mockProcess.kill(signal || 'SIGTERM');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to terminate mock API process', err);
    }
  }
};

if (useMockApi) {
  mockProcess = spawn('node', ['scripts/mock-api-server.js', mockPort], {
    cwd: packageDir,
    stdio: 'inherit',
    env: process.env,
  });
}

const nextArgs = ['dev', '--', '--hostname', process.env.HOSTNAME || '127.0.0.1', '--port', process.env.PORT || '3100'];
const nextProcess = spawn('pnpm', nextArgs, {
  cwd: packageDir,
  stdio: 'inherit',
  env: process.env,
});

const handleExit = (code, signal) => {
  cleanup(signal);
  if (!nextProcess.killed) {
    try {
      nextProcess.kill(signal || 'SIGTERM');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Failed to terminate Next.js dev server', err);
    }
  }
  if (typeof code === 'number') {
    process.exit(code);
  } else if (signal) {
    process.exit(0);
  }
};

nextProcess.on('exit', (code, signal) => {
  cleanup(signal);
  process.exit(code ?? 0);
});

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
  process.on(signal, () => {
    handleExit(undefined, signal);
  });
});
