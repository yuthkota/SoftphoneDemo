const statusDiv = document.getElementById('status');
const browserCallBtn = document.getElementById('browserCallBtn');
const endCallBtn = document.getElementById('endCallBtn');
const targetPhoneInput = document.getElementById('targetPhoneNumber');
const callLogsDiv = document.getElementById('callLogs');
const callModal = document.getElementById('callModal');
const modalEndCallBtn = document.getElementById('modalEndCallBtn');

const baseUrl = window.location.origin;

let device = null;
let deviceReady = false;
let currentConnection = null;
let callTimer = null;
let callStartTime = null;

// Sample loan accounts data
let loanAccounts = [
  {
    id: '1',
    borrowerName: 'John Smith',
    accountNumber: 'LA001234',
    phoneNumber: '+1234567890',
    alternatePhone: '+1987654321',
    loanAmount: 50000,
    outstandingBalance: 35000,
    dueDate: '2024-01-15',
    status: 'overdue',
    notes: 'Missed last 2 payments. Promised to pay by end of month.',
    lastContacted: null
  },
  {
    id: '2',
    borrowerName: 'Sarah Johnson',
    accountNumber: 'LA001235',
    phoneNumber: '+1555123456',
    alternatePhone: '',
    loanAmount: 25000,
    outstandingBalance: 15000,
    dueDate: '2024-02-01',
    status: 'current',
    notes: 'Good payment history. Prefers morning calls.',
    lastContacted: null
  },
  {
    id: '3',
    borrowerName: 'Michael Brown',
    accountNumber: 'LA001236',
    phoneNumber: '+1777888999',
    alternatePhone: '+1666555444',
    loanAmount: 75000,
    outstandingBalance: 60000,
    dueDate: '2024-01-10',
    status: 'default',
    notes: 'Account in default. Legal action pending.',
    lastContacted: '2024-01-05'
  }
];

// Load accounts from localStorage if available
const savedAccounts = localStorage.getItem('loanAccounts');
if (savedAccounts) {
  try {
    loanAccounts = JSON.parse(savedAccounts);
  } catch (e) {
    console.error('Error loading saved accounts:', e);
  }
}

function updateStatus(message, className = '') {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + className;
}

function addCallLog(method, targetPhone, status, timestamp, details = '', borrowerName = '') {
  const logDiv = document.createElement('div');
  logDiv.className = 'call-log';

  const statusColor = status === 'initiated' ? '#28a745' :
    status === 'failed' ? '#dc3545' : '#6c757d';

  logDiv.innerHTML = `
    <div class="call-info">
      <div class="call-details">
        <strong>${borrowerName || 'Unknown'}</strong><br>
        <span class="phone-number">${targetPhone}</span><br>
        <small class="timestamp">${timestamp}</small>
        ${details ? `<br><small class="call-notes">${details}</small>` : ''}
      </div>
      <div class="call-status" style="color: ${statusColor};">
        ${status.toUpperCase()}
      </div>
    </div>
    <button class="redial-btn" onclick="redialNumber('${targetPhone}')">📞</button>
  `;

  const noCallsMsg = callLogsDiv.querySelector('.no-calls');
  if (noCallsMsg) noCallsMsg.remove();

  callLogsDiv.insertBefore(logDiv, callLogsDiv.firstChild);

  // Save to localStorage
  const callHistory = JSON.parse(localStorage.getItem('callHistory') || '[]');
  callHistory.unshift({
    method,
    targetPhone,
    status,
    timestamp,
    details,
    borrowerName
  });
  localStorage.setItem('callHistory', JSON.stringify(callHistory.slice(0, 50))); // Keep last 50 calls
}

function redialNumber(phoneNumber) {
  targetPhoneInput.value = phoneNumber;
  switchTab('dialer');
}

