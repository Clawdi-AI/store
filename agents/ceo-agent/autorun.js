#!/usr/bin/env node
/**
 * First-run setup:
 * 1. Writes formData config to .secrets/transcribe-config.json
 * 2. Installs yt-dlp if not available (needed for TikTok, Instagram, X video download)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function setupFormData() {
  const formData = process.env.AGENT_FORM_DATA;
  if (!formData) {
    console.log('No formData provided — skipping config setup.');
    return;
  }

  let data;
  try {
    data = JSON.parse(formData);
  } catch (e) {
    console.error('Warning: Could not parse AGENT_FORM_DATA as JSON.');
    return;
  }

  const secretsDir = path.join(__dirname, '.secrets');
  fs.mkdirSync(secretsDir, { recursive: true });

  const configPath = path.join(secretsDir, 'transcribe-config.json');
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
  console.log(`Transcription config saved to ${configPath}`);
}

function ensureDeps() {
  // Install yt-dlp if missing (needed for TikTok, Instagram, X, etc.)
  try {
    execSync('which yt-dlp', { stdio: 'ignore' });
  } catch {
    console.log('Installing yt-dlp...');
    try {
      execSync('apt-get update -qq && apt-get install -y -qq yt-dlp 2>/dev/null || pip3 install -q yt-dlp 2>/dev/null || true', {
        stdio: 'inherit',
        timeout: 120000,
      });
      console.log('yt-dlp installed.');
    } catch (e) {
      console.log('Warning: Could not install yt-dlp. Online video download may not work.');
    }
  }
}

function setupGbrain() {
  try {
    execSync('which gbrain', { stdio: 'ignore' });
    console.log('gbrain: already installed');
  } catch {
    console.log('Installing gbrain...');
    try {
      execSync('npm install -g gbrain 2>/dev/null || bun install -g gbrain 2>/dev/null || true', {
        stdio: 'inherit',
        timeout: 120000,
      });
    } catch (e) {
      console.log('Warning: Could not install gbrain. Knowledge brain will not be available.');
      return;
    }
  }

  // Initialize brain if not exists
  const brainDir = path.join(process.env.HOME || '/root', 'brain');
  if (!fs.existsSync(brainDir)) {
    console.log('Initializing gbrain...');
    try {
      fs.mkdirSync(brainDir, { recursive: true });
      execSync('cd ' + brainDir + ' && gbrain init 2>/dev/null || true', { stdio: 'inherit', timeout: 30000 });
    } catch (e) {
      console.log('Warning: gbrain init failed.');
    }
  }

  // Configure mcporter MCP if available
  try {
    execSync('which mcporter', { stdio: 'ignore' });
    execSync('mcporter config add gbrain --transport stdio --command "gbrain serve" 2>/dev/null || true', { stdio: 'ignore' });
    console.log('gbrain: MCP server configured via mcporter');
  } catch {
    // mcporter not available, skip
  }

  console.log('gbrain: ready');
}

function setupGstack() {
  // gstack initializes itself on first use via its SKILL.md
  // Just verify it's available
  const gstackSkill = path.join(__dirname, 'skills', 'gstack', 'SKILL.md');
  if (fs.existsSync(gstackSkill)) {
    console.log('gstack: skill available');
  }
}

setupFormData();
ensureDeps();
setupGbrain();
setupGstack();
