const { ipcRenderer } = require('electron');

const mergeInput = document.getElementById('mergeInput');
const mergeBtn = document.getElementById('mergeBtn');
const mergeProgress = document.getElementById('mergeProgress');
const fileListEl = document.getElementById('fileList');

let selectedFiles = [];

function renderFileList() {
  if (!fileListEl) return;
  fileListEl.innerHTML = '';
  selectedFiles.forEach((fullPath, idx) => {
    const li = document.createElement('li');
    li.style.display = 'flex';
    li.style.alignItems = 'center';
    li.style.gap = '0.5rem';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = fullPath.split(/\\|\//).pop();
    nameSpan.style.flex = '1';
    const upBtn = document.createElement('button');
    upBtn.textContent = '↑';
    upBtn.title = 'Move up';
    upBtn.disabled = idx === 0;
    upBtn.addEventListener('click', () => {
      if (idx > 0) {
        const temp = selectedFiles[idx - 1];
        selectedFiles[idx - 1] = selectedFiles[idx];
        selectedFiles[idx] = temp;
        renderFileList();
      }
    });
    const downBtn = document.createElement('button');
    downBtn.textContent = '↓';
    downBtn.title = 'Move down';
    downBtn.disabled = idx === selectedFiles.length - 1;
    downBtn.addEventListener('click', () => {
      if (idx < selectedFiles.length - 1) {
        const temp = selectedFiles[idx + 1];
        selectedFiles[idx + 1] = selectedFiles[idx];
        selectedFiles[idx] = temp;
        renderFileList();
      }
    });
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove from list';
    removeBtn.addEventListener('click', () => {
      selectedFiles.splice(idx, 1);
      renderFileList();
    });
    li.appendChild(nameSpan);
    li.appendChild(upBtn);
    li.appendChild(downBtn);
    li.appendChild(removeBtn);
    fileListEl.appendChild(li);
  });
}

mergeInput.addEventListener('change', () => {
  // Replace current selection with new selection
  selectedFiles = Array.from(mergeInput.files).map(f => f.path);
  renderFileList();
});


mergeBtn.addEventListener('click', async () => {
  if (!selectedFiles.length) {
    mergeProgress.textContent = 'Please select at least two videos.';
    return;
  }
  const files = selectedFiles.slice();
  if (files.length < 2) {
    mergeProgress.textContent = 'Select at least two videos to merge.';
    return;
  }
  mergeProgress.innerHTML = '<div class="bar"><div class="bar-inner" id="mergeBar"></div></div>';
  const barInner = document.getElementById('mergeBar');
  ipcRenderer.removeAllListeners('merge-progress');
  ipcRenderer.on('merge-progress', (e, { progress }) => {
    if (progress === null) {
      barInner.style.width = '100%';
      barInner.textContent = 'Working...';
    } else {
      barInner.style.width = progress + '%';
      barInner.textContent = progress + '%';
    }
  });
  const result = await ipcRenderer.invoke('merge-videos', {
    inputPaths: files,
    outputPath: undefined,
    deleteOriginals: false
  });
  if (result.success) {
    mergeProgress.innerHTML = `Merged video saved to: ${result.output}`;
    // Prompt to delete originals
    if (confirm('Do you want to delete the original files?')) {
      const delResult = await ipcRenderer.invoke('delete-originals', files);
      if (delResult.success) {
        mergeProgress.innerHTML += '<br>Original files deleted.';
      } else {
        mergeProgress.innerHTML += `<br>Failed to delete originals: ${delResult.error}`;
      }
    }
  } else {
    mergeProgress.innerHTML = `Error: ${result.error}`;
  }
});
