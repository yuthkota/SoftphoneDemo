const statusDiv = document.getElementById('status');
const browserCallBtn = document.getElementById('browserCallBtn');
const targetPhoneInput = document.getElementById('targetPhoneNumber');
const callLogsDiv = document.getElementById('callLogs');

const baseUrl = window.location.origin;

function updateStatus(message, className = '') {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + className;
}

function addCallLog(method, targetPhone, status, timestamp, details = '') {
  const logDiv = document.createElement('div');
  logDiv.className = 'call-log';

  const statusColor = status === 'initiated' ? '#28a745' :
    status === 'failed' ? '#dc3545' : '#6c757d';

  logDiv.innerHTML = `
    <div>
      <strong>${method}:</strong> ${targetPhone}<br>
      <small>${timestamp}</small>
      ${details ? `<br><small style="color: #666;">${details}</small>` : ''}
    </div>
    <div style="color: ${statusColor}; font-weight: bold;">
      ${status.toUpperCase()}
    </div>
  `;

  const noCallsMsg = callLogsDiv.querySelector('.no-calls');
  if (noCallsMsg) noCallsMsg.remove();

  callLogsDiv.insertBefore(logDiv, callLogsDiv.firstChild);
}

let device = null;
let deviceReady = false;

// Initialize device and request mic *before* user clicks "Call"
async function setupDeviceAndMic() {
  try {
    updateStatus('🎤 Requesting microphone access...', 'calling');
    await navigator.mediaDevices.getUserMedia({ audio: true });

    updateStatus('🔧 Fetching token and initializing device...', 'calling');
    const res = await fetch(`${baseUrl}/token`);
    const data = await res.json();

    device = new Twilio.Device(data.token, { debug: true });

    device.on('ready', () => {
      updateStatus('✅ Browser ready to call', 'ready');
      deviceReady = true;
      browserCallBtn.disabled = false;  // Enable call button
    });

    device.on('error', (err) => {
      updateStatus('❌ Twilio Device Error: ' + err.message, 'error');
      deviceReady = false;
      browserCallBtn.disabled = true;
    });

    device.on('disconnect', () => {
      updateStatus('📴 Call ended', 'disconnected');
    });

  } catch (err) {
    updateStatus('❌ Initialization failed: ' + err.message, 'error');
    browserCallBtn.disabled = true;
  }
}

// Call this on page load or when ready
setupDeviceAndMic();

browserCallBtn.disabled = true;  // Disable call button until device ready

// Now, in the click handler, just call .connect() synchronously
browserCallBtn.onclick = () => {
  const targetPhone = targetPhoneInput.value.trim();

  if (!targetPhone) {
    alert("Please enter a phone number to call from browser.");
    targetPhoneInput.focus();
    return;
  }

  if (!deviceReady) {
    alert("Device is not ready. Please wait.");
    return;
  }

  updateStatus('🌐 Connecting browser call...', 'calling');

  // This MUST be synchronous inside user click event:
  const connection = device.connect({ To: targetPhone });

  connection.on('accept', () => {
    updateStatus('📞 Call connected!', 'connected');
    addCallLog('Browser Call', targetPhone, 'initiated', new Date().toLocaleString());
  });

  connection.on('disconnect', () => {
    updateStatus('📴 Call ended', 'disconnected');
  });

  connection.on('error', (err) => {
    updateStatus('❌ Call error: ' + err.message, 'error');
  });
};
