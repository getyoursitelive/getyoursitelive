/**
 * Client Site — Form Admin
 *
 * 12-tab form editor, same layout as the main platform.
 * Loads content from Worker API, edits in memory, saves on click.
 */

// API_BASE is defined in config.js (loaded before this file)
let AUTH_TOKEN = null;
let BUSINESS = null;
let CURRENT_TAB = "identity";

function getToken() { return AUTH_TOKEN || localStorage.getItem("site_token"); }
function setToken(t) { AUTH_TOKEN = t; localStorage.setItem("site_token", t); }

const TABS = [
  { id: "identity", label: "Identity" },
  { id: "hero", label: "Hero" },
  { id: "about", label: "About" },
  { id: "stats", label: "Stats" },
  { id: "services", label: "Services" },
  { id: "deals", label: "Deals" },
  { id: "pricing", label: "Pricing" },
  { id: "team", label: "Team" },
  { id: "testimonials", label: "Testimonials" },
  { id: "faq", label: "FAQ" },
  { id: "contact", label: "Contact & Hours" },
  { id: "visibility", label: "Visibility" },
];

// ─── Init ────────────────────────────────────────────────────────────

async function initAdmin() {
  const token = getToken();
  if (!token) { window.location.href = "/mysite/login.html"; return; }

  try {
    const check = await fetch(`${API_BASE}/auth/check`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await check.json();
    if (!d.authenticated) { window.location.href = "/mysite/login.html"; return; }
  } catch { window.location.href = "/mysite/login.html"; return; }

  try {
    const res = await fetch(`${API_BASE}/content`);
    BUSINESS = await res.json();
  } catch {
    document.getElementById("adminRoot").innerHTML = "<p>Failed to load content.</p>";
    return;
  }

  renderAdmin();
}

// ─── Render Admin Shell ──────────────────────────────────────────────

function renderAdmin() {
  const root = document.getElementById("adminRoot");
  root.innerHTML = `
    <div class="admin-shell" data-theme="${BUSINESS.theme || 'modern'}">
      <header class="admin-header">
        <div class="admin-header-inner">
          <span class="admin-brand">${esc(BUSINESS.businessInfo?.name || "Site Admin")}</span>
          <div class="admin-header-actions">
            <a href="/mysite/edit.html" class="admin-btn">Inline Editor</a>
            <a href="/" class="admin-btn" target="_blank">View Site</a>
            <button class="admin-btn admin-btn-danger" onclick="logout()">Sign Out</button>
          </div>
        </div>
      </header>
      <div class="admin-layout">
        <nav class="admin-tabs" id="adminTabs">
          ${TABS.map(t => `<button class="admin-tab${t.id === CURRENT_TAB ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`).join("")}
        </nav>
        <main class="admin-content" id="tabContent"></main>
      </div>
      <div class="admin-footer">
        <button class="btn-primary" id="saveBtn" onclick="saveChanges()">Save Changes</button>
        <span id="saveStatus"></span>
      </div>
    </div>`;

  // Tab switching
  document.getElementById("adminTabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (!btn) return;
    CURRENT_TAB = btn.dataset.tab;
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === CURRENT_TAB));
    renderTab();
  });

  renderTab();
}

// ─── Tab Renderers ───────────────────────────────────────────────────

function renderTab() {
  const content = document.getElementById("tabContent");
  switch (CURRENT_TAB) {
    case "identity": content.innerHTML = renderIdentityTab(); break;
    case "hero": content.innerHTML = renderHeroTab(); break;
    case "about": content.innerHTML = renderAboutTab(); break;
    case "stats": content.innerHTML = renderStatsTab(); break;
    case "services": content.innerHTML = renderServicesTab(); break;
    case "deals": content.innerHTML = renderDealsTab(); break;
    case "pricing": content.innerHTML = renderPricingTab(); break;
    case "team": content.innerHTML = renderTeamTab(); break;
    case "testimonials": content.innerHTML = renderTestimonialsTab(); break;
    case "faq": content.innerHTML = renderFaqTab(); break;
    case "contact": content.innerHTML = renderContactTab(); break;
    case "visibility": content.innerHTML = renderVisibilityTab(); break;
  }
  attachTabHandlers();
}

function field(label, path, type = "text", placeholder = "") {
  const val = getNestedValue(BUSINESS, path) || "";
  if (type === "textarea") {
    return `<div class="admin-field"><label>${label}</label><textarea data-path="${path}" placeholder="${placeholder}" rows="4">${esc(val)}</textarea></div>`;
  }
  return `<div class="admin-field"><label>${label}</label><input type="${type}" data-path="${path}" value="${esc(val)}" placeholder="${placeholder}"></div>`;
}

function renderIdentityTab() {
  return `
    <h2>Business Identity</h2>
    ${field("Business Name", "businessInfo.name")}
    ${field("Tagline", "businessInfo.tagline")}
    ${field("Phone", "businessInfo.phone", "tel")}
    ${field("Email", "businessInfo.email", "email")}
    ${field("Address", "businessInfo.address")}
    ${field("Founded Year", "businessInfo.founded", "number")}
    ${field("Emergency Phone", "businessInfo.emergencyPhone", "tel")}
    <div class="admin-field">
      <label>Theme</label>
      <select data-path="theme">
        ${["modern","industrial","luxury","friendly"].map(t => `<option value="${t}"${BUSINESS.theme === t ? " selected" : ""}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`).join("")}
      </select>
    </div>`;
}

function renderHeroTab() {
  const h = BUSINESS.hero || {};
  return `
    <h2>Hero Section</h2>
    ${field("Eyebrow Text", "hero.eyebrowPrefix")}
    ${field("Headline", "hero.headline")}
    ${field("Lead Paragraph", "hero.lead", "textarea")}
    ${field("Primary CTA", "hero.primaryCta")}
    ${field("Secondary CTA", "hero.secondaryCta")}
    ${field("Why-Us Card Title", "hero.whyTitle")}
    <div class="admin-field">
      <label>Why-Us Bullets</label>
      <div id="heroBullets">
        ${(h.whyBullets || []).map((b, i) => `
          <div class="admin-list-item">
            <input type="text" data-list="hero.whyBullets" data-idx="${i}" value="${esc(b)}">
            <button class="admin-btn-sm" onclick="removeListItem('hero.whyBullets',${i})">×</button>
          </div>`).join("")}
      </div>
      <button class="admin-btn-add" onclick="addListItem('hero.whyBullets','New bullet')">+ Add Bullet</button>
    </div>`;
}

function renderAboutTab() {
  const a = BUSINESS.about || {};
  return `
    <h2>About Section</h2>
    ${field("Heading", "about.heading")}
    ${field("Narrative", "about.narrative", "textarea")}
    <div class="admin-field">
      <label>Bullets</label>
      <div id="aboutBullets">
        ${(a.bullets || []).map((b, i) => `
          <div class="admin-list-item">
            <input type="text" data-list="about.bullets" data-idx="${i}" value="${esc(b)}">
            <button class="admin-btn-sm" onclick="removeListItem('about.bullets',${i})">×</button>
          </div>`).join("")}
      </div>
      <button class="admin-btn-add" onclick="addListItem('about.bullets','New bullet')">+ Add Bullet</button>
    </div>
    <div class="admin-field">
      <label>Why-Us Cards</label>
      <div id="aboutCards">
        ${(a.whyUsCards || []).map((c, i) => `
          <div class="admin-card-item">
            <input type="text" data-card="about.whyUsCards" data-idx="${i}" data-field="title" value="${esc(c.title)}" placeholder="Title">
            <input type="text" data-card="about.whyUsCards" data-idx="${i}" data-field="description" value="${esc(c.description)}" placeholder="Description">
            <button class="admin-btn-sm" onclick="removeListItem('about.whyUsCards',${i})">×</button>
          </div>`).join("")}
      </div>
      <button class="admin-btn-add" onclick="addCardItem('about.whyUsCards')">+ Add Card</button>
    </div>`;
}

function renderStatsTab() {
  const stats = BUSINESS.stats || [];
  return `
    <h2>Stats</h2>
    <div id="statsItems">
      ${stats.map((s, i) => `
        <div class="admin-stat-item">
          <input type="text" data-stat="${i}" data-field="label" value="${esc(s.label)}" placeholder="Label">
          <input type="number" data-stat="${i}" data-field="value" value="${s.value}" placeholder="Value">
          <input type="text" data-stat="${i}" data-field="suffix" value="${esc(s.suffix)}" placeholder="Suffix">
          <button class="admin-btn-sm" onclick="removeStat(${i})">×</button>
        </div>`).join("")}
    </div>
    <button class="admin-btn-add" onclick="addStat()">+ Add Stat</button>`;
}

function renderServicesTab() {
  const services = BUSINESS.services || [];
  return `
    <h2>Services</h2>
    <div id="servicesItems">
      ${services.map((s, i) => `
        <div class="admin-service-item" data-svc="${i}">
          <div class="admin-service-header">
            <strong>${esc(s.name)}</strong>
            <button class="admin-btn-sm" onclick="removeService(${i})">×</button>
          </div>
          <input type="text" data-svc-field="${i}" data-key="name" value="${esc(s.name)}" placeholder="Name">
          <input type="text" data-svc-field="${i}" data-key="priceRange" value="${esc(s.priceRange)}" placeholder="Price Range">
          <input type="text" data-svc-field="${i}" data-key="duration" value="${esc(s.duration)}" placeholder="Duration">
          <textarea data-svc-field="${i}" data-key="description" placeholder="Description" rows="2">${esc(s.description)}</textarea>
          <div class="admin-field"><label>Features</label>
            ${(s.features || []).map((f, fi) => `
              <div class="admin-list-item">
                <input type="text" data-svc-feature="${i}" data-fidx="${fi}" value="${esc(f)}">
                <button class="admin-btn-sm" onclick="removeSvcFeature(${i},${fi})">×</button>
              </div>`).join("")}
            <button class="admin-btn-add" onclick="addSvcFeature(${i})">+ Add Feature</button>
          </div>
        </div>`).join("")}
    </div>
    <button class="admin-btn-add" onclick="addService()">+ Add Service</button>`;
}

function renderDealsTab() {
  const deals = BUSINESS.deals || [];
  return `
    <h2>Deals</h2>
    ${field("Eyebrow", "sectionTitles.dealsEyebrow")}
    ${field("Title", "sectionTitles.deals")}
    ${field("Description", "sectionTitles.dealsLede", "textarea")}
    <div id="dealsItems">
      ${deals.map((d, i) => `
        <div class="admin-deal-item">
          <input type="text" data-deal="${i}" data-key="title" value="${esc(d.title)}" placeholder="Title">
          <input type="text" data-deal="${i}" data-key="description" value="${esc(d.description)}" placeholder="Description">
          <input type="text" data-deal="${i}" data-key="price" value="${esc(d.price)}" placeholder="Price">
          <input type="text" data-deal="${i}" data-key="originalPrice" value="${esc(d.originalPrice || '')}" placeholder="Original Price">
          <input type="text" data-deal="${i}" data-key="badge" value="${esc(d.badge || '')}" placeholder="Badge">
          <button class="admin-btn-sm" onclick="removeDeal(${i})">×</button>
        </div>`).join("")}
    </div>
    <button class="admin-btn-add" onclick="addDeal()">+ Add Deal</button>`;
}

function renderPricingTab() {
  const pricing = BUSINESS.pricing || [];
  return `
    <h2>Pricing</h2>
    ${field("Section Title", "sectionTitles.pricing")}
    <div id="pricingItems">
      ${pricing.map((p, i) => `
        <div class="admin-pricing-item">
          <input type="text" data-pricing="${i}" data-key="name" value="${esc(p.name)}" placeholder="Name">
          <input type="text" data-pricing="${i}" data-key="price" value="${esc(p.price)}" placeholder="Price">
          <input type="text" data-pricing="${i}" data-key="note" value="${esc(p.note)}" placeholder="Note">
          <label><input type="checkbox" data-pricing-pop="${i}" ${p.popular ? "checked" : ""}> Popular</label>
          <button class="admin-btn-sm" onclick="removePricing(${i})">×</button>
        </div>`).join("")}
    </div>
    <button class="admin-btn-add" onclick="addPricing()">+ Add Pricing Card</button>`;
}

function renderTeamTab() {
  const team = BUSINESS.team || [];
  return `
    <h2>Team</h2>
    ${field("Section Title", "sectionTitles.team")}
    <div id="teamItems">
      ${team.map((m, i) => `
        <div class="admin-team-item">
          <input type="text" data-team="${i}" data-key="name" value="${esc(m.name)}" placeholder="Name">
          <input type="text" data-team="${i}" data-key="role" value="${esc(m.role)}" placeholder="Role">
          <input type="text" data-team="${i}" data-key="experience" value="${esc(m.experience)}" placeholder="Experience">
          <input type="text" data-team="${i}" data-key="specialty" value="${esc(m.specialty)}" placeholder="Specialty">
          <button class="admin-btn-sm" onclick="removeTeam(${i})">×</button>
        </div>`).join("")}
    </div>
    <button class="admin-btn-add" onclick="addTeam()">+ Add Team Member</button>`;
}

function renderTestimonialsTab() {
  const t = BUSINESS.testimonials || [];
  return `
    <h2>Testimonials</h2>
    ${field("Section Title", "sectionTitles.testimonials")}
    <div id="testimonialItems">
      ${t.map((r, i) => `
        <div class="admin-testimonial-item">
          <input type="text" data-test="${i}" data-key="name" value="${esc(r.name)}" placeholder="Name">
          <input type="text" data-test="${i}" data-key="context" value="${esc(r.context)}" placeholder="Context (e.g. vehicle, service)">
          <textarea data-test="${i}" data-key="quote" rows="2" placeholder="Quote">${esc(r.quote)}</textarea>
          <button class="admin-btn-sm" onclick="removeTestimonial(${i})">×</button>
        </div>`).join("")}
    </div>
    <button class="admin-btn-add" onclick="addTestimonial()">+ Add Testimonial</button>`;
}

function renderFaqTab() {
  const faqs = BUSINESS.faqs || [];
  return `
    <h2>FAQ</h2>
    ${field("Section Title", "sectionTitles.faq")}
    <div id="faqItems">
      ${faqs.map((f, i) => `
        <div class="admin-faq-item">
          <input type="text" data-faq="${i}" data-key="question" value="${esc(f.question)}" placeholder="Question">
          <textarea data-faq="${i}" data-key="answer" rows="2" placeholder="Answer">${esc(f.answer)}</textarea>
          <button class="admin-btn-sm" onclick="removeFaq(${i})">×</button>
        </div>`).join("")}
    </div>
    <button class="admin-btn-add" onclick="addFaq()">+ Add FAQ</button>`;
}

function renderContactTab() {
  return `
    <h2>Contact & Hours</h2>
    ${field("Heading", "contact.heading")}
    ${field("Description", "contact.description", "textarea")}
    ${field("Submit Button Label", "contact.bookButtonLabel")}
    ${field("Footer Location Label", "footer.locationLabel")}
    ${field("Footer Phone Label", "footer.phoneLabel")}
    ${field("Copyright Suffix", "footer.copyrightSuffix")}`;
}

function renderVisibilityTab() {
  const v = BUSINESS.visibility || {};
  const toggles = [
    ["showHeroEyebrow", "Hero Eyebrow"],
    ["showHeroHeadline", "Hero Headline"],
    ["showHeroLead", "Hero Lead Text"],
    ["showHeroCtas", "Hero Buttons"],
    ["showHeroCard", "Hero Why-Us Card"],
    ["showHeroImage", "Hero Image"],
    ["showAbout", "About Story"],
    ["showAboutWhyUs", "About Why-Us Cards"],
    ["showStats", "Stats"],
    ["showServices", "Services"],
    ["showDeals", "Deals"],
    ["showPricing", "Pricing"],
    ["showTeam", "Team"],
    ["showTestimonials", "Testimonials"],
    ["showFaq", "FAQ"],
    ["showEmergencyBanner", "Emergency Banner"],
    ["showBooking", "Booking Form"],
    ["showContactInfo", "Contact Info"],
    ["showHours", "Hours"],
    ["showMap", "Map"],
  ];

  return `
    <h2>Section Visibility</h2>
    <p style="color:var(--text-secondary);margin-bottom:1rem">Toggle which sections are visible to visitors.</p>
    <div class="admin-toggles">
      ${toggles.map(([key, label]) => `
        <label class="admin-toggle">
          <input type="checkbox" data-visibility="${key}" ${v[key] !== false ? "checked" : ""}>
          <span>${label}</span>
        </label>`).join("")}
    </div>`;
}

// ─── Handlers ────────────────────────────────────────────────────────

function attachTabHandlers() {
  // Simple field inputs
  document.querySelectorAll("[data-path]").forEach(el => {
    el.addEventListener("input", () => {
      setNestedValue(BUSINESS, el.dataset.path, el.tagName === "SELECT" ? el.value : el.value);
    });
  });

  // List items
  document.querySelectorAll("[data-list]").forEach(el => {
    el.addEventListener("input", () => {
      const arr = getNestedValue(BUSINESS, el.dataset.list);
      if (arr) arr[parseInt(el.dataset.idx)] = el.value;
    });
  });

  // Card items (about why-us)
  document.querySelectorAll("[data-card]").forEach(el => {
    el.addEventListener("input", () => {
      const arr = getNestedValue(BUSINESS, el.dataset.card);
      if (arr && arr[el.dataset.idx]) arr[el.dataset.idx][el.dataset.field] = el.value;
    });
  });

  // Stats
  document.querySelectorAll("[data-stat]").forEach(el => {
    el.addEventListener("input", () => {
      const i = parseInt(el.dataset.stat);
      if (BUSINESS.stats[i]) {
        const val = el.dataset.field === "value" ? parseInt(el.value) || 0 : el.value;
        BUSINESS.stats[i][el.dataset.field] = val;
      }
    });
  });

  // Services
  document.querySelectorAll("[data-svc-field]").forEach(el => {
    el.addEventListener("input", () => {
      const i = parseInt(el.dataset.svcField);
      if (BUSINESS.services[i]) BUSINESS.services[i][el.dataset.key] = el.value;
    });
  });
  document.querySelectorAll("[data-svc-feature]").forEach(el => {
    el.addEventListener("input", () => {
      const si = parseInt(el.dataset.svcFeature);
      const fi = parseInt(el.dataset.fidx);
      if (BUSINESS.services[si]?.features) BUSINESS.services[si].features[fi] = el.value;
    });
  });

  // Deals
  document.querySelectorAll("[data-deal]").forEach(el => {
    el.addEventListener("input", () => {
      const i = parseInt(el.dataset.deal);
      if (BUSINESS.deals[i]) BUSINESS.deals[i][el.dataset.key] = el.value;
    });
  });

  // Pricing
  document.querySelectorAll("[data-pricing]").forEach(el => {
    el.addEventListener("input", () => {
      const i = parseInt(el.dataset.pricing);
      if (BUSINESS.pricing[i]) BUSINESS.pricing[i][el.dataset.key] = el.value;
    });
  });
  document.querySelectorAll("[data-pricing-pop]").forEach(el => {
    el.addEventListener("change", () => {
      const i = parseInt(el.dataset.pricingPop);
      if (BUSINESS.pricing[i]) BUSINESS.pricing[i].popular = el.checked;
    });
  });

  // Team
  document.querySelectorAll("[data-team]").forEach(el => {
    el.addEventListener("input", () => {
      const i = parseInt(el.dataset.team);
      if (BUSINESS.team[i]) BUSINESS.team[i][el.dataset.key] = el.value;
    });
  });

  // Testimonials
  document.querySelectorAll("[data-test]").forEach(el => {
    el.addEventListener("input", () => {
      const i = parseInt(el.dataset.test);
      if (BUSINESS.testimonials[i]) BUSINESS.testimonials[i][el.dataset.key] = el.value;
    });
  });

  // FAQ
  document.querySelectorAll("[data-faq]").forEach(el => {
    el.addEventListener("input", () => {
      const i = parseInt(el.dataset.faq);
      if (BUSINESS.faqs[i]) BUSINESS.faqs[i][el.dataset.key] = el.value;
    });
  });

  // Visibility
  document.querySelectorAll("[data-visibility]").forEach(el => {
    el.addEventListener("change", () => {
      if (!BUSINESS.visibility) BUSINESS.visibility = {};
      BUSINESS.visibility[el.dataset.visibility] = el.checked;
    });
  });
}

// ─── List Mutation Helpers ────────────────────────────────────────────

window.removeListItem = (path, idx) => { getNestedValue(BUSINESS, path).splice(idx, 1); renderTab(); };
window.addListItem = (path, val) => {
  const arr = getNestedValue(BUSINESS, path);
  if (!arr) setNestedValue(BUSINESS, path, [val]);
  else arr.push(val);
  renderTab();
};
window.addCardItem = (path) => {
  const arr = getNestedValue(BUSINESS, path);
  arr.push({ title: "Title", description: "Description" });
  renderTab();
};

window.addStat = () => { (BUSINESS.stats = BUSINESS.stats || []).push({ label: "New Stat", value: 0, suffix: "+" }); renderTab(); };
window.removeStat = (i) => { BUSINESS.stats.splice(i, 1); renderTab(); };

window.addService = () => {
  (BUSINESS.services = BUSINESS.services || []).push({ id: `svc-${Date.now()}`, name: "New Service", priceRange: "$0", duration: "30 min", description: "", features: [] });
  renderTab();
};
window.removeService = (i) => { BUSINESS.services.splice(i, 1); renderTab(); };
window.addSvcFeature = (i) => { BUSINESS.services[i].features.push("New feature"); renderTab(); };
window.removeSvcFeature = (si, fi) => { BUSINESS.services[si].features.splice(fi, 1); renderTab(); };

window.addDeal = () => { (BUSINESS.deals = BUSINESS.deals || []).push({ id: `deal-${Date.now()}`, title: "New Deal", description: "", price: "$0", badge: "" }); renderTab(); };
window.removeDeal = (i) => { BUSINESS.deals.splice(i, 1); renderTab(); };

window.addPricing = () => { (BUSINESS.pricing = BUSINESS.pricing || []).push({ id: `price-${Date.now()}`, name: "New Item", price: "$0", note: "", popular: false }); renderTab(); };
window.removePricing = (i) => { BUSINESS.pricing.splice(i, 1); renderTab(); };

window.addTeam = () => { (BUSINESS.team = BUSINESS.team || []).push({ name: "New Member", role: "Role", experience: "", specialty: "", image: "" }); renderTab(); };
window.removeTeam = (i) => { BUSINESS.team.splice(i, 1); renderTab(); };

window.addTestimonial = () => { (BUSINESS.testimonials = BUSINESS.testimonials || []).push({ name: "Customer", context: "", quote: "Great service!" }); renderTab(); };
window.removeTestimonial = (i) => { BUSINESS.testimonials.splice(i, 1); renderTab(); };

window.addFaq = () => { (BUSINESS.faqs = BUSINESS.faqs || []).push({ id: `faq-${Date.now()}`, question: "New Question?", answer: "Answer here." }); renderTab(); };
window.removeFaq = (i) => { BUSINESS.faqs.splice(i, 1); renderTab(); };

// ─── Save ────────────────────────────────────────────────────────────

async function saveChanges() {
  const btn = document.getElementById("saveBtn");
  const status = document.getElementById("saveStatus");
  btn.disabled = true;
  status.textContent = "Saving...";

  try {
    const res = await fetch(`${API_BASE}/content`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(BUSINESS),
    });
    if (!res.ok) throw new Error("Save failed");
    status.textContent = "Saved!";
    status.style.color = "var(--accent)";
  } catch (err) {
    status.textContent = "Error: " + err.message;
    status.style.color = "#dc2626";
  }
  btn.disabled = false;
  setTimeout(() => { status.textContent = ""; }, 3000);
}
window.saveChanges = saveChanges;

function logout() { localStorage.removeItem("site_token"); window.location.href = "/mysite/login.html"; }
window.logout = logout;

// ─── Helpers ─────────────────────────────────────────────────────────

function getNestedValue(obj, path) { return path.split(".").reduce((o, k) => o?.[k], obj); }
function setNestedValue(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => { if (!o[k]) o[k] = {}; return o[k]; }, obj);
  target[last] = value;
}
function esc(s) { return s == null ? "" : String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

// Boot
window.initAdmin = initAdmin;
document.addEventListener("DOMContentLoaded", initAdmin);
