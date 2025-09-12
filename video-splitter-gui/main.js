
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
let ffprobePath;
try {
  ffprobePath = require('ffprobe-static').path;
} catch (e) {
  ffprobePath = ffmpegPath.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
}

// Open the main window
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

// Select a single file for splitting
ipcMain.handle('select-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm'] }]
  });
  if (canceled) return null;
  return filePaths[0];
});

// Select multiple files for merging
ipcMain.handle('select-multiple-files', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Videos', extensions: ['mp4', 'mkv', 'mov', 'avi', 'webm'] }]
  });
  if (canceled) return [];
  return filePaths;
});

// Split video into chunks
ipcMain.handle('split-video', async (event, { inputPath, targetMB }) => {
  // Probe duration and bitrate
  function ffprobePromise() {
    return new Promise((resolve, reject) => {
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
          reject(new Error('ffprobe failed: ' + errData));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
      proc.on('error', reject);
    });
  }
  let probe;
  try {
    probe = await ffprobePromise();
  } catch (e) {
    return { error: 'Failed to probe video.' };
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
      const proc = spawn(ffmpegPath, args);
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
      proc.on('error', reject);
    });
  }
  return { outputs, outDir };
});

// Merge videos (array of file paths, save dialog)
ipcMain.handle('merge-videos', async (event, files) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Merged Video As',
      defaultPath: path.join(path.dirname(files[0]), 'merged.mp4'),
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });
    if (!filePath) return { success: false, error: 'Save cancelled.' };
    const fileListPath = path.join(os.tmpdir(), `ffmpeg-merge-list-${Date.now()}.txt`);
    fs.writeFileSync(
      fileListPath,
      files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
    );
    return await new Promise((resolve) => {
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', fileListPath,
        '-c', 'copy',
        filePath
      ];
      const ffmpeg = spawn(ffmpegPath, ffmpegArgs);
      ffmpeg.stderr.on('data', data => {
        // Optionally, parse progress here and send to renderer
      });
      ffmpeg.on('close', code => {
        fs.unlinkSync(fileListPath);
        if (code === 0) {
          resolve({ success: true, output: filePath });
        } else {
          resolve({ success: false, error: 'ffmpeg failed. Files may not be compatible for direct merge.' });
        }
      });
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Merge videos (object with inputPaths/outputPath)
ipcMain.handle('merge-videos', async (event, { inputPaths, outputPath }) => {
  if (!inputPaths || inputPaths.length < 2) return { error: 'Select at least two files.' };
  const tmpList = path.join(app.getPath('temp'), `concat-list-${Date.now()}.txt`);
  try {
    fs.writeFileSync(tmpList, inputPaths.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const args = [
      '-hide_banner', '-y',
      '-f', 'concat', '-safe', '0', '-i', tmpList,
      '-c', 'copy', outputPath
    ];
    await new Promise((resolve, reject) => {
      const proc = spawn(ffmpegPath, args);
      proc.stderr.on('data', chunk => {
        // Optionally, parse progress here
      });
      proc.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg failed')));
      proc.on('error', reject);
    });
    fs.unlinkSync(tmpList);
    return { success: true, output: outputPath };
  } catch (e) {
    if (fs.existsSync(tmpList)) fs.unlinkSync(tmpList);
    return { error: e.message };
  }
});

// Delete original file handler
ipcMain.handle('delete-original', async (event, inputPath) => {
  try {
    fs.unlinkSync(inputPath);
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
});
