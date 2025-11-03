const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

function resolveFfmpegPath() {
  // Start with the path provided by ffmpeg-static
  const defaultPath = require('ffmpeg-static');
  const candidates = [defaultPath];
  if (app.isPackaged) {
    // electron-builder (asar) unpacked path
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'));
    // electron-packager: resources/app/node_modules path
    candidates.push(path.join(process.resourcesPath, 'app', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'));
  }
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  // Fall back to whatever ffmpeg-static returned even if not found; spawn will error with a clear path
  return defaultPath;
}

let ffmpegPath = resolveFfmpegPath();

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

// IPC handler to delete originals after merge
ipcMain.handle('delete-originals', async (event, files) => {
  try {
    for (const f of files) {
      try {
        fs.unlinkSync(f);
      } catch (e) {
        return { success: false, error: `Failed to delete ${f}: ${e.message}` };
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('merge-videos', async (event, { inputPaths, outputPath, deleteOriginals }) => {
  if (!inputPaths || inputPaths.length < 2) return { error: 'Select at least two files.' };
  // Ask user where to save merged file if not provided
  if (!outputPath) {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Merged Video As',
      defaultPath: path.join(path.dirname(inputPaths[0]), 'merged.mp4'),
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });
    if (!filePath) return { success: false, error: 'Save cancelled.' };
    outputPath = filePath;
  }
  const fileListPath = path.join(os.tmpdir(), `ffmpeg-merge-list-${Date.now()}.txt`);
  fs.writeFileSync(
    fileListPath,
    inputPaths.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n')
  );
  try {
    await new Promise((resolve, reject) => {
      const ffmpegArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', fileListPath,
        '-c', 'copy',
        outputPath
      ];
      const ffmpeg = spawn(ffmpegPath, ffmpegArgs);
      ffmpeg.stderr.on('data', data => {
        event.sender.send('merge-progress', { progress: null });
      });
      ffmpeg.on('close', code => {
        if (fs.existsSync(fileListPath)) {
          fs.unlinkSync(fileListPath);
        }
        if (code === 0) {
          resolve();
        } else {
          reject(new Error('ffmpeg failed. Files may not be compatible for direct merge.'));
        }
      });
      ffmpeg.on('error', (err) => {
        // If spawn failed due to missing binary in one path, try re-resolving once
        if (err && err.code === 'ENOENT') {
          const retryPath = resolveFfmpegPath();
          if (retryPath !== ffmpegPath && fs.existsSync(retryPath)) {
            ffmpegPath = retryPath;
            const ff2 = spawn(ffmpegPath, ffmpegArgs);
            ff2.stderr.on('data', data => event.sender.send('merge-progress', { progress: null }));
            ff2.on('close', code => {
              if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
              code === 0 ? resolve() : reject(new Error('ffmpeg failed. Files may not be compatible for direct merge.'));
            });
            ff2.on('error', reject);
            return;
          }
        }
        reject(err);
      });
    });
    // Deletion of originals is now handled by a separate IPC event after merge
    return { success: true, output: outputPath };
  } catch (err) {
    if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
    return { success: false, error: err.message };
  }
});
