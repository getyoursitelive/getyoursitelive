/**
 * Client Site — Main Application
 *
 * Loads business content from the Worker API and renders the full site.
 * No React, no framework — vanilla JS with template literals.
 *
 * DATA-DRIVEN EDITING: Every editable element has a `data-edit="json.path"`
 * attribute. The editor (editor.js) finds these automatically — no hardcoded
 * selectors. To make a new element editable, just add `data-edit="path"`.
 * For images, use `data-edit-image="path"`.
 * For lists with add/remove, use `data-edit-list="path"` on the container.
 */

// API_BASE is defined in config.js (loaded before this file)
let BUSINESS = null;
let THEME = "modern";

// ─── SVG Icons (inline, no external deps) ────────────────────────────
const ICONS = {
  wrench: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>',
  phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  mapPin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>',
  chevron: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  menu: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>',
  x: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
};

// ─── Load Content ────────────────────────────────────────────────────
async function loadContent() {
  try {
    const res = await fetch(`${API_BASE}/content`);
    if (!res.ok) throw new Error("Failed to load content");
    BUSINESS = await res.json();
    THEME = BUSINESS.theme || "modern";
    renderSite();
  } catch (err) {
    document.getElementById("app").innerHTML = `
      <div style="text-align:center;padding:4rem;color:#666;">
        <h1>Site loading...</h1>
        <p>Content not yet configured.</p>
      </div>`;
  }
}

// ─── Render Full Site ────────────────────────────────────────────────
function renderSite() {
  const b = BUSINESS;
  const v = b.visibility || {};
  const app = document.getElementById("app");

  app.setAttribute("data-theme", THEME);
  document.documentElement.setAttribute("data-theme", THEME);
  document.body.setAttribute("data-theme", THEME);
  app.classList.add("site-container");

  let html = "";
  html += renderTopbar(b);
  html += renderHeader(b);
  html += renderHero(b, v);
  html += renderAbout(b, v);
  html += renderStats(b, v);
  html += renderServices(b, v);
  html += renderDeals(b, v);
  html += renderPricing(b, v);
  html += renderTeam(b, v);
  html += renderTestimonials(b, v);
  html += renderPhotos(b, v);
  html += renderFaq(b, v);
  html += renderEmergency(b, v);
  html += renderContact(b, v);
  html += renderFooter(b);
  html += '<button class="back-to-top hidden" id="backToTop" onclick="window.scrollTo({top:0})">↑</button>';
  html += `<div class="lightbox" id="lightbox">
    <button class="lightbox-close" id="lightboxClose">&times;</button>
    <button class="lightbox-prev" id="lightboxPrev">&#8249;</button>
    <button class="lightbox-next" id="lightboxNext">&#8250;</button>
    <img class="lightbox-img" id="lightboxImg" src="" alt="">
    <p class="lightbox-caption" id="lightboxCaption"></p>
  </div>`;

  app.innerHTML = html;
  initInteractions();
}

// ─── Helper: editable attribute (e = "data-edit", ei = "data-edit-image") ───
function E(path) { return `data-edit="${path}"`; }
function EI(path) { return `data-edit-image="${path}"`; }

// ─── Section Renderers ───────────────────────────────────────────────

