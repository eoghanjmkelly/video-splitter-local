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
