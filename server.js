// Filebrew — local media converter by Code Crunch Labs
// MIT License — see LICENSE

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'));
const LOG_FILE = path.join(DATA_DIR, 'conversions.log');

const MEDIA_EXTS = [
  '.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v', '.flv', '.wmv', '.3gp', '.ts',
  '.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.opus', '.wma',
];
const IMAGE_EXTS = [
  '.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif',
];
const ALL_EXTS = [...MEDIA_EXTS, ...IMAGE_EXTS];
const STABLE_MS = 3000;

// Output targets. `args(probe)` returns ffmpeg arg list for the target.
const TARGETS = {
  // ─── VIDEO ─────────────────────────────────────────────────────────
  mp4: {
    label: 'MP4', kind: 'video', ext: '.mp4', color: '#2a4fd0',
    inputDir: 'videos-to-convert',
    outputDir: 'converted/mp4',
    args: ({ codec }) => codec === 'h264'
      ? ['-c', 'copy', '-movflags', '+faststart']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
         '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
  },
  webm: {
    label: 'WebM', kind: 'video', ext: '.webm', color: '#0f9d58',
    outputDir: 'converted/webm',
    available: (enc) => enc.has('libvpx-vp9') && enc.has('libopus'),
    args: () => ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32',
                 '-c:a', 'libopus', '-b:a', '128k'],
  },
  mov: {
    label: 'MOV', kind: 'video', ext: '.mov', color: '#666',
    outputDir: 'converted/mov',
    args: ({ codec }) => codec === 'h264'
      ? ['-c', 'copy']
      : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
         '-c:a', 'aac', '-b:a', '160k'],
  },
  mkv: {
    label: 'MKV', kind: 'video', ext: '.mkv', color: '#444',
    outputDir: 'converted/mkv',
    args: () => ['-c', 'copy'],
  },
  gif: {
    label: 'GIF', kind: 'video', ext: '.gif', color: '#e91e63',
    outputDir: 'converted/gif',
    args: () => ['-filter_complex',
                 '[0:v]fps=12,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
                 '-loop', '0', '-an'],
  },

  // ─── AUDIO ─────────────────────────────────────────────────────────
  mp3: {
    label: 'MP3', kind: 'audio', ext: '.mp3', color: '#d04f8a',
    inputDir: 'audio-to-extract',
    outputDir: 'converted/mp3',
    args: () => ['-vn', '-c:a', 'libmp3lame', '-b:a', '192k'],
  },
  m4a: {
    label: 'M4A', kind: 'audio', ext: '.m4a', color: '#7e57c2',
    outputDir: 'converted/m4a',
    args: () => ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  },
  wav: {
    label: 'WAV', kind: 'audio', ext: '.wav', color: '#00897b',
    outputDir: 'converted/wav',
    args: () => ['-vn', '-c:a', 'pcm_s16le'],
  },
  flac: {
    label: 'FLAC', kind: 'audio', ext: '.flac', color: '#1976d2',
    outputDir: 'converted/flac',
    args: () => ['-vn', '-c:a', 'flac'],
  },

  // ─── IMAGE ─────────────────────────────────────────────────────────
  jpg: {
    label: 'JPG', kind: 'image', ext: '.jpg', color: '#f57c00',
    inputDir: 'images-to-convert',
    outputDir: 'converted/jpg',
    args: () => ['-q:v', '2'],
  },
  png: {
    label: 'PNG', kind: 'image', ext: '.png', color: '#2e7d32',
    outputDir: 'converted/png',
    args: () => [],
  },
  webp: {
    label: 'WebP', kind: 'image', ext: '.webp', color: '#0288d1',
    outputDir: 'converted/webp',
    available: (enc) => enc.has('libwebp'),
    args: () => ['-c:v', 'libwebp', '-quality', '80', '-compression_level', '6'],
  },
  avif: {
    label: 'AVIF', kind: 'image', ext: '.avif', color: '#6a1b9a',
    outputDir: 'converted/avif',
    available: (enc) => enc.has('libaom-av1') || enc.has('libsvtav1'),
    args: (_, enc) => enc.has('libaom-av1')
      ? ['-c:v', 'libaom-av1', '-still-picture', '1', '-cpu-used', '4', '-crf', '30']
      : ['-c:v', 'libsvtav1', '-frames:v', '1', '-crf', '30', '-preset', '6'],
  },
  bmp: {
    label: 'BMP', kind: 'image', ext: '.bmp', color: '#5d4037',
    outputDir: 'converted/bmp',
    args: () => [],
  },
  tiff: {
    label: 'TIFF', kind: 'image', ext: '.tiff', color: '#37474f',
    outputDir: 'converted/tiff',
    args: () => [],
  },
};

