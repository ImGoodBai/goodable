/**
 * Renderer process - UI logic
 */

const chatMessages = document.getElementById('chatMessages');
const logMessages = document.getElementById('logMessages');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');

let isProcessing = false;

// Add chat message to UI
function addChatMessage(text, type) {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add log entry to UI
function addLogEntry(data) {
  const div = document.createElement('div');
  div.className = `log-entry ${data.type}`;

  const time = new Date(data.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  div.innerHTML = `<span class="log-time">${time}</span><span class="log-type">[${data.type}]</span>${escapeHtml(data.message)}`;
  logMessages.appendChild(div);
  logMessages.scrollTop = logMessages.scrollHeight;
}

// Escape HTML for safe display
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Send message
async function sendMessage() {
  const prompt = messageInput.value.trim();
  if (!prompt || isProcessing) return;

  isProcessing = true;
  sendBtn.disabled = true;
  messageInput.value = '';

  addChatMessage(prompt, 'user');

  try {
    const result = await window.electronAPI.chat(prompt);

    if (result.success) {
      addChatMessage(result.reply, 'assistant');
    } else {
      addChatMessage(`Error: ${result.error}`, 'error');
    }
  } catch (error) {
    addChatMessage(`Error: ${error.message}`, 'error');
  }

  isProcessing = false;
  sendBtn.disabled = false;
  messageInput.focus();
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Listen for logs from main process
window.electronAPI.onLog(addLogEntry);

// Focus input on load
messageInput.focus();

// Add initial log
addLogEntry({
  type: 'SDK',
  message: 'Demo ready. Send a message to test canUseTool callback.',
  timestamp: new Date().toISOString(),
});
