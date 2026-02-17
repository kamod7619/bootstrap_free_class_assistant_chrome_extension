var selectedElement = null;
let originalClass = "";
let bootstrapData = {};
let selectionActive = false;

let undoStack = [];
let redoStack = [];

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "startSelection") {
    enableSelectionMode();
  }
});
function detectBootstrapVersion() {

  // -----------------------------
  // 1️⃣ Bootstrap 5 (no jQuery)
  // -----------------------------
  if (window.bootstrap?.Tooltip?.VERSION) {
    return window.bootstrap.Tooltip.VERSION.charAt(0); // "5"
  }

  // -----------------------------
  // 2️⃣ Bootstrap 4 or 3 (jQuery based)
  // -----------------------------
  if (window.jQuery?.fn?.tooltip?.Constructor?.VERSION) {
    const version = window.jQuery.fn.tooltip.Constructor.VERSION;
    return version.charAt(0); // "4" or "3"
  }

  // -----------------------------
  // 3️⃣ Data attribute detection
  // -----------------------------
  if (document.querySelector("[data-bs-toggle]")) return "5";
  if (document.querySelector("[data-toggle]")) {
    // Could be 3 or 4 → detect by class differences
    if (document.querySelector(".ml-1, .mr-1")) return "4";
    return "3";
  }

  // -----------------------------
  // 4️⃣ CSS link detection
  // -----------------------------
  const links = [...document.querySelectorAll('link[href*="bootstrap"]')];
  for (let link of links) {
    const href = link.href;

    if (href.includes("/5.") || href.includes("bootstrap@5")) return "5";
    if (href.includes("/4.") || href.includes("bootstrap@4")) return "4";
    if (href.includes("/3.") || href.includes("bootstrap@3")) return "3";
  }

  // -----------------------------
  // 5️⃣ Class-based detection
  // -----------------------------
  if (document.querySelector(".col-xs-1, .col-xs-2")) return "3";
  if (document.querySelector(".ml-1, .mr-1")) return "4";
  if (document.querySelector(".ms-1, .me-1")) return "5";

  if (document.querySelector(".panel, .btn-default")) return "3";

  return null;
}

async function loadBootstrapData() {
  const version = detectBootstrapVersion();

  let file = "data/bootstrap-v5.json"; // default fallback

  if (version === "3") {
    file = "data/bootstrap-v3.json";
  } else if (version === "4") {
    file = "data/bootstrap-v4.json";
  } else if (version === "5") {
    file = "data/bootstrap-v5.json";
  } else {
    console.warn("Bootstrap not detected. Defaulting to v5.");
  }

  try {
    const url = chrome.runtime.getURL(file);
    const res = await fetch(url);
    bootstrapData = await res.json();

    console.log("Detected Bootstrap:", version || "unknown");
    console.log("Loaded:", file);
  } catch (err) {
    console.error("Failed to load Bootstrap JSON:", err);
  }
}

loadBootstrapData();

function enableSelectionMode() {
  selectionActive = true;
  document.body.style.cursor = "crosshair";
  document.addEventListener("click", selectElement, true);
}

function disableSelectionMode() {
  selectionActive = false;
  document.body.style.cursor = "default";
  document.removeEventListener("click", selectElement, true);
}

function closeAssistant(reset = true) {
  const panel = document.getElementById("__bs_panel");
  if (panel) panel.remove();

  if (reset && selectedElement) {
    selectedElement.className = originalClass;
  }

  undoStack = [];
  redoStack = [];
  selectedElement = null;

  document.removeEventListener("keydown", escClose);
}

function selectElement(e) {
  if (!selectionActive) return;

  e.preventDefault();
  e.stopPropagation();

  selectedElement = e.target;
  originalClass = selectedElement.className;

  undoStack = [];
  redoStack = [];

  disableSelectionMode();
  showPanel();
}