// runtime encoder availability — populated synchronously at startup
let availableEncoders = new Set();

function detectEncodersSync() {
  try {
    const { spawnSync } = require('child_process');
    const r = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const encs = new Set();
    for (const line of out.split('\n')) {
      const m = line.match(/^\s*[VAS.][.A-Z]{5}\s+(\S+)/);
      if (m) encs.add(m[1]);
    }
    return encs;
  } catch { return new Set(); }
}

availableEncoders = detectEncodersSync();

// drop targets whose encoders aren't installed
for (const [name, t] of Object.entries(TARGETS)) {
  if (t.available && !t.available(availableEncoders)) {
    console.warn(`[startup] dropping target "${name}" — required encoder not available in your ffmpeg build`);
    delete TARGETS[name];
  }
}

// resolve dirs under DATA_DIR
for (const t of Object.values(TARGETS)) {
  if (t.inputDir) {
    t.inputDir = path.join(DATA_DIR, t.inputDir);
    fs.mkdirSync(t.inputDir, { recursive: true });
  }
  t.outputDir = path.join(DATA_DIR, t.outputDir);
  fs.mkdirSync(t.outputDir, { recursive: true });
}

if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE,
    '# Filebrew — conversion log\n' +
    '# when | source | output | mode | source-size | output-size | took\n');
}

// --- job/queue state ---
const jobs = new Map();
const queue = [];
const inProgress = new Set();
const sizeHistory = new Map();
let pumping = false;

const k = (targetName, p) => `${targetName}:${p}`;
const fmtSize = (b) => {
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0, n = b;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${u[i]}`;
};
const fmtElapsed = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};
const nowTs = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function probe(inputPath) {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name:format=duration',
      '-of', 'default=nw=1', inputPath,
    ]);
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', () => {
      const codec = (out.match(/codec_name=(\S+)/) || [])[1] || '';
      const duration = parseFloat((out.match(/duration=([\d.]+)/) || [])[1] || '0');
      resolve({ codec, duration: Number.isFinite(duration) ? duration : 0 });
    });
    p.on('error', () => resolve({ codec: '', duration: 0 }));
  });
}

function outputNameFor(target, inputName) {
  return `${inputName.replace(/\.[^.]+$/, '')}${target.ext}`;
}

function alreadyConverted(target, inputName) {
  return fs.existsSync(path.join(target.outputDir, outputNameFor(target, inputName)));
}

// returns ffmpeg arg array prepending an optional resize filter (image only)
// options.resize    → single number = max edge in px (aspect preserved)
// options.width + options.height → fit inside W×H box (aspect preserved)
function buildArgs(target, probeResult, options) {
  const args = [];
  if (target.kind === 'image') {
    if (options.width && options.height) {
      const w = parseInt(options.width, 10);
      const h = parseInt(options.height, 10);
      if (Number.isFinite(w) && w >= 16 && w <= 8192 &&
          Number.isFinite(h) && h >= 16 && h <= 8192) {
        args.push('-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease`);
      }
    } else if (options.resize) {
      const n = parseInt(options.resize, 10);
      if (Number.isFinite(n) && n >= 16 && n <= 8192) {
        args.push('-vf',
          `scale='if(gt(iw,ih),${n},-2)':'if(gt(iw,ih),-2,${n})'`);
      }
    }
  }
  args.push(...target.args(probeResult, availableEncoders));
  return args;
}

function enqueue(targetName, inputPath, options = {}) {
  const key = k(targetName, inputPath);
  if (inProgress.has(key)) return;
  inProgress.add(key);
  queue.push({ targetName, inputPath, options });
  pump();
}