// Initialize device and request mic
async function setupDeviceAndMic() {
  try {
    updateStatus('🎤 Requesting microphone access...', 'calling');
    await navigator.mediaDevices.getUserMedia({ audio: true });

    updateStatus('🔧 Fetching token and initializing device...', 'calling');
    const res = await fetch(`${baseUrl}/token`);
    const data = await res.json();

    device = new Twilio.Device(data.token, { debug: true });

    device.on('ready', () => {
      updateStatus('✅ Ready to make calls', 'ready');
      deviceReady = true;
      browserCallBtn.disabled = false;
      document.getElementById('connectionStatus').style.color = '#28a745';
    });

    device.on('error', (err) => {
      updateStatus('❌ Device Error: ' + err.message, 'error');
      deviceReady = false;
      browserCallBtn.disabled = true;
      document.getElementById('connectionStatus').style.color = '#dc3545';
    });

    device.on('disconnect', () => {
      updateStatus('📴 Call ended', 'disconnected');
      endCall();
    });

  } catch (err) {
    updateStatus('❌ Initialization failed: ' + err.message, 'error');
    browserCallBtn.disabled = true;
    document.getElementById('connectionStatus').style.color = '#dc3545';
  }
}

function startCall() {
  const targetPhone = targetPhoneInput.value.trim();

  if (!targetPhone) {
    alert("Please enter a phone number to call.");
    targetPhoneInput.focus();
    return;
  }

  if (!deviceReady) {
    alert("Device is not ready. Please wait.");
    return;
  }

  updateStatus('🌐 Connecting call...', 'calling');

  // Find borrower info
  const account = loanAccounts.find(acc => 
    acc.phoneNumber === targetPhone || acc.alternatePhone === targetPhone
  );

  currentConnection = device.connect({ To: targetPhone });

  currentConnection.on('accept', () => {
    updateStatus('📞 Call connected!', 'connected');
    browserCallBtn.style.display = 'none';
    endCallBtn.style.display = 'inline-block';
    
    // Show call modal
    showCallModal(targetPhone, account?.borrowerName || 'Unknown');
    
    // Start call timer
    startCallTimer();
    
    // Add to call log
    addCallLog(
      'Outbound Call', 
      targetPhone, 
      'initiated', 
      new Date().toLocaleString(),
      account ? `Account: ${account.accountNumber}` : '',
      account?.borrowerName || ''
    );

    // Update last contacted
    if (account) {
      account.lastContacted = new Date().toISOString().split('T')[0];
      saveAccounts();
      renderAccounts();
    }
  });

  currentConnection.on('disconnect', () => {
    endCall();
  });

  currentConnection.on('error', (err) => {
    updateStatus('❌ Call error: ' + err.message, 'error');
    endCall();
  });
}

function endCall() {
  if (currentConnection) {
    currentConnection.disconnect();
  }
  
  currentConnection = null;
  updateStatus('📴 Call ended', 'disconnected');
  browserCallBtn.style.display = 'inline-block';
  endCallBtn.style.display = 'none';
  
  // Hide call modal
  callModal.style.display = 'none';
  
  // Stop call timer
  stopCallTimer();
}

function showCallModal(phoneNumber, borrowerName) {
  document.getElementById('callerName').textContent = borrowerName;
  document.getElementById('callerNumber').textContent = phoneNumber;
  callModal.style.display = 'flex';
}

function startCallTimer() {
  callStartTime = Date.now();
  callTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById('callTimer').textContent = 
      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

function stopCallTimer() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
  document.getElementById('callTimer').textContent = '00:00';
}

// Tab functionality
function switchTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Remove active class from all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected tab content
  document.getElementById(tabName).classList.add('active');
  
  // Add active class to selected tab button
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
}

// Account management functions
function saveAccounts() {
  localStorage.setItem('loanAccounts', JSON.stringify(loanAccounts));
}

