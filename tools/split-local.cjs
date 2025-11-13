#!/usr/bin/env node
// CommonJS version of split-local.js for reliable packaging with pkg (ESM import.meta issues workaround)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const prompts = require('prompts');
let ora; // ESM-only; may fail under pkg -> fallback
try { ora = require('ora'); } catch {}
let prettyBytesLib;
try { prettyBytesLib = require('pretty-bytes'); } catch {}

function prettyBytes(num) {
  if (prettyBytesLib) return prettyBytesLib(num);
  if (num < 1024) return num + ' B';
  const units = ['KB','MB','GB','TB'];
  let i = -1; do { num = num / 1024; ++i; } while (num >= 1024 && i < units.length-1);
  return num.toFixed(1) + ' ' + units[i];
}

class FallbackSpinner {
  constructor(text){ this._text=text; console.log(text); }
  start(){ return this; }
  succeed(msg){ console.log(msg); }
  fail(msg){ console.error(msg); }
  set text(t){ this._text=t; console.log(t); }
}
function createSpinner(text){ return ora ? ora(text).start() : new FallbackSpinner(text); }
const ffmpegStatic = require('ffmpeg-static');
let ffprobeStatic;
try { ffprobeStatic = require('ffprobe-static'); } catch {}
const ffmpeg = require('fluent-ffmpeg');

const DEFAULT_TARGET_MB = 1536;
const TARGET_BYTES = (mb) => mb * 1024 * 1024;
const MIN_SEGMENT_SEC = 10;
const SAFETY_MEM_THRESHOLD = 0.10; // 10%
const SAFETY_LOAD_MULT = 1.5;

function which(cmd) {
  try {
    const isWin = process.platform === 'win32';
    const res = spawnSync(isWin ? 'where' : 'which', [cmd], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout) {
      const first = res.stdout.split(/\r?\n/).find(Boolean);
      return first ? first.trim() : null;
    }
  } catch {}
  return null;
}

function resolveFfmpeg() {
  try { if (ffmpegStatic && fs.existsSync(ffmpegStatic)) return ffmpegStatic; } catch {}
  const sys = which('ffmpeg');
  if (sys) return sys;
  return ffmpegStatic;
}
function resolveFfprobe(ffmpegPath) {
  try { if (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) return ffprobeStatic.path; } catch {}
  try {
    if (ffmpegPath) {
      const guess = ffmpegPath.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
      if (fs.existsSync(guess)) return guess;
    }
  } catch {}
  const sys = which('ffprobe');
  if (sys) return sys;
  return null;
}

const resolvedFfmpeg = resolveFfmpeg();
const resolvedFfprobe = resolveFfprobe(resolvedFfmpeg);
ffmpeg.setFfmpegPath(resolvedFfmpeg);
if (resolvedFfprobe) {
  try { ffmpeg.setFfprobePath(resolvedFfprobe); } catch {}
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; ++i) {
    if (args[i] === '--input') opts.input = args[++i];
    else if (args[i] === '--targetMB') opts.targetMB = parseInt(args[++i], 10);
    else if (args[i] === '--deleteOriginal') opts.deleteOriginal = true;
    else if (args[i] === '--noPrompt') opts.noPrompt = true;
    else if (args[i] === '--doctor') opts.doctor = true;
  }
  return opts;
}

function getBitrate(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) return reject(err);
      let bitrate = 0;
      if (data.format && data.format.bit_rate) {
        bitrate = parseInt(data.format.bit_rate, 10);
      } else if (data.streams) {
        bitrate = data.streams.reduce((sum, s) => sum + (parseInt(s.bit_rate, 10) || 0), 0);
      }
      if (!bitrate && data.format && data.format.size && data.format.duration) {
        bitrate = Math.floor((8 * data.format.size) / data.format.duration);
      }
      resolve(bitrate);
    });
  });
}