async function pump() {
  if (pumping) return;
  pumping = true;
  while (queue.length > 0) {
    const { targetName, inputPath, options } = queue.shift();
    try { await convertOne(targetName, inputPath, options); }
    catch (e) { console.error('conversion error:', e.message); }
    finally { inProgress.delete(k(targetName, inputPath)); }
  }
  pumping = false;
}

async function convertOne(targetName, inputPath, options = {}) {
  const target = TARGETS[targetName];
  const inputName = path.basename(inputPath);
  if (!fs.existsSync(inputPath)) return;
  const hasSizing = options.resize || (options.width && options.height);
  if (alreadyConverted(target, inputName) && !hasSizing) {
    console.log(`[skip]    ${targetName}/${inputName}: output already exists`);
    return;
  }

  const probeResult = await probe(inputPath);
  const outputName = outputNameFor(target, inputName);
  let outputPath = path.join(target.outputDir, outputName);

  // if resize requested but output name collides, suffix with the size
  if (hasSizing && fs.existsSync(outputPath)) {
    const base = inputName.replace(/\.[^.]+$/, '');
    const suffix = (options.width && options.height)
      ? `${options.width}x${options.height}`
      : `${options.resize}px`;
    outputPath = path.join(target.outputDir, `${base}-${suffix}${target.ext}`);
  }

  const ffmpegArgs = ['-y', '-i', inputPath,
                      ...buildArgs(target, probeResult, options),
                      '-progress', 'pipe:1', '-nostats', outputPath];

  const mode = (() => {
    const argStr = ffmpegArgs.join(' ');
    if (argStr.includes('-c copy')) return `remux→${targetName}`;
    if (target.kind === 'audio') return `extract→${targetName}`;
    if (target.kind === 'image') {
      if (options.width && options.height) return `convert→${targetName} @${options.width}×${options.height}`;
      if (options.resize) return `convert→${targetName} @${options.resize}px`;
      return `convert→${targetName}`;
    }
    return `transcode→${targetName}`;
  })();

  const id = crypto.randomBytes(6).toString('hex');
  const startedAt = Date.now();
  const child = spawn('ffmpeg', ffmpegArgs);

  const job = {
    id, targetName, input: inputName, output: path.basename(outputPath), mode,
    kind: target.kind, status: 'running', progress: 0,
    startedAt, endedAt: null, error: null, child,
  };
  jobs.set(id, job);
  console.log(`[convert] ${inputName} → ${path.basename(outputPath)} (${mode})`);

  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const [key, val] = line.split('=');
      if (key === 'out_time_us' && probeResult.duration > 0) {
        const cur = parseInt(val, 10);
        if (Number.isFinite(cur)) {
          job.progress = Math.min(100, Math.round((cur / (probeResult.duration * 1e6)) * 100));
        }
      }
    }
  });

  let stderrTail = '';
  child.stderr.on('data', (d) => { stderrTail = (stderrTail + d.toString()).slice(-3000); });

  await new Promise((resolve) => {
    child.on('close', async (code) => {
      job.endedAt = Date.now();
      job.child = null;
      if (code === 0) {
        job.status = 'done'; job.progress = 100;
        try {
          const inStat = await fsp.stat(inputPath);
          const outStat = await fsp.stat(outputPath);
          await fsp.appendFile(LOG_FILE,
            `${nowTs()} | ${inputName} | ${path.basename(outputPath)} | ${mode} | ${fmtSize(inStat.size)} | ${fmtSize(outStat.size)} | ${fmtElapsed(job.endedAt - startedAt)}\n`);
          console.log(`[done]    ${path.basename(outputPath)} in ${fmtElapsed(job.endedAt - startedAt)}`);
        } catch (e) { console.error('log error:', e.message); }
      } else {
        job.status = 'failed';
        job.error = stderrTail.trim().split('\n').slice(-3).join('\n');
        fs.unlink(outputPath, () => {});
        console.error(`[fail]    ${inputName}: ${job.error}`);
      }
      resolve();
    });
    child.on('error', (err) => {
      job.status = 'failed'; job.error = err.message;
      job.endedAt = Date.now(); job.child = null;
      resolve();
    });
  });
}

