const $ = (id) => document.getElementById(id);
chrome.storage.sync.get(['apiBase', 'apiKey', 'whatsapp']).then(({ apiBase, apiKey, whatsapp }) => {
  $('apiBase').value = apiBase || 'http://localhost:3000';
  $('apiKey').value = apiKey || '';
  $('whatsapp').checked = whatsapp === true;
});
$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({ apiBase: $('apiBase').value.trim(), apiKey: $('apiKey').value.trim(), whatsapp: $('whatsapp').checked });
  $('saved').textContent = 'Saved';
  setTimeout(() => ($('saved').textContent = ''), 1500);
});