function renderTopbar(b) {
  const info = b.businessInfo;
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(info.address)}`;
  return `
    <div class="topbar">
      <div class="topbar-inner">
        <a href="${mapsUrl}" target="_blank" rel="noopener">${ICONS.mapPin} <span ${E("businessInfo.address")}>${esc(info.address)}</span></a>
        <a href="tel:${esc(info.phone)}" style="font-weight:600">${ICONS.phone} <span ${E("businessInfo.phone")}>${esc(info.phone)}</span></a>
      </div>
    </div>`;
}

function renderHeader(b) {
  const info = b.businessInfo;
  const nav = b.navLabels || { home: "Home", about: "About", services: "Services", technicians: "Team", contact: "Contact" };
  const logoHtml = info.logoUrl
    ? `<img src="${esc(info.logoUrl)}" alt="${esc(info.name)} logo" class="brand-logo" ${EI("businessInfo.logoUrl")}>`
    : `<span class="brand-icon">${ICONS.wrench}</span>`;

  return `
    <header class="site-header">
      <nav class="site-nav">
        <a href="#home" class="brand">${logoHtml}<span class="brand-name" ${E("businessInfo.name")}>${esc(info.name)}</span></a>
        <ul class="nav-links">
          <li><a class="nav-link" href="#home" ${E("navLabels.home")}>${esc(nav.home)}</a></li>
          <li><a class="nav-link" href="#about" ${E("navLabels.about")}>${esc(nav.about)}</a></li>
          <li><a class="nav-link" href="#services" ${E("navLabels.services")}>${esc(nav.services)}</a></li>
          <li><a class="nav-link" href="#technicians" ${E("navLabels.technicians")}>${esc(nav.technicians)}</a></li>
          <li><a class="nav-link" href="#contact" ${E("navLabels.contact")}>${esc(nav.contact)}</a></li>
        </ul>
        <button class="mobile-menu-btn" id="mobileMenuOpen" aria-label="Open menu">${ICONS.menu}</button>
      </nav>
    </header>
    <div class="mobile-menu" id="mobileMenu" style="display:none">
      <button class="mobile-menu-close" id="mobileMenuClose" aria-label="Close menu">${ICONS.x}</button>
      <div class="mobile-menu-links">
        <a href="#home" class="mobile-nav-link">${esc(nav.home)}</a>
        <a href="#about" class="mobile-nav-link">${esc(nav.about)}</a>
        <a href="#services" class="mobile-nav-link">${esc(nav.services)}</a>
        <a href="#technicians" class="mobile-nav-link">${esc(nav.technicians)}</a>
        <a href="#contact" class="mobile-nav-link">${esc(nav.contact)}</a>
      </div>
    </div>`;
}

function renderHero(b, v) {
  const h = b.hero;
  if (!h) return "";

  let bullets = "";
  if (h.whyBullets && h.whyBullets.length > 0 && v.showHeroCard !== false) {
    bullets = `
      <aside class="hero-card">
        <h2 class="hero-card-title" ${E("hero.whyTitle")}>${esc(h.whyTitle)}</h2>
        <ul class="hero-card-list" data-edit-list="hero.whyBullets" data-list-template="New bullet point">
          ${h.whyBullets.map((b, i) => `<li>${ICONS.shield} <span ${E("hero.whyBullets." + i)}>${esc(b)}</span></li>`).join("")}
        </ul>
      </aside>`;
  }

  const heroImg = h.heroImage && v.showHeroImage !== false
    ? `<div class="hero-visual"><div class="hero-image-wrap" ${EI("hero.heroImage")}><img src="${esc(h.heroImage)}" alt="${esc(b.businessInfo.name)}" class="hero-image"></div></div>`
    : "";

  return `
    <section id="home" class="hero-section" data-visibility="showHeroEyebrow">
      <div class="hero-grid">
        <div class="hero-text">
          ${v.showHeroEyebrow !== false ? `<p class="hero-eyebrow"><span class="hero-eyebrow-dot"></span><span ${E("hero.eyebrowPrefix")}>${esc(h.eyebrowPrefix)}</span></p>` : ""}
          ${v.showHeroHeadline !== false ? `<h1 class="hero-headline" ${E("hero.headline")}>${esc(h.headline)}</h1>` : ""}
          ${v.showHeroLead !== false ? `<p class="hero-lead" ${E("hero.lead")}>${esc(h.lead)}</p>` : ""}
          ${v.showHeroCtas !== false ? `
            <div class="hero-cta-row">
              <a href="#services" class="btn-primary"><span ${E("hero.primaryCta")}>${esc(h.primaryCta)}</span> <span class="cta-arrow">→</span></a>
              <a href="#contact" class="btn-secondary" ${E("hero.secondaryCta")}>${esc(h.secondaryCta)}</a>
            </div>` : ""}
          ${bullets}
        </div>
        ${heroImg}
      </div>
    </section>`;
}

function renderAbout(b, v) {
  if (v.showAbout === false && v.showAboutWhyUs === false) return "";
  const a = b.about;
  if (!a) return "";

  let story = "";
  if (v.showAbout !== false) {
    const img = a.primaryImage
      ? `<div class="about-image-frame" ${EI("about.primaryImage")}><img src="${esc(a.primaryImage)}" alt="${esc(b.businessInfo.name)}" class="about-image"></div>`
      : `<div class="about-image-frame" ${EI("about.primaryImage")}></div>`;
    const bullets = a.bullets && a.bullets.length > 0
      ? `<ol class="about-bullets" data-edit-list="about.bullets" data-list-template="New bullet">${a.bullets.map((b, i) => `<li><span class="bullet-num">${i + 1}.</span> <span ${E("about.bullets." + i)}>${esc(b)}</span></li>`).join("")}</ol>`
      : "";
    story = `
      <section id="about" class="about-section" data-visibility="showAbout">
        <div class="about-grid">
          ${img}
          <div>
            <h2 class="section-title" ${E("about.heading")}>${esc(a.heading)}</h2>
            <p class="about-narrative" ${E("about.narrative")}>${esc(a.narrative)}</p>
            ${bullets}
          </div>
        </div>
      </section>`;
  }

  let whyUs = "";
  if (v.showAboutWhyUs !== false && a.whyUsCards && a.whyUsCards.length > 0) {
    const img2 = a.secondaryImage
      ? `<div class="about-image-frame" ${EI("about.secondaryImage")}><img src="${esc(a.secondaryImage)}" alt="${esc(b.businessInfo.name)}" class="about-image"></div>`
      : `<div class="about-image-frame" ${EI("about.secondaryImage")}></div>`;
    whyUs = `
      <section class="whyus-section" data-visibility="showAboutWhyUs">
        <div class="whyus-grid">
          ${img2}
          <div class="whyus-cards" data-edit-list="about.whyUsCards" data-list-template='{"title":"New Card","description":"Description here"}'>
            ${a.whyUsCards.map((c, i) => `
              <div class="whyus-card">
                <p class="whyus-card-title" ${E("about.whyUsCards." + i + ".title")}>${esc(c.title)}</p>
                <p class="whyus-card-desc" ${E("about.whyUsCards." + i + ".description")}>${esc(c.description)}</p>
              </div>`).join("")}
          </div>
        </div>
      </section>`;
  }

  return story + whyUs;
}

function renderStats(b, v) {
  if (v.showStats === false) return "";
  const stats = b.stats;
  if (!stats || stats.length === 0) return "";

  return `
    <section id="stats" class="stats-section" data-visibility="showStats">
      <div class="stats-grid">
        ${stats.map((s, i) => `
          <div class="stat-card">
            <div class="stat-value" data-target="${esc(String(s.value))}" data-suffix="${esc(s.suffix)}" ${E("stats." + i + ".value")}>0${esc(s.suffix)}</div>
            <div class="stat-label" ${E("stats." + i + ".label")}>${esc(s.label)}</div>
          </div>`).join("")}
      </div>
    </section>`;
}

function renderServices(b, v) {
  if (v.showServices === false) return "";
  const services = b.services;
  if (!services || services.length === 0) return "";
  const titles = b.sectionTitles || {};

  return `
    <section id="services" class="services-section" data-visibility="showServices">
      <div class="services-inner">
        <h2 class="section-title mb-6" ${E("sectionTitles.services")}>${esc(titles.services || "Our Services")}</h2>
        <div class="services-layout">
          <div class="service-tabs" id="serviceTabs" data-edit-list="services" data-list-template='{"id":"svc-new","name":"New Service","priceRange":"$0","duration":"","description":"Describe this service.","features":[]}'>
            ${services.map((s, i) => `
              <button class="service-pill${i === 0 ? " active" : ""}" data-service="${i}">
                <span ${E("services." + i + ".name")}>${esc(s.name)}</span>
              </button>`).join("")}
          </div>
          <div id="serviceDetail"></div>
        </div>
      </div>
    </section>`;
}

function renderServiceDetail(idx) {
  const s = BUSINESS.services[idx];
  if (!s) return "";
  return `
    <div class="service-detail">
      <p class="service-price-badge" ${E("services." + idx + ".priceRange")}>${esc(s.priceRange)}</p>
      <h3 class="service-name" ${E("services." + idx + ".name")}>${esc(s.name)}</h3>
      ${s.duration ? `<p class="service-duration" ${E("services." + idx + ".duration")}>${esc(s.duration)}</p>` : `<p class="service-duration" ${E("services." + idx + ".duration")} style="opacity:0.4">Add duration...</p>`}
      <p class="service-desc" ${E("services." + idx + ".description")}>${esc(s.description)}</p>
      ${s.features && s.features.length > 0 ? `
        <ul class="service-features" data-edit-list="services.${idx}.features" data-list-template="New feature">
          ${s.features.map((f, fi) => `<li>${ICONS.shield} <span ${E("services." + idx + ".features." + fi)}>${esc(f)}</span></li>`).join("")}
        </ul>` : `<ul class="service-features" data-edit-list="services.${idx}.features" data-list-template="New feature"></ul>`}
    </div>`;
}

function renderDeals(b, v) {
  if (v.showDeals === false) return "";
  const deals = b.deals;
  if (!deals || deals.length === 0) return "";
  const titles = b.sectionTitles || {};

  return `
    <section class="deals-section" data-visibility="showDeals">
      <div class="deals-inner">
        <div class="deals-head">
          <span class="deals-eyebrow" ${E("sectionTitles.dealsEyebrow")}>${esc(titles.dealsEyebrow || "Current Specials")}</span>
          <h2 class="deals-title" ${E("sectionTitles.deals")}>${esc(titles.deals || "Deals This Month")}</h2>
          <p class="deals-lede" ${E("sectionTitles.dealsLede")}>${esc(titles.dealsLede || "")}</p>
        </div>
        <div class="deals-grid" data-edit-list="deals" data-list-template='{"id":"","title":"New Deal","description":"","price":"$0","originalPrice":"","badge":""}'>
          ${deals.map((d, i) => `
            <div class="deal-card">
              ${d.badge ? `<span class="deal-badge" ${E("deals." + i + ".badge")}>${esc(d.badge)}</span>` : ""}
              <h3 class="deal-title" ${E("deals." + i + ".title")}>${esc(d.title)}</h3>
              <p class="deal-desc" ${E("deals." + i + ".description")}>${esc(d.description)}</p>
              <div class="deal-price-row">
                <span class="deal-price" ${E("deals." + i + ".price")}>${esc(d.price)}</span>
                ${d.originalPrice ? `<span class="deal-price-original" ${E("deals." + i + ".originalPrice")}>${esc(d.originalPrice)}</span>` : ""}
              </div>
            </div>`).join("")}
        </div>
      </div>
    </section>`;
}

function renderPricing(b, v) {
  if (v.showPricing === false) return "";
  const pricing = b.pricing;
  if (!pricing || pricing.length === 0) return "";
  const titles = b.sectionTitles || {};

  return `
    <section class="pricing-section" data-visibility="showPricing">
      <div class="pricing-inner">
        <h2 class="section-title" ${E("sectionTitles.pricing")}>${esc(titles.pricing || "Transparent Pricing")}</h2>
        <div class="pricing-grid" data-edit-list="pricing" data-list-template='{"id":"","name":"New Service","price":"$0","note":"","popular":false}'>
          ${pricing.map((p, i) => `
            <div class="pricing-card${p.popular ? " popular" : ""}">
              ${p.popular
                ? `<span class="pricing-badge" ${E("sectionTitles.pricingPopular")}>${esc(titles.pricingPopular || "Popular")}</span>`
                : `<span class="pricing-badge" style="color:var(--text-secondary)" ${E("sectionTitles.pricingRegular")}>${esc(titles.pricingRegular || "No surprises")}</span>`}
              <h3 class="pricing-name" ${E("pricing." + i + ".name")}>${esc(p.name)}</h3>
              <div class="pricing-price" ${E("pricing." + i + ".price")}>${esc(p.price)}</div>
              <p class="pricing-note" ${E("pricing." + i + ".note")}>${esc(p.note)}</p>
            </div>`).join("")}
        </div>
      </div>
    </section>`;
}

function renderTeam(b, v) {
  if (v.showTeam === false) return "";
  const team = b.team;
  if (!team || team.length === 0) return "";
  const titles = b.sectionTitles || {};

  return `
    <section id="technicians" class="team-section" data-visibility="showTeam">
      <div class="team-inner">
        <h2 class="section-title" ${E("sectionTitles.team")}>${esc(titles.team || "Meet Our Team")}</h2>
        <div class="team-grid" data-edit-list="team" data-list-template='{"name":"New Member","role":"Role","experience":"","specialty":"","image":""}'>
          ${team.map((m, i) => `
            <div class="team-card">
              ${m.image
                ? `<img src="${esc(m.image)}" alt="${esc(m.name)}" class="team-photo" ${EI("team." + i + ".image")}>`
                : `<div class="team-photo" ${EI("team." + i + ".image")}></div>`}
              <div class="team-info">
                <p class="team-name" ${E("team." + i + ".name")}>${esc(m.name)}</p>
                <p class="team-role" ${E("team." + i + ".role")}>${esc(m.role)}</p>
                <p class="team-experience"><span ${E("team." + i + ".experience")}>${esc(m.experience)}</span>${m.specialty ? ` - <span ${E("team." + i + ".specialty")}>${esc(m.specialty)}</span>` : ""}</p>
              </div>
            </div>`).join("")}
        </div>
      </div>
    </section>`;
}

function renderTestimonials(b, v) {
  if (v.showTestimonials === false) return "";
  const t = b.testimonials;
  if (!t || t.length === 0) return "";
  const titles = b.sectionTitles || {};

  const starSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
  const stars = Array(5).fill(starSvg).join("");
  const chevronLeft = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
  const chevronRight = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

  return `
    <section class="testimonials-section" data-visibility="showTestimonials">
      <div class="testimonials-inner">
        <h2 class="section-title" ${E("sectionTitles.testimonials")}>${esc(titles.testimonials || "What Customers Say")}</h2>
        <div class="testimonial-card" id="testimonialCarousel">
          <div class="testimonial-stars">${stars}</div>
          <p class="testimonial-quote" ${E("testimonials.0.quote")}>&ldquo;${esc(t[0].quote)}&rdquo;</p>
          <p class="testimonial-author"><span ${E("testimonials.0.name")}>${esc(t[0].name)}</span>${t[0].context ? ` — <span ${E("testimonials.0.context")}>${esc(t[0].context)}</span>` : ""}</p>
          ${t.length > 1 ? `
            <div class="testimonial-nav">
              <button class="testimonial-nav-btn" id="testimonialPrev">${chevronLeft}</button>
              <button class="testimonial-nav-btn" id="testimonialNext">${chevronRight}</button>
            </div>` : ""}
        </div>
      </div>
    </section>`;
}

function renderPhotos(b, v) {
  if (v.showPhotos === false) return "";
  const photos = b.photos;
  if (!photos || photos.length === 0) return "";
  const titles = b.sectionTitles || {};

  return `
    <section class="photos-section" data-visibility="showPhotos">
      <div class="photos-inner">
        <p class="section-eyebrow">Gallery</p>
        <h2 class="section-title" ${E("sectionTitles.photos")}>${esc(titles.photos || "Our Work")}</h2>
        <div class="photos-grid" data-edit-list="photos" data-list-template='{"id":"photo-new","url":"","caption":"New photo"}'>
          ${photos.map((p, i) => `
            <div class="photo-card" data-photo-idx="${i}">
              ${p.url
                ? `<img src="${esc(p.url)}" alt="${esc(p.caption || "")}" class="photo-card-image" loading="lazy" ${EI("photos." + i + ".url")}>`
                : `<div class="photo-card-image photo-card-placeholder" ${EI("photos." + i + ".url")}></div>`}
              ${p.caption ? `<p class="photo-card-caption" ${E("photos." + i + ".caption")}>${esc(p.caption)}</p>` : ""}
            </div>`).join("")}
        </div>
      </div>
    </section>`;
}

function renderFaq(b, v) {
  if (v.showFaq === false) return "";
  const faqs = b.faqs;
  if (!faqs || faqs.length === 0) return "";
  const titles = b.sectionTitles || {};

  return `
    <section class="faq-section" data-visibility="showFaq">
      <div class="faq-inner">
        <h2 class="section-title" ${E("sectionTitles.faq")}>${esc(titles.faq || "Frequently Asked Questions")}</h2>
        <div class="faq-list" data-edit-list="faqs" data-list-template='{"id":"faq-new","question":"New question?","answer":"Answer here."}'>
          ${faqs.map((f, i) => `
            <div class="faq-item${i === 0 ? " open" : ""}" data-faq="${i}">
              <button class="faq-question"><span ${E("faqs." + i + ".question")}>${esc(f.question)}</span> <span class="faq-chevron">${ICONS.chevron}</span></button>
              <div class="faq-answer" ${E("faqs." + i + ".answer")}>${esc(f.answer)}</div>
            </div>`).join("")}
        </div>
      </div>
    </section>`;
}

function renderEmergency(b, v) {
  if (v.showEmergencyBanner === false) return "";
  const e = b.emergency;
  if (!e) return "";

  return `
    <section class="emergency-section" data-visibility="showEmergencyBanner">
      <h2 class="emergency-heading" ${E("emergency.heading")}>${esc(e.heading)}</h2>
      <p class="emergency-desc" ${E("emergency.description")}>${esc(e.description)}</p>
      <a href="tel:${esc(b.businessInfo.emergencyPhone || b.businessInfo.phone)}" class="emergency-btn">
        ${ICONS.phone} <span ${E("emergency.ctaLabel")}>${esc(e.ctaLabel)}</span>
      </a>
    </section>`;
}

function formatHoursLong(schedule) {
  if (!schedule) return [];
  const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const NAMES = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

  function fmt(t) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? `${hour} ${suffix}` : `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
  }

  const ranges = [];
  let i = 0;
  while (i < DAYS.length) {
    const day = DAYS[i];
    const entry = schedule[day];
    const key = entry ? `${entry.open}-${entry.close}` : "closed";
    let end = i;
    while (end + 1 < DAYS.length) {
      const next = schedule[DAYS[end + 1]];
      const nextKey = next ? `${next.open}-${next.close}` : "closed";
      if (nextKey !== key) break;
      end++;
    }
    const startName = NAMES[DAYS[i]];
    const endName = NAMES[DAYS[end]];
    const label = i === end ? startName : `${startName}–${endName}`;
    const hours = entry ? `${fmt(entry.open)} – ${fmt(entry.close)}` : "Closed";
    ranges.push({ label, hours });
    i = end + 1;
  }
  return ranges;
}

