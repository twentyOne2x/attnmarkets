#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const now = new Date();
const day = now.toISOString().slice(0, 10);
const safeStamp = now.toISOString().replace(/[:.]/g, '-');
const runDir = path.join(repoRoot, 'tmp', 'e2e', day, `run-${safeStamp}`);
const reportDir = path.join(runDir, 'playwright-report');
const outputDir = path.join(runDir, 'test-results');
const logPath = path.join(runDir, 'command.log');
const summaryPath = path.join(runDir, 'summary.json');

fs.mkdirSync(runDir, { recursive: true });
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

const extraArgs = process.argv.slice(2);
const normalizedArgs = extraArgs[0] === '--' ? extraArgs.slice(1) : extraArgs;
const command = ['playwright', 'test', ...normalizedArgs];

const result = spawnSync('pnpm', command, {
  cwd: appRoot,
  env: {
    ...process.env,
    PLAYWRIGHT_HTML_REPORT: reportDir,
    PLAYWRIGHT_OUTPUT_DIR: outputDir,
    PLAYWRIGHT_HTML_REPORT_OPEN: 'never',
  },
  encoding: 'utf8',
});

const combinedOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`;
fs.writeFileSync(logPath, combinedOutput, 'utf8');

const summary = {
  createdAt: now.toISOString(),
  command: `pnpm ${command.join(' ')}`,
  cwd: appRoot,
  exitCode: result.status ?? 1,
  reportDir,
  outputDir,
  logPath,
};
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error) {
  console.error(`[e2e:evidence] Failed to launch command: ${result.error.message}`);
  process.exit(1);
}

console.log(`[e2e:evidence] Evidence bundle: ${runDir}`);
process.exit(result.status ?? 1);
