const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

function which(cmd) {
  try {
    const isWin = process.platform === 'win32';
    const out = spawnSync(isWin ? 'where' : 'which', [cmd], { encoding: 'utf8' });
    if (out.status === 0 && out.stdout) {
      const first = out.stdout.split(/\r?\n/).find(Boolean);
      return first ? first.trim() : null;
    }
  } catch {}
  return null;
}

function normalizeAsarPath(p) {
  if (!p) return p;
  if (p.includes('app.asar')) {
    const fixed = p.replace(/app\.asar(?!\.unpacked)/, 'app.asar.unpacked');
    try { if (fs.existsSync(fixed)) return fixed; } catch {}
  }
  return p;
}

function resolveBinary(baseModulePath, binaryName) {
  const defaultPath = baseModulePath; // e.g. ffmpeg-static path string
  const candidates = [];
  if (defaultPath) candidates.push(normalizeAsarPath(defaultPath));
  if (app.isPackaged) {
    const binFile = process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', `${binaryName}-static`, binFile));
    // Some packagers mount resources/app instead of app.asar; normalize just in case
    candidates.push(path.join(process.resourcesPath, 'app', 'node_modules', `${binaryName}-static`, binFile));
  }
  // Fallback to system PATH
  const sys = which(binaryName);
  if (sys) candidates.push(sys);
  for (const p of candidates) {
    try { if (p && fs.existsSync(p)) return p; } catch {}
  }
  return defaultPath;
}

let ffmpegPath = resolveBinary(require('ffmpeg-static'), 'ffmpeg');
let ffprobePath;
try {
  ffprobePath = resolveBinary(require('ffprobe-static').path, 'ffprobe');
} catch (e) {
  const sys = which('ffprobe');
  ffprobePath = sys || ffmpegPath.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
}

let prettyBytes;
import('pretty-bytes').then(mod => { prettyBytes = mod.default; });

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

ipcMain.handle('select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm'] }]
  });
  if (canceled) return null;
  return filePaths[0];
});

ipcMain.handle('split-video', async (event, { inputPath, targetMB }) => {
  // Probe duration and bitrate
  function ffprobePromise() {
    return new Promise((resolve, reject) => {
      if (!ffprobePath) return reject(new Error('ffprobe unavailable'));
      const proc = spawn(ffprobePath, [
        '-v', 'error',
        '-show_entries', 'format=duration,bit_rate',
        '-of', 'json',
        inputPath
      ]);
      let data = '';
      let errData = '';
      proc.stdout.on('data', chunk => data += chunk);
      proc.stderr.on('data', chunk => errData += chunk);
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('ffprobe failed (code ' + code + '): ' + errData));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
      proc.on('error', (err) => reject(new Error('ffprobe spawn error: ' + err.message)));
    });
  }

  function ffmpegFallbackProbe() {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, [
        '-hide_banner', '-i', inputPath,
        '-f', 'null', '-'
      ]);
      let stderr = '';
      proc.stderr.on('data', chunk => stderr += chunk.toString());
      proc.on('close', () => {
        // Parse Duration: and bitrate: lines
        const durMatch = /Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/.exec(stderr);
        const brMatch = /bitrate:\s*(\d+)\s*kb\/s/.exec(stderr);
        if (!durMatch) return reject(new Error('Could not parse duration from ffmpeg output'));
        const h = parseInt(durMatch[1],10); const m = parseInt(durMatch[2],10); const s = parseInt(durMatch[3],10); const cs = parseInt(durMatch[4],10);
        const duration = h*3600 + m*60 + s + cs/100;
        let bitrate = 0;
        if (brMatch) bitrate = parseInt(brMatch[1],10) * 1000; // kb/s -> b/s
        if (!bitrate) {
          // Attempt average bitrate from size if available (not in stderr here) keep zero triggers copy path anyway
          bitrate = 0;
        }
        resolve({ format: { duration, bit_rate: bitrate } });
      });
      proc.on('error', err => reject(new Error('ffmpeg fallback spawn error: ' + err.message)));
    });
  }
  let probe;
  try {
    probe = await ffprobePromise();
  } catch (e) {
    try {
      const fb = await ffmpegFallbackProbe();
      probe = fb;
    } catch (fbErr) {
      return { error: 'Failed to probe video: ' + e.message + ' | Fallback: ' + fbErr.message + ` | ffprobePath=${ffprobePath || 'null'} ffmpegPath=${ffmpegPath || 'null'}` };
    }
  }
  const duration = parseFloat(probe.format.duration);
  const bitrate = parseInt(probe.format.bit_rate, 10);
  const targetBytes = targetMB * 1024 * 1024;
  const segmentTimeSec = Math.max(10, Math.floor((targetBytes * 8) / bitrate));
  const outDir = path.join(path.dirname(inputPath), path.basename(inputPath, path.extname(inputPath)) + '_segments');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const numSegments = Math.ceil(duration / segmentTimeSec);
  let outputs = [];
  for (let i = 0; i < numSegments; ++i) {
    const offset = i * segmentTimeSec;
    const segDur = Math.min(segmentTimeSec, duration - offset);
    const outPath = path.join(outDir, `part-${String(i).padStart(3, '0')}.mp4`);
    const args = [
      '-hide_banner', '-y',
      '-ss', String(offset), '-i', inputPath,
      '-t', String(segDur),
      '-map', '0',
      '-c', 'copy',
      '-avoid_negative_ts', '1',
      outPath
    ];
    let progress = 0;
    await new Promise((resolve, reject) => {
  let proc = spawn(ffmpegPath, args);
      proc.stderr.on('data', chunk => {
        const m = /time=([0-9:.]+)/.exec(chunk.toString());
        if (m) {
          const [h, m1, s] = m[1].split(':').map(Number);
          const sec = h*3600 + m1*60 + s;
          progress = Math.min(100, Math.round(100 * sec / segDur));
          event.sender.send('segment-progress', { segment: i+1, total: numSegments, progress });
        }
      });
      proc.on('close', code => {
        if (code === 0) {
          outputs.push(outPath);
          resolve();
        } else {
          reject(new Error('ffmpeg failed'));
        }
      });
      proc.on('error', (err) => {
        if (err && err.code === 'ENOENT') {
          const retry = resolveBinary(require('ffmpeg-static'), 'ffmpeg');
          if (retry !== ffmpegPath && fs.existsSync(retry)) {
            ffmpegPath = retry;
            proc = spawn(ffmpegPath, args);
            proc.stderr.on('data', chunk => {
              const m = /time=([0-9:.]+)/.exec(chunk.toString());
              if (m) {
                const [h, m1, s] = m[1].split(':').map(Number);
                const sec = h*3600 + m1*60 + s;
                progress = Math.min(100, Math.round(100 * sec / segDur));
                event.sender.send('segment-progress', { segment: i+1, total: numSegments, progress });
              }
            });
            proc.on('close', code => {
              if (code === 0) { outputs.push(outPath); resolve(); }
              else { reject(new Error('ffmpeg failed')); }
            });
            proc.on('error', reject);
            return;
          }
        }
        reject(err);
      });
    });
  }
  return { outputs, outDir };
});

ipcMain.handle('delete-original', async (event, inputPath) => {
  try {
    fs.unlinkSync(inputPath);
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});
