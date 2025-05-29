const statusDiv = document.getElementById("status");
const browserCallBtn = document.getElementById("browserCallBtn");
const endCallBtn = document.getElementById("endCallBtn");
const targetPhoneInput = document.getElementById("targetPhoneNumber");
const callLogsDiv = document.getElementById("callLogs");
const callModal = new bootstrap.Modal(document.getElementById("callModal"));
const modalEndCallBtn = document.getElementById("modalEndCallBtn");
const muteBtn = document.getElementById("muteBtn");
const holdBtn = document.getElementById("holdBtn");

const baseUrl = window.location.origin;

let device = null;
let deviceReady = false;
let currentConnection = null;
let callTimer = null;
let callStartTime = null;
let isMuted = false;
let isOnHold = false;

// Sample loan accounts data
let loanAccounts = [
  {
    id: "1",
    borrowerName: "Mao Sophal",
    accountNumber: "LA001234",
    phoneNumber: "+1234567890",
    alternatePhone: "+1987654321",
    loanAmount: 50000,
    outstandingBalance: 35000,
    dueDate: "2024-01-15",
    status: "overdue",
    notes: "Missed last 2 payments. Promised to pay by end of month.",
    lastContacted: null,
  },
  {
    id: "2",
    borrowerName: "Jing Jok",
    accountNumber: "LA001235",
    phoneNumber: "+1555123456",
    alternatePhone: "",
    loanAmount: 25000,
    outstandingBalance: 15000,
    dueDate: "2024-02-01",
    status: "current",
    notes: "Good payment history. Prefers morning calls.",
    lastContacted: null,
  },
  {
    id: "3",
    borrowerName: "Chea Sokha",
    accountNumber: "LA001236",
    phoneNumber: "+1777888999",
    alternatePhone: "+1666555444",
    loanAmount: 75000,
    outstandingBalance: 60000,
    dueDate: "2024-01-10",
    status: "default",
    notes: "Account in default. Legal action pending.",
    lastContacted: "2024-01-05",
  },
];

// Load accounts from localStorage if available
const savedAccounts = localStorage.getItem("loanAccounts");
if (savedAccounts) {
  try {
    loanAccounts = JSON.parse(savedAccounts);
  } catch (e) {
    console.error("Error loading saved accounts:", e);
  }
}

function updateStatus(message, className = "") {
  statusDiv.textContent = message;
  statusDiv.className = "alert text-center mb-4";

  // Map custom classes to Bootstrap alert classes
  switch (className) {
    case "ready":
      statusDiv.className += " alert-success";
      break;
    case "calling":
      statusDiv.className += " alert-warning";
      break;
    case "connected":
      statusDiv.className += " alert-info";
      break;
    case "error":
      statusDiv.className += " alert-danger";
      break;
    default:
      statusDiv.className += " alert-info";
  }
}