async function scanOne(targetName) {
  const target = TARGETS[targetName];
  if (!target.inputDir) return new Set();
  let names;
  try { names = await fsp.readdir(target.inputDir); } catch { return new Set(); }
  const seen = new Set();
  for (const name of names) {
    if (!ALL_EXTS.includes(path.extname(name).toLowerCase())) continue;
    const full = path.join(target.inputDir, name);
    const key = k(targetName, full);
    seen.add(key);
    if (inProgress.has(key)) continue;
    let stat; try { stat = await fsp.stat(full); } catch { continue; }
    if (!stat.isFile() || stat.size === 0) continue;
    const prev = sizeHistory.get(key);
    const now = Date.now();
    if (!prev || prev.size !== stat.size) { sizeHistory.set(key, { size: stat.size, since: now }); continue; }
    if (now - prev.since < STABLE_MS) continue;
    sizeHistory.delete(key);
    if (alreadyConverted(target, name)) continue;
    enqueue(targetName, full);
  }
  return seen;
}

async function scanAll() {
  const allSeen = new Set();
  for (const name of Object.keys(TARGETS)) {
    const s = await scanOne(name);
    for (const k of s) allSeen.add(k);
  }
  for (const key of sizeHistory.keys()) if (!allSeen.has(key)) sizeHistory.delete(key);
}

setInterval(scanAll, 1000);
scanAll();

// --- HTTP server ---

const MIME = {
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.m4v': 'video/mp4',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.aac': 'audio/aac', '.flac': 'audio/flac', '.ogg': 'audio/ogg',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif',
  '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff',
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
};

function matchKinds(kindsParam, kind) {
  if (!kindsParam) return true;
  return kindsParam.split(',').map((s) => s.trim()).includes(kind);
}

function listTargets(kindsParam) {
  return Object.entries(TARGETS)
    .filter(([, t]) => matchKinds(kindsParam, t.kind))
    .map(([name, t]) => ({
      name, label: t.label, kind: t.kind, color: t.color, ext: t.ext,
      hasDropFolder: !!t.inputDir,
    }));
}

function listLibrary(kindsParam) {
  const items = [];
  for (const [targetName, target] of Object.entries(TARGETS)) {
    if (!matchKinds(kindsParam, target.kind)) continue;
    let names;
    try { names = fs.readdirSync(target.outputDir); } catch { continue; }
    for (const name of names) {
      const ext = path.extname(name).toLowerCase();
      if (!ALL_EXTS.includes(ext)) continue;
      const stat = fs.statSync(path.join(target.outputDir, name));
      items.push({
        name, size: stat.size, mtime: stat.mtimeMs,
        kind: target.kind, target: targetName,
        color: target.color, label: target.label,
        url: `/file/${targetName}/${encodeURIComponent(name)}`,
      });
    }
  }
  return items.sort((a, b) => b.mtime - a.mtime);
}

function listPending(kindsParam) {
  const out = [];
  for (const [targetName, target] of Object.entries(TARGETS)) {
    if (!target.inputDir) continue;
    if (!matchKinds(kindsParam, target.kind)) continue;
    let names;
    try { names = fs.readdirSync(target.inputDir); } catch { continue; }
    for (const name of names) {
      if (!ALL_EXTS.includes(path.extname(name).toLowerCase())) continue;
      const full = path.join(target.inputDir, name);
      let stat; try { stat = fs.statSync(full); } catch { continue; }
      const key = k(targetName, full);
      const queued = inProgress.has(key);
      const activeJob = [...jobs.values()].find((j) => j.status === 'running' && j.targetName === targetName && j.input === name);
      const stable = sizeHistory.get(key);
      let state = 'waiting';
      if (activeJob) state = 'running';
      else if (queued) state = 'queued';
      else if (alreadyConverted(target, name)) state = 'converted';
      else if (stable) state = 'settling';
      out.push({ name, size: stat.size, state, target: targetName, label: target.label, color: target.color });
    }
  }
  return out;
}

function streamFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;
  const contentType = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : Math.min(start + 1024 * 1024 - 1, fileSize - 1);
    if (start >= fileSize || end >= fileSize) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` }); res.end(); return;
    }
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize, 'Content-Type': contentType, 'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

const publicJob = (j) => { const { child, ...rest } = j; return rest; };

function handleUpload(req, res, parsed) {
  const targetName = parsed.query.target;
  const target = TARGETS[targetName];
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid target' })); return;
  }
  const rawName = path.basename(decodeURIComponent(parsed.query.filename || ''));
  if (!rawName || !ALL_EXTS.includes(path.extname(rawName).toLowerCase())) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'missing or unsupported filename' })); return;
  }
  const resize = parsed.query.resize && parsed.query.resize !== 'original' ? parsed.query.resize : null;
  const width  = parsed.query.width  ? String(parsed.query.width)  : null;
  const height = parsed.query.height ? String(parsed.query.height) : null;
  const sizingOpts = (width && height) ? { width, height } : (resize ? { resize } : {});

  const stagingDir = path.join(DATA_DIR, 'uploads', targetName);
  fs.mkdirSync(stagingDir, { recursive: true });
  let finalName = rawName, n = 2;
  while (fs.existsSync(path.join(stagingDir, finalName))) {
    const base = rawName.replace(/\.[^.]+$/, '');
    const ext = path.extname(rawName);
    finalName = `${base} (${n})${ext}`;
    n++;
  }
  const finalPath = path.join(stagingDir, finalName);
  const tmpPath = finalPath + '.uploading';
  const ws = fs.createWriteStream(tmpPath);
  let cleanedUp = false;
  const cleanup = () => { if (cleanedUp) return; cleanedUp = true; fs.unlink(tmpPath, () => {}); };
  req.pipe(ws);
  ws.on('finish', () => {
    fs.rename(tmpPath, finalPath, (err) => {
      if (err) {
        cleanup();
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message })); return;
      }
      enqueue(targetName, finalPath, sizingOpts);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, filename: finalName, target: targetName, ...sizingOpts }));
    });
  });
  ws.on('error', (err) => {
    cleanup();
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
  req.on('aborted', cleanup);
  req.on('error', cleanup);
}

function servePage(res, name) {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  fs.createReadStream(path.join(__dirname, name)).pipe(res);
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  // page routes
  if (parsed.pathname === '/' || parsed.pathname === '/index.html') { servePage(res, 'landing.html'); return; }
  if (parsed.pathname === '/video' || parsed.pathname === '/video.html') { servePage(res, 'video.html'); return; }
  if (parsed.pathname === '/image' || parsed.pathname === '/image.html') { servePage(res, 'image.html'); return; }

  // favicons
  if (parsed.pathname === '/favicon.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(path.join(__dirname, 'favicon.svg')).pipe(res); return;
  }
  if (parsed.pathname === '/favicon.ico') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(path.join(__dirname, 'favicon.svg')).pipe(res); return;
  }
  if (parsed.pathname === '/apple-touch-icon.png') {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
    fs.createReadStream(path.join(__dirname, 'apple-touch-icon.png')).pipe(res); return;
  }

  // api
  if (parsed.pathname === '/api/targets') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(listTargets(parsed.query.kinds))); return;
  }
  if (parsed.pathname === '/api/library') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(listLibrary(parsed.query.kinds))); return;
  }
  if (parsed.pathname === '/api/pending') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(listPending(parsed.query.kinds))); return;
  }
  if (parsed.pathname === '/api/jobs') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([...jobs.values()].map(publicJob))); return;
  }
  if (parsed.pathname === '/api/upload' && req.method === 'POST') {
    handleUpload(req, res, parsed); return;
  }

  // file streaming
  const fileMatch = parsed.pathname.match(/^\/file\/([^/]+)\/(.+)$/);
  if (fileMatch) {
    const targetName = fileMatch[1];
    const target = TARGETS[targetName];
    if (!target) { res.writeHead(404); res.end('Not found'); return; }
    const filename = path.basename(decodeURIComponent(fileMatch[2]));
    const filePath = path.join(target.outputDir, filename);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    streamFile(req, res, filePath); return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Filebrew — local media converter by Code Crunch Labs`);
  console.log(`http://localhost:${PORT}`);
  console.log(`data dir: ${DATA_DIR}`);
});
