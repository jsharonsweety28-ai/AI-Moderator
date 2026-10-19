const $ = (id) => document.getElementById(id);
chrome.storage.sync.get(['apiBase', 'apiKey']).then(({ apiBase, apiKey }) => {
  $('apiBase').value = apiBase || 'http://localhost:3000';
  $('apiKey').value = apiKey || '';
});
$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({ apiBase: $('apiBase').value.trim(), apiKey: $('apiKey').value.trim() });
  $('saved').textContent = 'Saved';
  setTimeout(() => ($('saved').textContent = ''), 1500);
});