function getOutputDir(inputPath) {
  const dir = path.dirname(inputPath);
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}_segments`);
}
function pad(num, len = 3) { return String(num).padStart(len, '0'); }

function checkSafetyGuard() {
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const memRatio = freeMem / totalMem;
  if (memRatio < SAFETY_MEM_THRESHOLD) return 'Low memory';
  if (os.platform() !== 'win32') {
    const load = os.loadavg()[0];
    const cores = os.cpus().length;
    if (load > SAFETY_LOAD_MULT * cores) return 'High system load';
  }
  return null;
}

function runFfmpeg(args, onProgress, onError, onClose) {
  const proc = spawn(resolvedFfmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', (chunk) => {
    const lines = chunk.toString().split(/\r?\n/);
    for (const line of lines) {
      const m = /time=([0-9:.]+)/.exec(line);
      if (m) onProgress && onProgress(m[1]);
    }
  });
  proc.on('error', onError);
  proc.on('close', onClose);
  return proc;
}

function splitSegment({inputPath, outPath, offset, segDur, fastPath, onProgress, safetyGuard}) {
  return new Promise((resolve, reject) => {
    let killed = false;
    const timer = setInterval(() => {
      const reason = safetyGuard();
      if (reason) {
        killed = true;
        try { proc.kill('SIGKILL'); } catch {}
        clearInterval(timer);
        reject(new Error(`Safety guard tripped: ${reason}`));
      }
    }, 2000);
    const args = [
      '-hide_banner', '-y',
      '-ss', String(offset), '-i', inputPath,
      '-t', String(segDur),
      '-map', '0',
      ...(fastPath ? ['-c', 'copy', '-avoid_negative_ts', '1'] : [
        '-map', '0:v:0?', '-map', '0:a:0?', '-map', '0:s:0?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        '-g', String(Math.round(2 * segDur)), '-sc_threshold', '0',
        '-force_key_frames', `expr:gte(t,n_forced*${segDur})`,
        '-c:a', 'aac', '-b:a', '160k',
        '-c:s', 'copy',
        '-movflags', '+faststart'
      ]),
      outPath
    ];
    const proc = runFfmpeg(args, onProgress, (err) => {
      clearInterval(timer);
      reject(err);
    }, (code) => {
      clearInterval(timer);
      if (killed) return;
      if (code === 0) resolve(true);
      else if (fastPath) resolve(false);
      else reject(new Error('ffmpeg failed'));
    });
  });
}

async function main() {
  const args = parseArgs();
  let { input: inputPath } = args;
  let targetMB = args.targetMB || DEFAULT_TARGET_MB;
  let deleteOriginal = !!args.deleteOriginal;
  let noPrompt = !!args.noPrompt;

  if (args.doctor) {
    console.log('Environment diagnostics (packaged CJS):');
    console.log('  Platform:', process.platform, process.arch);
    console.log('  Node:', process.version);
    console.log('  ffmpeg path:', resolvedFfmpeg);
    try {
      const v = spawnSync(resolvedFfmpeg, ['-version'], { encoding: 'utf8' });
      console.log('  ffmpeg -version status:', v.status);
      console.log(String(v.stdout || v.stderr).split(/\r?\n/)[0] || '(no output)');
    } catch (e) { console.log('  ffmpeg check error:', e.message); }
    console.log('  ffprobe path:', resolvedFfprobe || '(not found)');
    if (resolvedFfprobe) {
      try {
        const v2 = spawnSync(resolvedFfprobe, ['-version'], { encoding: 'utf8' });
        console.log('  ffprobe -version status:', v2.status);
        console.log(String(v2.stdout || v2.stderr).split(/\r?\n/)[0] || '(no output)');
      } catch (e) { console.log('  ffprobe check error:', e.message); }
    }
    return;
  }

  if (!inputPath || !fs.existsSync(inputPath)) {
    if (noPrompt) throw new Error('Input file required');
    const resp = await prompts({
      type: 'text', name: 'file', message: 'Path to video file:',
      validate: f => fs.existsSync(f) ? true : 'File not found'
    });
    inputPath = resp.file;
  }
  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error('File not found. Exiting.');
    process.exit(1);
  }

  if (!noPrompt) {
    const { confirm } = await prompts({
      type: 'confirm', name: 'confirm',
      message: `Split into ~${targetMB} MB clips?`, initial: true
    });
    if (!confirm) { console.log('Aborted.'); process.exit(0); }
  }

  let bitrate;
  try { bitrate = await getBitrate(inputPath); } catch (e) {
    console.error('Failed to get bitrate:', e); process.exit(1);
  }
  if (!bitrate) { console.error('Could not determine bitrate. Ensure ffprobe is available.'); process.exit(1); }

  const probe = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => err ? reject(err) : resolve(data));
  });
  const duration = probe.format.duration;
  const targetBytes = TARGET_BYTES(targetMB);
  let segmentTimeSec = Math.max(MIN_SEGMENT_SEC, Math.floor((targetBytes * 8) / bitrate));
  const outDir = getOutputDir(inputPath);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const numSegments = Math.ceil(duration / segmentTimeSec);
  const outputs = [];
  let failed = false;

  for (let i = 0; i < numSegments; ++i) {
    const offset = i * segmentTimeSec;
    const segDur = Math.min(segmentTimeSec, duration - offset);
    const outPath = path.join(outDir, `part-${pad(i)}.mp4`);
  const spinner = createSpinner(`Segment ${i+1}/${numSegments}: starting...`);
    let percent = 0;
    try {
      let fastOk = await splitSegment({
        inputPath, outPath, offset, segDur, fastPath: true,
        onProgress: (t) => {
          const [h, m, s] = t.split(':').map(Number);
          const sec = h*3600 + m*60 + s;
          percent = Math.min(100, Math.round(100 * sec / segDur));
          spinner.text = `Segment ${i+1}/${numSegments}: ${percent}%`;
        },
        safetyGuard: checkSafetyGuard
      });
      if (!fastOk) {
        spinner.text = `Segment ${i+1}/${numSegments}: fallback re-encode...`;
        await splitSegment({
          inputPath, outPath, offset, segDur, fastPath: false,
          onProgress: (t) => {
            const [h, m, s] = t.split(':').map(Number);
            const sec = h*3600 + m*60 + s;
            percent = Math.min(100, Math.round(100 * sec / segDur));
            spinner.text = `Segment ${i+1}/${numSegments}: ${percent}% (re-encode)`;
          },
          safetyGuard: checkSafetyGuard
        });
      }
      spinner.succeed(`Segment ${i+1}/${numSegments}: done (${prettyBytes(fs.statSync(outPath).size)})`);
      outputs.push(outPath);
    } catch (e) {
      spinner.fail(`Segment ${i+1}/${numSegments}: failed (${e.message})`);
      failed = true; break;
    }
  }

  if (failed) {
    console.error('Aborted. Some segments may be incomplete. Original file NOT deleted.');
    process.exit(2);
  }

  if (!noPrompt && !deleteOriginal) {
    const { del } = await prompts({
      type: 'confirm', name: 'del', message: 'Delete original file after successful split?', initial: false
    });
    deleteOriginal = del;
  }
  if (deleteOriginal) {
    try { fs.unlinkSync(inputPath); console.log('Original file deleted.'); } catch (e) { console.error('Failed to delete original:', e); }
  }
  console.log('Segments created:');
  outputs.forEach((o, i) => console.log(`  [${i+1}] ${o}`));
}

main().catch(e => { console.error(e); process.exit(1); });