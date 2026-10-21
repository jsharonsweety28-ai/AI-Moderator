const $ = (id) => document.getElementById(id);
chrome.storage.sync.get(['apiBase', 'apiKey', 'messages', 'whatsapp']).then(({ apiBase, apiKey, messages, whatsapp }) => {
  $('apiBase').value = apiBase || 'http://localhost:3000';
  $('apiKey').value = apiKey || '';
  $('messages').checked = messages === true || whatsapp === true; // "whatsapp" = the older name
});
$('save').addEventListener('click', async () => {
  await chrome.storage.sync.set({ apiBase: $('apiBase').value.trim(), apiKey: $('apiKey').value.trim(), messages: $('messages').checked, whatsapp: $('messages').checked });
  $('saved').textContent = 'Saved';
  setTimeout(() => ($('saved').textContent = ''), 1500);
});
