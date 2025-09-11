#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import prompts from 'prompts';
import ora from 'ora';
import prettyBytes from 'pretty-bytes';
import ffmpegPath from 'ffmpeg-static';
import ffmpeg from 'fluent-ffmpeg';

// Set ffmpeg-static path for fluent-ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

const DEFAULT_TARGET_MB = 1536;
const TARGET_BYTES = (mb) => mb * 1024 * 1024;
const MIN_SEGMENT_SEC = 10;
const SAFETY_MEM_THRESHOLD = 0.10; // 10%
const SAFETY_LOAD_MULT = 1.5;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; ++i) {
    if (args[i] === '--input') opts.input = args[++i];
    else if (args[i] === '--targetMB') opts.targetMB = parseInt(args[++i], 10);
    else if (args[i] === '--deleteOriginal') opts.deleteOriginal = true;
    else if (args[i] === '--noPrompt') opts.noPrompt = true;
  }
  return opts;
}

async function getBitrate(inputPath) {
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

function pad(num, len = 3) {
  return String(num).padStart(len, '0');
}

function checkSafetyGuard() {
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const memRatio = freeMem / totalMem;
  if (memRatio < SAFETY_MEM_THRESHOLD) {
    return 'Low memory';
  }
  if (os.platform() !== 'win32') {
    const load = os.loadavg()[0];
    const cores = os.cpus().length;
    if (load > SAFETY_LOAD_MULT * cores) {
      return 'High system load';
    }
  }
  return null;
}

function runFfmpeg(args, onProgress, onError, onClose) {
  const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let lastTime = 0;
  proc.stderr.on('data', (chunk) => {
    const lines = chunk.toString().split(/\r?\n/);
    for (const line of lines) {
      const m = /time=([0-9:.]+)/.exec(line);
      if (m) {
        lastTime = m[1];
        onProgress && onProgress(lastTime);
      }
    }
  });
  proc.on('error', onError);
  proc.on('close', onClose);
  return proc;
}

async function splitSegment({inputPath, outPath, offset, segDur, fastPath, onProgress, safetyGuard}) {
  return new Promise((resolve, reject) => {
    let killed = false;
    let timer = setInterval(() => {
      const reason = safetyGuard();
      if (reason) {
        killed = true;
        proc.kill('SIGKILL');
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
      else if (fastPath) resolve(false); // try fallback
      else reject(new Error('ffmpeg failed'));
    });
  });
}

async function main() {
  const args = parseArgs();
  let inputPath = args.input;
  let targetMB = args.targetMB || DEFAULT_TARGET_MB;
  let deleteOriginal = !!args.deleteOriginal;
  let noPrompt = !!args.noPrompt;

  if (!inputPath || !fs.existsSync(inputPath)) {
    if (noPrompt) throw new Error('Input file required');
    const resp = await prompts({
      type: 'text',
      name: 'file',
      message: 'Path to video file:',
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
      type: 'confirm',
      name: 'confirm',
      message: `Split into ~${targetMB} MB clips?`,
      initial: true
    });
    if (!confirm) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  let bitrate;
  try {
    bitrate = await getBitrate(inputPath);
  } catch (e) {
    console.error('Failed to get bitrate:', e);
    process.exit(1);
  }
  if (!bitrate) {
    console.error('Could not determine bitrate.');
    process.exit(1);
  }

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
    const spinner = ora(`Segment ${i+1}/${numSegments}: starting...`).start();
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
      failed = true;
      break;
    }
  }

  if (failed) {
    console.error('Aborted. Some segments may be incomplete. Original file NOT deleted.');
    process.exit(2);
  }

  if (!noPrompt && !deleteOriginal) {
    const { del } = await prompts({
      type: 'confirm',
      name: 'del',
      message: 'Delete original file after successful split?',
      initial: false
    });
    deleteOriginal = del;
  }

  if (deleteOriginal) {
    try {
      fs.unlinkSync(inputPath);
      console.log('Original file deleted.');
    } catch (e) {
      console.error('Failed to delete original:', e);
    }
  }

  console.log('Segments created:');
  outputs.forEach((o, i) => console.log(`  [${i+1}] ${o}`));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
