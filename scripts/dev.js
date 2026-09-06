#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import 'dotenv/config';

/**
 * Starts every service and the web app in one terminal.
 *
 * Written by hand rather than using a process runner so there is no extra
 * dependency, and so output stays readable: each line is prefixed and coloured
 * by service, which matters when eight processes share one stream.
 *
 *   node scripts/dev.js               everything
 *   node scripts/dev.js --only=services
 *   node scripts/dev.js --only=web
 *   node scripts/dev.js --prod        production build of the web app
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1] ?? 'all';
const isProd = args.includes('--prod');

const PALETTE = [39, 42, 178, 168, 141, 79, 209, 111, 245];

const SERVICES = [
  { name: 'gateway', dir: 'services/gateway', port: process.env.GATEWAY_PORT ?? 4000 },
  { name: 'profiles', dir: 'services/profiles', port: process.env.PROFILES_PORT ?? 4001 },
  { name: 'targets', dir: 'services/targets', port: process.env.TARGETS_PORT ?? 4002 },
  { name: 'prompts', dir: 'services/prompts', port: process.env.PROMPTS_PORT ?? 4003 },
  { name: 'research', dir: 'services/research', port: process.env.RESEARCH_PORT ?? 4004 },
  { name: 'analysis', dir: 'services/analysis', port: process.env.ANALYSIS_PORT ?? 4005 },
  { name: 'outreach', dir: 'services/outreach', port: process.env.OUTREACH_PORT ?? 4006 },
  { name: 'orchestrator', dir: 'services/orchestrator', port: process.env.ORCHESTRATOR_PORT ?? 4007 },
];

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, text) => (useColour ? `[38;5;${code}m${text}[0m` : text);

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

/**
 * @param {string} name
 * @param {string} command
 * @param {string[]} commandArgs
 * @param {string} cwd
 * @param {number} colour
 */
function start(name, command, commandArgs, cwd, colour) {
  // `npm` is a shell script on Windows and needs the shell to resolve. Node
  // itself must NOT go through the shell: its path contains a space
  // ("C:\Program Files\nodejs"), which the shell would split on.
  const needsShell = process.platform === 'win32' && !path.isAbsolute(command);

  const child = spawn(command, commandArgs, {
    cwd: path.join(root, cwd),
    env: { ...process.env, FORCE_COLOR: useColour ? '1' : '0' },
    shell: needsShell,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const label = paint(colour, name.padEnd(13));

  const relay = (stream, isError) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        (isError ? process.stderr : process.stdout).write(`${label} ${line}\n`);
      }
    });
  };

  relay(child.stdout, false);
  relay(child.stderr, true);

  child.on('exit', (code) => {
    if (shuttingDown) return;
    if (code !== 0 && code !== null) {
      process.stderr.write(`${label} ${paint(167, `exited with code ${code}`)}\n`);
    }
  });

  children.push(child);
  return child;
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`\n${paint(245, `${signal} received, stopping ${children.length} processes`)}\n`);

  for (const child of children) {
    if (child.killed) continue;
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => process.exit(0), 800);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

const banner = [
  '',
  paint(37, '  Flow'),
  paint(245, '  Study-abroad outreach, automated end to end.'),
  '',
];

if (only !== 'web') {
  banner.push(paint(245, '  Services'));
  SERVICES.forEach((s) => banner.push(`    ${paint(37, s.name.padEnd(14))} ${paint(245, `http://localhost:${s.port}`)}`));
  banner.push('');
}

if (only !== 'services') {
  banner.push(paint(245, '  Web app'));
  banner.push(`    ${paint(37, 'open'.padEnd(14))} ${paint(37, 'http://localhost:3000')}`);
  banner.push('');
}

process.stdout.write(`${banner.join('\n')}\n`);

if (only !== 'web') {
  SERVICES.forEach((service, index) => {
    const nodeArgs = isProd ? ['src/index.js'] : ['--watch', '--watch-preserve-output', 'src/index.js'];
    start(service.name, process.execPath, nodeArgs, service.dir, PALETTE[index % PALETTE.length]);
  });
}

if (only !== 'services') {
  // The web app waits a moment so the gateway is answering before the first
  // page render, which avoids a burst of "service unreachable" banners.
  setTimeout(
    () => {
      start('web', 'npm', ['run', isProd ? 'start' : 'dev'], 'apps/web', 214);
    },
    only === 'web' ? 0 : 1200,
  );
}
