document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const modelSelect = document.getElementById('model-select');
  const status = document.getElementById('status');

  chrome.storage.sync.get({ userApiKey: '', selectedModel: 'gemini-3.5-flash' }, (data) => {
    apiKeyInput.value = data.userApiKey;
    modelSelect.value = data.selectedModel;
  });

  let saveTimeout;
  function saveData() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      chrome.storage.sync.set({ 
        userApiKey: apiKeyInput.value.trim(),
        selectedModel: modelSelect.value 
      }, () => {
        status.innerText = 'Settings saved securely!';
        setTimeout(() => { status.innerText = ''; }, 2000);
      });
    }, 500);
  }

  apiKeyInput.addEventListener('input', saveData);
  modelSelect.addEventListener('change', saveData);
});
