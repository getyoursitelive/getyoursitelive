/**
 * Client Site — Data-Driven Inline Editor
 *
 * ZERO hardcoded selectors. The editor discovers editable elements via
 * data attributes set in app.js:
 *
 *   data-edit="json.path"        → click-to-edit text
 *   data-edit-image="json.path"  → upload/replace image overlay
 *   data-edit-list="json.path"   → add/remove controls on container
 *   data-visibility="key"        → section visibility toggle
 *
 * Adding a new editable element = add the attribute in app.js. Done.
 * No editor.js changes needed. Ever.
 */

// API_BASE is defined in config.js (loaded before this file)
let AUTH_TOKEN = null;
let SAVE_TIMEOUT = null;
let SAVE_STATE = "idle";

// ─── Auth ────────────────────────────────────────────────────────────

function getToken() { return AUTH_TOKEN || localStorage.getItem("site_token"); }
function setToken(t) { AUTH_TOKEN = t; localStorage.setItem("site_token", t); }
function clearToken() { AUTH_TOKEN = null; localStorage.removeItem("site_token"); }

async function checkAuth() {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/check`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    return data.authenticated === true;
  } catch { return false; }
}

// ─── Save ────────────────────────────────────────────────────────────

function scheduleSave() {
  if (SAVE_TIMEOUT) clearTimeout(SAVE_TIMEOUT);
  updateSaveIndicator("saving");
  SAVE_TIMEOUT = setTimeout(doSave, 800);
}

async function doSave() {
  try {
    const res = await fetch(`${API_BASE}/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(BUSINESS),
    });
    if (!res.ok) throw new Error("Save failed");
    updateSaveIndicator("saved");
  } catch (err) {
    console.error("Save error:", err);
    updateSaveIndicator("error");
  }
}

function updateSaveIndicator(state) {
  SAVE_STATE = state;
  const el = document.getElementById("saveIndicator");
  if (!el) return;
  el.className = `save-indicator ${state}`;
  el.textContent = state === "saving" ? "Saving..." : state === "saved" ? "Saved" : state === "error" ? "Error saving" : "";
  if (state === "saved") {
    setTimeout(() => { if (SAVE_STATE === "saved") el.classList.add("hidden"); }, 2000);
  }
}

// ─── Image Upload ────────────────────────────────────────────────────

async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Upload failed"); }
  const data = await res.json();
  if (data.url && data.url.startsWith("/api/")) {
    data.url = API_BASE.replace(/\/api$/, "") + data.url;
  }
  return data.url;
}

// ─── Refresh ─────────────────────────────────────────────────────────

function refresh() {
  renderSite();
  enterEditMode();
}

// ─── Enter Edit Mode ─────────────────────────────────────────────────

function enterEditMode() {
  const app = document.getElementById("app");
  app.classList.add("edit-mode");

  // Save indicator
  if (!document.getElementById("saveIndicator")) {
    const el = document.createElement("div");
    el.id = "saveIndicator";
    el.className = "save-indicator hidden";
    document.body.appendChild(el);
  }

  // Toolbar
  if (!app.querySelector(".edit-toolbar")) {
    const toolbar = document.createElement("div");
    toolbar.className = "edit-toolbar";
    toolbar.innerHTML = `
      <span class="edit-toolbar-title">Editing Mode</span>
      <div style="display:flex;gap:0.5rem">
        <a href="/mysite/" class="edit-toolbar-btn">Form Editor</a>
        <button class="edit-toolbar-btn exit" onclick="exitEditMode()">Exit</button>
      </div>`;
    app.insertBefore(toolbar, app.firstChild);
  }

  bindAllEditable();
  bindAllImages();
  bindAllLists();
  bindAllVisibility();

  // Re-bind when service tab switches (innerHTML replaces detail content)
  window.onServiceTabChange = () => {
    bindAllEditable(document.getElementById("serviceDetail"));
    bindAllLists(document.getElementById("serviceDetail"));
  };

  // Re-bind when testimonial carousel advances
  window.onTestimonialChange = () => {
    bindAllEditable(document.getElementById("testimonialCarousel"));
  };
}

function exitEditMode() { window.location.href = "/"; }

// ─── CORE: Bind all [data-edit] elements ─────────────────────────────

function bindAllEditable(scope) {
  const root = scope || document;
  root.querySelectorAll("[data-edit]").forEach(el => {
    // Skip if already bound
    if (el.hasAttribute("contenteditable")) return;

    const path = el.dataset.edit;
    el.setAttribute("contenteditable", "true");
    el.setAttribute("spellcheck", "false");

    el.addEventListener("blur", () => {
      const value = el.textContent.trim();
      setNestedValue(BUSINESS, path, value);
      scheduleSave();
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); el.blur(); }
      if (e.key === "Escape") { el.textContent = getNestedValue(BUSINESS, path) || ""; el.blur(); }
    });
  });
}

// ─── CORE: Bind all [data-edit-image] elements ───────────────────────