function addCallLog(
  method,
  targetPhone,
  status,
  timestamp,
  details = "",
  borrowerName = ""
) {
  const logDiv = document.createElement("div");
  logDiv.className = "card mb-2";

  const statusBadgeClass =
    status === "initiated"
      ? "bg-success"
      : status === "failed"
      ? "bg-danger"
      : "bg-secondary";

  logDiv.innerHTML = `
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center">
        <div class="flex-grow-1">
          <h6 class="card-title mb-1">${borrowerName || "Unknown"}</h6>
          <p class="card-text text-primary mb-1">${targetPhone}</p>
          <small class="text-muted">${timestamp}</small>
          ${
            details
              ? `<br><small class="text-muted fst-italic">${details}</small>`
              : ""
          }
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="badge ${statusBadgeClass}">${status.toUpperCase()}</span>
          <button class="btn btn-outline-primary btn-sm" onclick="redialNumber('${targetPhone}')">
            <i class="bi bi-telephone"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  const noCallsMsg = callLogsDiv.querySelector(".text-center");
  if (noCallsMsg && noCallsMsg.textContent.includes("No calls made yet")) {
    noCallsMsg.remove();
  }

  callLogsDiv.insertBefore(logDiv, callLogsDiv.firstChild);

  // Save to localStorage
  const callHistory = JSON.parse(localStorage.getItem("callHistory") || "[]");
  callHistory.unshift({
    method,
    targetPhone,
    status,
    timestamp,
    details,
    borrowerName,
  });
  localStorage.setItem("callHistory", JSON.stringify(callHistory.slice(0, 50)));
}

function redialNumber(phoneNumber) {
  targetPhoneInput.value = phoneNumber;
  // Switch to dialer tab
  const dialerTab = new bootstrap.Tab(document.getElementById("dialer-tab"));
  dialerTab.show();
}

// Initialize device and request mic
async function setupDeviceAndMic() {
  try {
    updateStatus("🎤 Requesting microphone access...", "calling");
    await navigator.mediaDevices.getUserMedia({ audio: true });

    updateStatus("🔧 Fetching token and initializing device...", "calling");
    const res = await fetch(`${baseUrl}/token`);
    const data = await res.json();

    device = new Twilio.Device(data.token, { debug: true });

    device.on("ready", () => {
      updateStatus("✅ Ready to make calls", "ready");
      deviceReady = true;
      browserCallBtn.disabled = false;
      document.getElementById("connectionStatus").className =
        "status-indicator text-success";
    });

    device.on("error", (err) => {
      updateStatus("❌ Device Error: " + err.message, "error");
      deviceReady = false;
      browserCallBtn.disabled = true;
      document.getElementById("connectionStatus").className =
        "status-indicator text-danger";
    });

    device.on("disconnect", () => {
      updateStatus("📴 Call ended", "ready");
      endCall();
    });
  } catch (err) {
    updateStatus("❌ Initialization failed: " + err.message, "error");
    browserCallBtn.disabled = true;
    document.getElementById("connectionStatus").className =
      "status-indicator text-danger";
  }
}

function startCall() {
  const targetPhone = targetPhoneInput.value.trim();

  if (!targetPhone) {
    showToast("Please enter a phone number to call.", "warning");
    targetPhoneInput.focus();
    return;
  }

  if (!deviceReady) {
    showToast("Device is not ready. Please wait.", "warning");
    return;
  }

  updateStatus("🌐 Connecting call...", "calling");

  // Find borrower info
  const account = loanAccounts.find(
    (acc) =>
      acc.phoneNumber === targetPhone || acc.alternatePhone === targetPhone
  );

  currentConnection = device.connect({ To: targetPhone });

  currentConnection.on("accept", () => {
    updateStatus("📞 Call connected!", "connected");
    browserCallBtn.style.display = "none";
    endCallBtn.style.display = "inline-block";

    // Show call modal
    showCallModal(targetPhone, account?.borrowerName || "Unknown");

    // Start call timer
    startCallTimer();

    // Add to call log
    addCallLog(
      "Outbound Call",
      targetPhone,
      "initiated",
      new Date().toLocaleString(),
      account ? `Account: ${account.accountNumber}` : "",
      account?.borrowerName || ""
    );

    // Update last contacted
    if (account) {
      account.lastContacted = new Date().toISOString().split("T")[0];
      saveAccounts();
      renderAccounts();
    }
  });

  currentConnection.on("disconnect", () => {
    endCall();
  });

  currentConnection.on("error", (err) => {
    updateStatus("❌ Call error: " + err.message, "error");
    endCall();
  });
}

function endCall() {
  if (currentConnection) {
    currentConnection.disconnect();
  }

  currentConnection = null;
  updateStatus("📴 Call ended", "ready");
  browserCallBtn.style.display = "inline-block";
  endCallBtn.style.display = "none";

  // Hide call modal
  callModal.hide();

  // Stop call timer
  stopCallTimer();

  // Reset mute/hold state
  isMuted = false;
  isOnHold = false;
  muteBtn.innerHTML = '<i class="bi bi-mic-mute me-2"></i>Mute';
  holdBtn.innerHTML = '<i class="bi bi-pause-circle me-2"></i>Hold';
}

function showCallModal(phoneNumber, borrowerName) {
  document.getElementById("callerName").textContent = borrowerName;
  document.getElementById("callerNumber").textContent = phoneNumber;
  callModal.show();
}

function startCallTimer() {
  callStartTime = Date.now();
  callTimer = setInterval(() => {
    const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    document.getElementById("callTimer").textContent = `${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }, 1000);
}

function stopCallTimer() {
  if (callTimer) {
    clearInterval(callTimer);
    callTimer = null;
  }
  document.getElementById("callTimer").textContent = "00:00";
}