function getOpenStatus(schedule) {
  if (!schedule) return null;
  var DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var now = new Date();
  var todayKey = DAY_KEYS[now.getDay()];
  var today = schedule[todayKey];
  var nowMins = now.getHours() * 60 + now.getMinutes();

  function fmt(t) {
    var parts = t.split(":").map(Number);
    var h = parts[0], m = parts[1];
    var suffix = h >= 12 ? "PM" : "AM";
    var hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return m === 0 ? hour + " " + suffix : hour + ":" + String(m).padStart(2, "0") + " " + suffix;
  }

  if (today) {
    var openMins = today.open.split(":").map(Number);
    var closeMins = today.close.split(":").map(Number);
    var oM = openMins[0] * 60 + openMins[1];
    var cM = closeMins[0] * 60 + closeMins[1];
    var spans = cM <= oM;
    var isOpen = spans ? (nowMins >= oM || nowMins < cM) : (nowMins >= oM && nowMins < cM);
    if (isOpen) return { isOpen: true, label: "Open now", detail: "Closes at " + fmt(today.close) };
    if (!spans && nowMins < oM) return { isOpen: false, label: "Closed", detail: "Opens at " + fmt(today.open) };
  }

  for (var offset = 1; offset <= 7; offset++) {
    var nextIdx = (now.getDay() + offset) % 7;
    var nextDay = schedule[DAY_KEYS[nextIdx]];
    if (nextDay) {
      var dayLabel = offset === 1 ? "tomorrow" : DAY_NAMES[nextIdx];
      return { isOpen: false, label: "Closed", detail: "Opens " + fmt(nextDay.open) + " " + dayLabel };
    }
  }
  return { isOpen: false, label: "Closed", detail: "Hours unavailable" };
}

