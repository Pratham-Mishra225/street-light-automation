const http = require('http');
const fs = require('fs');
const path = require('path');

// Optional .env loader so the bridge works without adding another dependency.
function loadDotEnv(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch (_) {
    // .env is optional.
  }
}

loadDotEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 5178);
const STATE_FILE = process.env.EMU8086_STATE_FILE || 'C:\\emu8086\\MyBuild\\STATE.TXT';

let lastGoodState = null;
let lastRawState = '';
let lastReadAt = null;

function parseState(raw) {
  const map = {};
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  const lights = (map.LIGHTS || '00000')
    .split('')
    .map((value) => Number.parseInt(value, 10))
    .map((value) => (Number.isFinite(value) && value >= 0 && value <= 2 ? value : 0))
    .slice(0, 5);
  while (lights.length < 5) lights.push(0);

  const power = Number.parseInt(map.POWER || '0', 10) || 0;
  const conventional = 300;

  return {
    source: '8086emu',
    ambient: Number(map.AMBIENT || 0),
    vehicle: Number(map.VEHICLE || 0),
    position: Number(map.POSITION || 0),
    lights,
    power,
    conventional,
    energySavedPercent: conventional === 0 ? 0 : Math.round(((conventional - power) / conventional) * 100),
    mode: map.MODE || 'OFF',
    sequence: Number(map.SEQ || 0),
    timestamp: new Date().toISOString(),
    rawState: raw.trimEnd(),
  };
}

function readState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    lastRawState = raw.trimEnd();
    lastReadAt = new Date().toISOString();
    lastGoodState = parseState(raw);
    return lastGoodState;
  } catch (err) {
    return lastGoodState || {
      source: 'waiting-for-8086',
      ambient: 0,
      vehicle: 0,
      position: 0,
      lights: [0, 0, 0, 0, 0],
      power: 0,
      conventional: 300,
      energySavedPercent: 0,
      mode: 'WAITING',
      sequence: 0,
      timestamp: new Date().toISOString(),
      rawState: lastRawState,
      error: `State file not found: ${STATE_FILE}`,
    };
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/state') {
    return sendJson(res, 200, readState());
  }

  if (url.pathname === '/api/config') {
    return sendJson(res, 200, {
      port: PORT,
      stateFile: STATE_FILE,
      lastReadAt,
      hasState: Boolean(lastGoodState),
    });
  }

  return sendJson(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`8086 bridge listening on http://localhost:${PORT}`);
  console.log(`Watching: ${STATE_FILE}`);
});