function toggleMute() {
  if (!currentConnection) return;

  isMuted = !isMuted;
  currentConnection.mute(isMuted);
  muteBtn.innerHTML = isMuted
    ? '<i class="bi bi-mic me-2"></i>Unmute'
    : '<i class="bi bi-mic-mute me-2"></i>Mute';
}

function toggleHold() {
  if (!currentConnection) return;

  isOnHold = !isOnHold;

  if (isOnHold) {
    currentConnection.sendDigits("*8");
    holdBtn.innerHTML = '<i class="bi bi-play-circle me-2"></i>Resume';
  } else {
    currentConnection.sendDigits("*9");
    holdBtn.innerHTML = '<i class="bi bi-pause-circle me-2"></i>Hold';
  }
}

// Account management functions
function saveAccounts() {
  localStorage.setItem("loanAccounts", JSON.stringify(loanAccounts));
}

function renderAccounts() {
  const accountsList = document.getElementById("accountsList");
  const searchTerm =
    document.getElementById("searchAccounts")?.value.toLowerCase() || "";

  const filteredAccounts = loanAccounts.filter(
    (account) =>
      account.borrowerName.toLowerCase().includes(searchTerm) ||
      account.accountNumber.toLowerCase().includes(searchTerm) ||
      account.phoneNumber.includes(searchTerm)
  );

  if (filteredAccounts.length === 0) {
    accountsList.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="bi bi-person-x display-4 d-block mb-3"></i>
        <p class="mb-0">No accounts found</p>
      </div>
    `;
    return;
  }

  accountsList.innerHTML = filteredAccounts
    .map((account) => {
      const statusClass =
        {
          current: "success",
          overdue: "warning",
          default: "danger",
          settled: "info",
        }[account.status] || "secondary";

      const borderClass =
        {
          current: "border-success",
          overdue: "border-warning",
          default: "border-danger",
          settled: "border-info",
        }[account.status] || "border-secondary";

      return `
      <div class="card mb-3 ${borderClass} border-start border-4">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div>
              <h5 class="card-title mb-1">${account.borrowerName}</h5>
              <p class="text-muted mb-0">${account.accountNumber}</p>
            </div>
            <span class="badge bg-${statusClass}">${account.status.toUpperCase()}</span>
          </div>
          
          <div class="row g-2 mb-3">
            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center">
                <span class="fw-bold">Phone:</span>
                <div class="d-flex align-items-center gap-2">
                  <span>${account.phoneNumber}</span>
                  <button class="btn btn-success btn-sm" onclick="callAccount('${
                    account.phoneNumber
                  }', '${account.borrowerName}')">
                    <i class="bi bi-telephone"></i>
                  </button>
                </div>
              </div>
            </div>
            ${
              account.alternatePhone
                ? `
            <div class="col-md-6">
              <div class="d-flex justify-content-between align-items-center">
                <span class="fw-bold">Alt Phone:</span>
                <div class="d-flex align-items-center gap-2">
                  <span>${account.alternatePhone}</span>
                  <button class="btn btn-success btn-sm" onclick="callAccount('${account.alternatePhone}', '${account.borrowerName}')">
                    <i class="bi bi-telephone"></i>
                  </button>
                </div>
              </div>
            </div>
            `
                : ""
            }
          </div>

          <div class="row g-2 mb-2">
            <div class="col-md-6">
              <div class="d-flex justify-content-between">
                <span class="fw-bold">Outstanding:</span>
                <span class="text-danger fw-bold">$${account.outstandingBalance.toLocaleString()}</span>
              </div>
            </div>
            <div class="col-md-6">
              <div class="d-flex justify-content-between">
                <span class="fw-bold">Due Date:</span>
                <span>${account.dueDate || "N/A"}</span>
              </div>
            </div>
          </div>

          ${
            account.lastContacted
              ? `
          <div class="row g-2 mb-2">
            <div class="col-12">
              <div class="d-flex justify-content-between">
                <span class="fw-bold">Last Contact:</span>
                <span class="badge bg-info">${account.lastContacted}</span>
              </div>
            </div>
          </div>
          `
              : ""
          }

          ${
            account.notes
              ? `
          <div class="mt-3">
            <div class="alert alert-light mb-0">
              <strong>Notes:</strong> ${account.notes}
            </div>
          </div>
          `
              : ""
          }
        </div>
      </div>
    `;
    })
    .join("");

  updateAccountStats();
}

function updateAccountStats() {
  const total = loanAccounts.length;
  const overdue = loanAccounts.filter(
    (acc) => acc.status === "overdue" || acc.status === "default"
  ).length;
  const today = new Date().toISOString().split("T")[0];
  const contactedToday = loanAccounts.filter(
    (acc) => acc.lastContacted === today
  ).length;

  document.getElementById("totalAccounts").textContent = total;
  document.getElementById("overdueAccounts").textContent = overdue;
  document.getElementById("contactedToday").textContent = contactedToday;
}

function callAccount(phoneNumber, borrowerName) {
  targetPhoneInput.value = phoneNumber;
  // Switch to dialer tab
  const dialerTab = new bootstrap.Tab(document.getElementById("dialer-tab"));
  dialerTab.show();

  setTimeout(() => {
    if (deviceReady) {
      browserCallBtn.focus();
    }
  }, 100);
}

function showToast(message, type = "info") {
  // Create toast element
  const toastHtml = `
    <div class="toast align-items-center text-white bg-${type} border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `;

  // Add to toast container or create one
  let toastContainer = document.querySelector(".toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container position-fixed top-0 end-0 p-3";
    document.body.appendChild(toastContainer);
  }

  toastContainer.insertAdjacentHTML("beforeend", toastHtml);
  const toastElement = toastContainer.lastElementChild;
  const toast = new bootstrap.Toast(toastElement);
  toast.show();

  // Remove toast element after it's hidden
  toastElement.addEventListener("hidden.bs.toast", () => {
    toastElement.remove();
  });
}

