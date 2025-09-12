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
  mergeProgress.textContent = 'Merging...';
  const result = await ipcRenderer.invoke('merge-videos', files);
  if (result.success) {
    mergeProgress.textContent = `Merged video saved to: ${result.output}`;
  } else {
    mergeProgress.textContent = `Error: ${result.error}`;
  }
});
let inputPaths = [];
let mergeOutput = '';

document.getElementById('select-multi').onclick = async () => {
  inputPaths = await ipcRenderer.invoke('select-multiple-files');
  document.getElementById('multi-files').textContent = inputPaths && inputPaths.length ? inputPaths.join(', ') : '';
  document.getElementById('merge').disabled = !(inputPaths && inputPaths.length > 1);
};

document.getElementById('mergeOutput').oninput = (e) => {
  mergeOutput = e.target.value;
};

document.getElementById('merge').onclick = async () => {
  if (!inputPaths || inputPaths.length < 2) return;
  let outputPath = mergeOutput || 'output.mp4';
  // If not absolute, save next to first input
  if (!/^[A-Za-z]:\\|\//.test(outputPath)) {
    outputPath = require('path').join(require('path').dirname(inputPaths[0]), outputPath);
  }
  document.getElementById('mergeProgress').textContent = 'Merging...';
  const result = await ipcRenderer.invoke('merge-videos', { inputPaths, outputPath });
  if (result.success) {
    document.getElementById('mergeProgress').textContent = 'Merged to: ' + result.output;
  } else {
    document.getElementById('mergeProgress').textContent = 'Error: ' + result.error;
  }
};
const { ipcRenderer } = require('electron');

let inputPath = null;
let outputs = [];

document.getElementById('select').onclick = async () => {
  inputPath = await ipcRenderer.invoke('select-file');
  document.getElementById('file').textContent = inputPath || '';
  document.getElementById('split').disabled = !inputPath;
};

document.getElementById('split').onclick = async () => {
  const targetMB = parseInt(document.getElementById('targetMB').value, 10) || 1536;
  document.getElementById('progress').innerHTML = '';
  document.getElementById('outputs').innerHTML = '';
  outputs = [];
  let progressBar = document.createElement('div');
  progressBar.className = 'bar';
  let barInner = document.createElement('div');
  barInner.className = 'bar-inner';
  progressBar.appendChild(barInner);
  document.getElementById('progress').appendChild(progressBar);
  ipcRenderer.on('segment-progress', (e, { segment, total, progress }) => {
    barInner.style.width = progress + '%';
    barInner.textContent = `Segment ${segment}/${total}: ${progress}%`;
  });
  const result = await ipcRenderer.invoke('split-video', { inputPath, targetMB });
  if (result.error) {
    document.getElementById('progress').textContent = result.error;
    return;
  }
  outputs = result.outputs;
  document.getElementById('outputs').innerHTML = '<b>Segments created:</b><br>' + outputs.map(o => `<div>${o}</div>`).join('');
  document.getElementById('deleteDiv').style.display = 'block';
};

document.getElementById('delete').onclick = async () => {
  const res = await ipcRenderer.invoke('delete-original', inputPath);
  if (res.success) {
    document.getElementById('deleteMsg').textContent = 'Original file deleted.';
  } else {
    document.getElementById('deleteMsg').textContent = 'Failed: ' + res.error;
  }
};
