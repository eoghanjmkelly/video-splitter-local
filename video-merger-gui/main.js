const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
let ffmpegPath = require('ffmpeg-static');
// Use correct ffmpeg path depending on environment
if (app.isPackaged) {
  ffmpegPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
}

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
      ffmpeg.on('error', reject);
    });
    // Deletion of originals is now handled by a separate IPC event after merge
    return { success: true, output: outputPath };
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
  } catch (err) {
    if (fs.existsSync(fileListPath)) fs.unlinkSync(fileListPath);
    return { success: false, error: err.message };
  }
});