function showPanel() {
  const old = document.getElementById("__bs_panel");
  if (old) old.remove();

  let panel = document.createElement("div");
  panel.id = "__bs_panel";

  panel.innerHTML = `
    <div id="panelHeader" style="display:flex;justify-content:space-between;cursor:move;">
      <strong>Bootstrap Free Class Assistant</strong>
      <button id="closePanel" style="width: 10%;">✖</button>
    </div>

    <h4>Applied Classes</h4>
    <div id="appliedClasses" style="margin-bottom:10px;"></div>

    <select id="categorySelect"></select>
    <input type="text" id="searchInput" placeholder="Search class..." />
    <div id="classList"></div>

    <div style="display:flex;gap:5px;margin-top:10px;">
      <button id="undoBtn">Undo</button>
      <button id="redoBtn">Redo</button>
      <button id="revertBtn">Reset</button>
    </div>
  `;

  document.body.appendChild(panel);
  makeDraggable(panel);

  document.getElementById("closePanel").onclick = () => closeAssistant(true);
  document.addEventListener("keydown", escClose);

  const categorySelect = document.getElementById("categorySelect");
  const searchInput = document.getElementById("searchInput");
  const classListDiv = document.getElementById("classList");
  const appliedDiv = document.getElementById("appliedClasses");

  Object.keys(bootstrapData).forEach(cat => {
    let opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  function renderApplied() {
    appliedDiv.innerHTML = "";

    [...selectedElement.classList].forEach(cls => {
      let chip = document.createElement("span");
      chip.textContent = cls + " ✖";
      chip.style.display = "inline-block";
      chip.style.margin = "3px";
      chip.style.padding = "4px 6px";
      chip.style.background = "#007bff";
      chip.style.cursor = "pointer";

      chip.onclick = () => {
        saveState();
        selectedElement.classList.remove(cls);
        renderApplied();
        renderList();
      };

      appliedDiv.appendChild(chip);
    });
  }

  function renderList() {
    let category = categorySelect.value;
    let filter = searchInput.value.toLowerCase();
    classListDiv.innerHTML = "";

    bootstrapData[category]
      .filter(cls => cls.toLowerCase().includes(filter))
      .forEach(cls => {
        let btn = document.createElement("button");
        btn.textContent = cls;

        if (selectedElement.classList.contains(cls)) {
          btn.style.background = "#28a745";
        }

        btn.onclick = () => {
          saveState();
          selectedElement.classList.toggle(cls);
          renderApplied();
          renderList();
        };

        classListDiv.appendChild(btn);
      });
  }

  document.getElementById("undoBtn").onclick = () => {
    undo();
    renderApplied();
    renderList();
  };

  document.getElementById("redoBtn").onclick = () => {
    redo();
    renderApplied();
    renderList();
  };

  document.getElementById("revertBtn").onclick = () => {
    saveState();
    selectedElement.className = originalClass;
    renderApplied();
    renderList();
  };

  categorySelect.onchange = renderList;
  searchInput.oninput = renderList;

  renderApplied();
  renderList();
}


function toggleClass(cls) {
  saveState();

  if (selectedElement.classList.contains(cls)) {
    selectedElement.classList.remove(cls);
  } else {
    selectedElement.classList.add(cls);
  }

  redoStack = [];
}

function saveState() {
  undoStack.push(selectedElement.className);
}

function undo() {
  if (undoStack.length === 0) return;

  redoStack.push(selectedElement.className);
  selectedElement.className = undoStack.pop();
}

function redo() {
  if (redoStack.length === 0) return;

  undoStack.push(selectedElement.className);
  selectedElement.className = redoStack.pop();
}

function escClose(e) {
  if (e.key === "Escape") {
    const panel = document.getElementById("__bs_panel");
    if (panel) panel.remove();
    document.removeEventListener("keydown", escClose);
  }
}

function makeDraggable(panel) {
  const header = panel.querySelector("#panelHeader");

  let offsetX = 0, offsetY = 0, isDragging = false;

  header.addEventListener("mousedown", (e) => {
    isDragging = true;
    offsetX = e.clientX - panel.offsetLeft;
    offsetY = e.clientY - panel.offsetTop;
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    panel.style.left = (e.clientX - offsetX) + "px";
    panel.style.top = (e.clientY - offsetY) + "px";
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
  });

  panel.style.position = "fixed";
  panel.style.top = "100px";
  panel.style.right = "20px";
}