function loadCallHistory() {
  const history = JSON.parse(localStorage.getItem("callHistory") || "[]");
  if (history.length > 0) {
    // Clear the "no calls" message
    callLogsDiv.innerHTML = "";
    history.forEach((call) => {
      addCallLog(
        call.method,
        call.targetPhone,
        call.status,
        call.timestamp,
        call.details,
        call.borrowerName
      );
    });
  }
}

// Event listeners
document.addEventListener("DOMContentLoaded", () => {
  setupDeviceAndMic();
  renderAccounts();
  loadCallHistory();

  // Dial pad
  document.querySelectorAll(".dial-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const digit = btn.dataset.digit;
      targetPhoneInput.value += digit;

      // Send DTMF if in call
      if (currentConnection) {
        currentConnection.sendDigits(digit);
      }
    });
  });

  // Call controls
  browserCallBtn.addEventListener("click", startCall);
  endCallBtn.addEventListener("click", endCall);
  modalEndCallBtn.addEventListener("click", endCall);
  muteBtn.addEventListener("click", toggleMute);
  holdBtn.addEventListener("click", toggleHold);

  // Add account form
  document.getElementById("addAccountForm").addEventListener("submit", (e) => {
    e.preventDefault();

    const newAccount = {
      id: Date.now().toString(),
      borrowerName: document.getElementById("borrowerName").value,
      accountNumber: document.getElementById("accountNumber").value,
      phoneNumber: document.getElementById("phoneNumber").value,
      alternatePhone: document.getElementById("alternatePhone").value,
      loanAmount: Number.parseFloat(
        document.getElementById("loanAmount").value
      ),
      outstandingBalance: Number.parseFloat(
        document.getElementById("outstandingBalance").value
      ),
      dueDate: document.getElementById("dueDate").value,
      status: document.getElementById("loanStatus").value,
      notes: document.getElementById("notes").value,
      lastContacted: null,
    };

    loanAccounts.unshift(newAccount);
    saveAccounts();
    renderAccounts();

    // Reset form and switch to accounts tab
    e.target.reset();
    const accountsTab = new bootstrap.Tab(
      document.getElementById("accounts-tab")
    );
    accountsTab.show();

    showToast("Account added successfully!", "success");
  });

  // Search functionality
  document
    .getElementById("searchAccounts")
    .addEventListener("input", renderAccounts);
  document
    .getElementById("searchBtn")
    .addEventListener("click", renderAccounts);

  // Clear history
  document.getElementById("clearHistoryBtn").addEventListener("click", () => {
    if (confirm("Are you sure you want to clear all call history?")) {
      localStorage.removeItem("callHistory");
      callLogsDiv.innerHTML = `
        <div class="text-center text-muted py-5">
          <i class="bi bi-telephone display-4 d-block mb-3"></i>
          <p class="mb-0">No calls made yet</p>
        </div>
      `;
    }
  });
});

// Initialize
browserCallBtn.disabled = true;