function renderContact(b, v) {
  if (v.showBooking === false) return "";
  const c = b.contact || {};
  const info = b.businessInfo || {};
  const email = info.email || "info@" + (typeof location !== "undefined" ? location.hostname : "example.com");

  let mapHtml = "";
  if (v.showMap !== false && info.address) {
    const mapsEmbed = `https://maps.google.com/maps?q=${encodeURIComponent(info.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
    mapHtml = `<div class="contact-map" data-visibility="showMap"><iframe src="${esc(mapsEmbed)}" class="contact-map-iframe" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>`;
  }

  let hoursHtml = "";
  if (v.showHours !== false && b.hoursSchedule) {
    const ranges = formatHoursLong(b.hoursSchedule);
    const status = getOpenStatus(b.hoursSchedule);
    const statusHtml = status ? `<span class="open-status ${status.isOpen ? "open-status--open" : "open-status--closed"}"><span class="open-status-dot"></span><span class="open-status-label">${esc(status.label)}</span><span class="open-status-detail">&middot; ${esc(status.detail)}</span></span>` : "";
    hoursHtml = `
      <div class="hours-list" data-visibility="showHours">
        <div class="hours-header"><h3 class="hours-heading">Hours</h3>${statusHtml}</div>
        ${ranges.map(r => `<div class="hours-row"><span class="hours-day">${esc(r.label)}</span><span class="hours-time">${esc(r.hours)}</span></div>`).join("")}
      </div>`;
  }

  let contactInfoHtml = "";
  if (v.showContactInfo !== false) {
    contactInfoHtml = `
      <div class="contact-info-box" data-visibility="showContactInfo">
        <div class="contact-info-item">
          <span class="contact-info-label">Phone:</span>
          <a href="tel:${esc(info.phone || "")}" class="contact-info-value" ${E("businessInfo.phone")}>${esc(info.phone || "")}</a>
        </div>
        <div class="contact-info-item">
          <span class="contact-info-label">Email:</span>
          <a href="mailto:${esc(email)}" class="contact-info-value" ${E("businessInfo.email")}>${esc(email)}</a>
        </div>
        ${info.address ? `<div class="contact-info-item">
          <span class="contact-info-label">Address:</span>
          <span class="contact-info-value" ${E("businessInfo.address")}>${esc(info.address)}</span>
          <a href="https://maps.google.com/?q=${encodeURIComponent(info.address)}" target="_blank" rel="noopener" class="contact-maps-link">Open in Maps</a>
        </div>` : ""}
      </div>`;
  }

  return `
    <section id="contact" class="contact-section" data-visibility="showBooking">
      <div class="contact-inner">
        <h2 class="section-title" ${E("contact.heading")}>${esc(c.heading || "Contact Us")}</h2>
        <p class="contact-desc" style="color:var(--text-secondary);margin-top:0.5rem" ${E("contact.description")}>${esc(c.description || "Get in touch — we'd love to hear from you.")}</p>
        <div class="contact-grid">
          <div class="contact-grid-map">${mapHtml}</div>
          <div class="contact-grid-details">
            ${contactInfoHtml}
            ${hoursHtml}
          </div>
        </div>
      </div>
    </section>`;
}

function renderFooter(b) {
  const info = b.businessInfo;
  const f = b.footer || {};
  const year = new Date().getFullYear();

  return `
    <footer class="site-footer">
      <div class="footer-inner">
        <div><span class="footer-brand" ${E("businessInfo.name")}>${esc(info.name)}</span> — <span ${E("businessInfo.tagline")} style="color:var(--text-secondary)">${esc(info.tagline || "")}</span></div>
        <div class="footer-details">
          <strong ${E("footer.locationLabel")}>${esc(f.locationLabel || "Location")}</strong>: <span ${E("businessInfo.address")}>${esc(info.address)}</span>
          · <strong ${E("footer.phoneLabel")}>${esc(f.phoneLabel || "Phone")}</strong>: <a href="tel:${esc(info.phone)}"><span ${E("businessInfo.phone")}>${esc(info.phone)}</span></a>
        </div>
      </div>
      <div class="footer-copyright">© ${year} ${esc(info.name)}. <span ${E("footer.copyrightSuffix")}>${esc(f.copyrightSuffix || "All rights reserved.")}</span></div>
    </footer>`;
}

// ─── Interactions (post-render) ──────────────────────────────────────

function initInteractions() {
  // Mobile menu
  const menuOpen = document.getElementById("mobileMenuOpen");
  const menuClose = document.getElementById("mobileMenuClose");
  const mobileMenu = document.getElementById("mobileMenu");
  if (menuOpen && mobileMenu) {
    menuOpen.addEventListener("click", () => mobileMenu.style.display = "flex");
    menuClose.addEventListener("click", () => mobileMenu.style.display = "none");
    mobileMenu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => mobileMenu.style.display = "none"));
  }

  // Service tabs
  const tabs = document.getElementById("serviceTabs");
  const detail = document.getElementById("serviceDetail");
  if (tabs && detail) {
    detail.innerHTML = renderServiceDetail(0);
    tabs.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-service]");
      if (!btn) return;
      const idx = parseInt(btn.dataset.service);
      tabs.querySelectorAll(".service-pill").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      detail.innerHTML = renderServiceDetail(idx);
      // Notify editor (if active) to re-bind the new detail HTML
      if (typeof window.onServiceTabChange === "function") window.onServiceTabChange(idx);
    });
  }

  // Testimonial carousel
  const testimonials = BUSINESS.testimonials || [];
  if (testimonials.length > 1) {
    let current = 0;
    const carousel = document.getElementById("testimonialCarousel");
    const prev = document.getElementById("testimonialPrev");
    const next = document.getElementById("testimonialNext");
    const starSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    const chevronLeft = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>';
    const chevronRight = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>';

    function showTestimonial(idx) {
      current = idx;
      const t = testimonials[idx];
      if (!carousel) return;
      carousel.innerHTML = `
        <div class="testimonial-stars">${Array(5).fill(starSvg).join("")}</div>
        <p class="testimonial-quote" ${E("testimonials." + idx + ".quote")}>&ldquo;${esc(t.quote)}&rdquo;</p>
        <p class="testimonial-author"><span ${E("testimonials." + idx + ".name")}>${esc(t.name)}</span>${t.context ? ` — <span ${E("testimonials." + idx + ".context")}>${esc(t.context)}</span>` : ""}</p>
        <div class="testimonial-nav">
          <button class="testimonial-nav-btn" id="testimonialPrev">${chevronLeft}</button>
          <button class="testimonial-nav-btn" id="testimonialNext">${chevronRight}</button>
        </div>`;
      document.getElementById("testimonialPrev")?.addEventListener("click", () => showTestimonial((current - 1 + testimonials.length) % testimonials.length));
      document.getElementById("testimonialNext")?.addEventListener("click", () => showTestimonial((current + 1) % testimonials.length));
      // Re-bind editor on new testimonial content
      if (typeof window.onTestimonialChange === "function") window.onTestimonialChange();
    }

    if (prev) prev.addEventListener("click", () => showTestimonial((current - 1 + testimonials.length) % testimonials.length));
    if (next) next.addEventListener("click", () => showTestimonial((current + 1) % testimonials.length));

    // Auto-advance (only when not in edit mode)
    setInterval(() => {
      if (!document.getElementById("app")?.classList.contains("edit-mode")) {
        showTestimonial((current + 1) % testimonials.length);
      }
    }, 5000);
  }

  // FAQ accordion
  document.querySelectorAll(".faq-item").forEach(item => {
    item.querySelector(".faq-question").addEventListener("click", () => {
      const wasOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item").forEach(i => i.classList.remove("open"));
      if (!wasOpen) item.classList.add("open");
    });
  });

  // Open/Closed status — refresh every 60 seconds
  function refreshOpenStatus() {
    if (!BUSINESS.hoursSchedule) return;
    var el = document.querySelector(".open-status");
    if (!el) return;
    var status = getOpenStatus(BUSINESS.hoursSchedule);
    if (!status) return;
    el.className = "open-status " + (status.isOpen ? "open-status--open" : "open-status--closed");
    var lbl = el.querySelector(".open-status-label");
    var det = el.querySelector(".open-status-detail");
    if (lbl) lbl.textContent = status.label;
    if (det) det.innerHTML = "&middot; " + esc(status.detail);
  }
  setInterval(refreshOpenStatus, 60000);

  // Photo lightbox
  const photos = BUSINESS.photos || [];
  if (photos.length > 0) {
    const lightbox = document.getElementById("lightbox");
    const lbImg = document.getElementById("lightboxImg");
    const lbCaption = document.getElementById("lightboxCaption");
    let lbIdx = 0;

    function showLightbox(idx) {
      lbIdx = idx;
      const p = photos[idx];
      if (!p || !p.url) return;
      lbImg.src = p.url;
      lbImg.alt = p.caption || "";
      lbCaption.textContent = p.caption || "";
      lightbox.classList.add("active");
      document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
      lightbox.classList.remove("active");
      document.body.style.overflow = "";
    }

    document.querySelectorAll("[data-photo-idx]").forEach(card => {
      card.style.cursor = "pointer";
      card.addEventListener("click", (e) => {
        if (document.getElementById("app")?.classList.contains("edit-mode")) return;
        showLightbox(parseInt(card.dataset.photoIdx));
      });
    });

    document.getElementById("lightboxClose").addEventListener("click", closeLightbox);
    lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
    document.getElementById("lightboxPrev").addEventListener("click", (e) => { e.stopPropagation(); showLightbox((lbIdx - 1 + photos.length) % photos.length); });
    document.getElementById("lightboxNext").addEventListener("click", (e) => { e.stopPropagation(); showLightbox((lbIdx + 1) % photos.length); });
    document.addEventListener("keydown", (e) => {
      if (!lightbox.classList.contains("active")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") showLightbox((lbIdx - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") showLightbox((lbIdx + 1) % photos.length);
    });
  }

  // Stats counter animation (skip in edit mode — animation overwrites contenteditable)
  const statsSection = document.getElementById("stats");
  const isEditMode = document.getElementById("app")?.classList.contains("edit-mode");
  if (statsSection && !isEditMode) {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      const duration = 2000;
      const start = performance.now();
      const statEls = statsSection.querySelectorAll(".stat-value");
      const targets = [...statEls].map(el => ({
        el,
        target: parseInt(el.dataset.target),
        suffix: el.dataset.suffix || "",
      }));

      function animate(time) {
        const progress = Math.min((time - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        targets.forEach(t => {
          t.el.textContent = Math.round(t.target * eased) + t.suffix;
        });
        if (progress < 1) requestAnimationFrame(animate);
      }
      requestAnimationFrame(animate);
      observer.disconnect();
    }, { threshold: 0.3 });
    observer.observe(statsSection);
  } else if (statsSection) {
    statsSection.querySelectorAll(".stat-value").forEach(el => {
      el.textContent = el.dataset.target + (el.dataset.suffix || "");
    });
  }

  // Back to top button
  const backBtn = document.getElementById("backToTop");
  if (backBtn) {
    window.addEventListener("scroll", () => {
      backBtn.classList.toggle("hidden", window.scrollY < 300);
    }, { passive: true });
  }

}

// ─── Utility ─────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ─── Boot ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", loadContent);