function renderAccounts() {
  const accountsList = document.getElementById('accountsList');
  const searchTerm = document.getElementById('searchAccounts').value.toLowerCase();
  
  const filteredAccounts = loanAccounts.filter(account => 
    account.borrowerName.toLowerCase().includes(searchTerm) ||
    account.accountNumber.toLowerCase().includes(searchTerm) ||
    account.phoneNumber.includes(searchTerm)
  );

  if (filteredAccounts.length === 0) {
    accountsList.innerHTML = '<div class="no-accounts">No accounts found</div>';
    return;
  }

  accountsList.innerHTML = filteredAccounts.map(account => `
    <div class="account-card ${account.status}">
      <div class="account-header">
        <div class="account-info">
          <h4>${account.borrowerName}</h4>
          <span class="account-number">${account.accountNumber}</span>
        </div>
        <div class="account-status">
          <span class="status-badge ${account.status}">${account.status.toUpperCase()}</span>
        </div>
      </div>
      
      <div class="account-details">
        <div class="detail-row">
          <span class="label">Phone:</span>
          <span class="value">${account.phoneNumber}</span>
          <button class="call-account-btn" onclick="callAccount('${account.phoneNumber}', '${account.borrowerName}')">📞</button>
        </div>
        ${account.alternatePhone ? `
        <div class="detail-row">
          <span class="label">Alt Phone:</span>
          <span class="value">${account.alternatePhone}</span>
          <button class="call-account-btn" onclick="callAccount('${account.alternatePhone}', '${account.borrowerName}')">📞</button>
        </div>
        ` : ''}
        <div class="detail-row">
          <span class="label">Outstanding:</span>
          <span class="value amount">$${account.outstandingBalance.toLocaleString()}</span>
        </div>
        <div class="detail-row">
          <span class="label">Due Date:</span>
          <span class="value">${account.dueDate || 'N/A'}</span>
        </div>
        ${account.lastContacted ? `
        <div class="detail-row">
          <span class="label">Last Contact:</span>
          <span class="value">${account.lastContacted}</span>
        </div>
        ` : ''}
        ${account.notes ? `
        <div class="account-notes">
          <strong>Notes:</strong> ${account.notes}
        </div>
        ` : ''}
      </div>
    </div>
  `).join('');

  // Update stats
  updateAccountStats();
}

function updateAccountStats() {
  const total = loanAccounts.length;
  const overdue = loanAccounts.filter(acc => acc.status === 'overdue' || acc.status === 'default').length;
  const today = new Date().toISOString().split('T')[0];
  const contactedToday = loanAccounts.filter(acc => acc.lastContacted === today).length;

  document.getElementById('totalAccounts').textContent = total;
  document.getElementById('overdueAccounts').textContent = overdue;
  document.getElementById('contactedToday').textContent = contactedToday;
}

function callAccount(phoneNumber, borrowerName) {
  targetPhoneInput.value = phoneNumber;
  switchTab('dialer');
  // Auto-focus on call button
  setTimeout(() => {
    if (deviceReady) {
      browserCallBtn.focus();
    }
  }, 100);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  setupDeviceAndMic();
  renderAccounts();
  loadCallHistory();

  // Tab navigation
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });

  // Dial pad
  document.querySelectorAll('.dial-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const digit = btn.dataset.digit;
      targetPhoneInput.value += digit;
      
      // Send DTMF if in call
      if (currentConnection) {
        currentConnection.sendDigits(digit);
      }
    });
  });

  // Call controls
  browserCallBtn.addEventListener('click', startCall);
  endCallBtn.addEventListener('click', endCall);
  modalEndCallBtn.addEventListener('click', endCall);

  // Add account form
  document.getElementById('addAccountForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const newAccount = {
      id: Date.now().toString(),
      borrowerName: document.getElementById('borrowerName').value,
      accountNumber: document.getElementById('accountNumber').value,
      phoneNumber: document.getElementById('phoneNumber').value,
      alternatePhone: document.getElementById('alternatePhone').value,
      loanAmount: parseFloat(document.getElementById('loanAmount').value),
      outstandingBalance: parseFloat(document.getElementById('outstandingBalance').value),
      dueDate: document.getElementById('dueDate').value,
      status: document.getElementById('loanStatus').value,
      notes: document.getElementById('notes').value,
      lastContacted: null
    };

    loanAccounts.unshift(newAccount);
    saveAccounts();
    renderAccounts();
    
    // Reset form and switch to accounts tab
    e.target.reset();
    switchTab('accounts');
    
    alert('Account added successfully!');
  });

  // Search functionality
  document.getElementById('searchAccounts').addEventListener('input', renderAccounts);
  document.getElementById('searchBtn').addEventListener('click', renderAccounts);

  // Clear history
  document.getElementById('clearHistoryBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all call history?')) {
      localStorage.removeItem('callHistory');
      callLogsDiv.innerHTML = '<div class="no-calls">No calls made yet</div>';
    }
  });
});

function loadCallHistory() {
  const history = JSON.parse(localStorage.getItem('callHistory') || '[]');
  history.forEach(call => {
    addCallLog(call.method, call.targetPhone, call.status, call.timestamp, call.details, call.borrowerName);
  });
}

// Initialize
browserCallBtn.disabled = true;