const { ipcRenderer } = require('electron');

const mergeInput = document.getElementById('mergeInput');
const mergeBtn = document.getElementById('mergeBtn');
const mergeProgress = document.getElementById('mergeProgress');


mergeBtn.addEventListener('click', async () => {
  if (!mergeInput.files.length) {
    mergeProgress.textContent = 'Please select at least two videos.';
    return;
  }
  const files = Array.from(mergeInput.files).map(f => f.path);
  if (files.length < 2) {
    mergeProgress.textContent = 'Select at least two videos to merge.';
    return;
  }
  mergeProgress.innerHTML = '<div class="bar"><div class="bar-inner" id="mergeBar"></div></div>';
  const barInner = document.getElementById('mergeBar');
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