function bindAllImages(scope) {
  const root = scope || document;
  root.querySelectorAll("[data-edit-image]").forEach(wrap => {
    if (wrap.querySelector(".image-upload-overlay")) return;

    const path = wrap.dataset.editImage;
    wrap.style.position = "relative";
    wrap.classList.add("image-upload-wrap");

    const overlay = document.createElement("div");
    overlay.className = "image-upload-overlay";
    const btn = document.createElement("button");
    btn.className = "image-upload-btn";
    btn.textContent = "Upload / Replace";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.addEventListener("change", async () => {
        if (!input.files[0]) return;
        try {
          updateSaveIndicator("saving");
          const url = await uploadImage(input.files[0]);
          setNestedValue(BUSINESS, path, url);
          // Update image in place
          const img = wrap.querySelector("img") || wrap.tagName === "IMG" ? wrap : null;
          if (wrap.tagName === "IMG") {
            wrap.src = url;
          } else {
            const imgEl = wrap.querySelector("img");
            if (imgEl) { imgEl.src = url; }
            else {
              const newImg = document.createElement("img");
              newImg.src = url;
              wrap.insertBefore(newImg, overlay);
            }
          }
          scheduleSave();
        } catch (err) {
          alert("Upload failed: " + err.message);
          updateSaveIndicator("error");
        }
      });
      input.click();
    });
    overlay.appendChild(btn);
    wrap.appendChild(overlay);
  });
}

// ─── CORE: Bind all [data-edit-list] containers ──────────────────────

function bindAllLists(scope) {
  const root = scope || document;
  root.querySelectorAll("[data-edit-list]").forEach(container => {
    // Check if already bound — the Add button is a sibling, not a child
    if (container.dataset.listBound) return;
    container.dataset.listBound = "true";

    const path = container.dataset.editList;
    const templateStr = container.dataset.listTemplate || "";
    const items = getNestedValue(BUSINESS, path);
    if (!items || !Array.isArray(items)) return;

    // Remove buttons on each direct child (card or li)
    const children = container.querySelectorAll(":scope > div, :scope > li, :scope > button[data-service]");
    children.forEach((child, i) => {
      if (child.querySelector(".card-remove-btn, .list-remove-btn")) return;
      const isLi = child.tagName === "LI";
      const removeBtn = document.createElement("button");
      removeBtn.className = isLi ? "list-remove-btn" : "card-remove-btn";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        items.splice(i, 1);
        scheduleSave();
        refresh();
      });
      if (isLi) {
        child.style.display = "flex";
        child.style.alignItems = "center";
        child.style.justifyContent = "space-between";
      } else {
        child.style.position = "relative";
      }
      child.appendChild(removeBtn);
    });

    // Add button — only create if not already present as next sibling
    const existingAdd = container.nextElementSibling;
    if (existingAdd && existingAdd.classList.contains("add-item-btn")) return;

    const addBtn = document.createElement("button");
    addBtn.className = "add-item-btn";
    addBtn.textContent = "+ Add";
    addBtn.addEventListener("click", () => {
      let newItem;
      try { newItem = JSON.parse(templateStr); } catch { newItem = templateStr || "New item"; }
      // For objects, give unique IDs
      if (typeof newItem === "object" && newItem.id !== undefined) {
        newItem.id = path.split(".").pop() + "-" + Date.now();
      }
      items.push(newItem);
      scheduleSave();
      refresh();
    });
    // Insert after the container
    if (container.parentNode) {
      container.parentNode.insertBefore(addBtn, container.nextSibling);
    }
  });
}

// ─── CORE: Bind all [data-visibility] sections ──────────────────────

function bindAllVisibility(scope) {
  const root = scope || document;
  root.querySelectorAll("[data-visibility]").forEach(section => {
    if (section.querySelector(".section-toggle")) return;

    const key = section.dataset.visibility;
    section.classList.add("section-wrapper");
    section.style.position = "relative";

    const visible = BUSINESS.visibility?.[key] !== false;

    const toggle = document.createElement("button");
    toggle.className = `section-toggle ${visible ? "visible" : "hidden-section"}`;
    toggle.textContent = visible ? "Visible" : "Hidden";
    toggle.addEventListener("click", () => {
      if (!BUSINESS.visibility) BUSINESS.visibility = {};
      BUSINESS.visibility[key] = !(BUSINESS.visibility[key] ?? true);
      const isNow = BUSINESS.visibility[key] !== false;
      toggle.className = `section-toggle ${isNow ? "visible" : "hidden-section"}`;
      toggle.textContent = isNow ? "Visible" : "Hidden";
      section.classList.toggle("section-hidden", !isNow);
      scheduleSave();
    });
    section.appendChild(toggle);
    if (!visible) section.classList.add("section-hidden");
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────

function getNestedValue(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => {
    if (!o[k]) o[k] = {};
    return o[k];
  }, obj);
  target[last] = value;
}

// ─── Init ────────────────────────────────────────────────────────────

async function initEditor() {
  const authenticated = await checkAuth();
  if (!authenticated) { window.location.href = "/mysite/login.html"; return; }

  try {
    const res = await fetch(`${API_BASE}/content`);
    if (!res.ok) throw new Error("Failed to load");
    BUSINESS = await res.json();
    THEME = BUSINESS.theme || "modern";
  } catch {
    document.getElementById("app").innerHTML = "<p>Failed to load content.</p>";
    return;
  }

  renderSite();
  enterEditMode();
}

window.initEditor = initEditor;
window.exitEditMode = exitEditMode;
