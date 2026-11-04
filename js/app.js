import { $, $$, canHover, prefersReducedMotion } from "./lib/dom.js";
import { getRegistrations, getTheme, setTheme } from "./lib/storage.js";

document.documentElement.classList.add("js");

function initTheme() {
  const toggle = $(".theme-toggle");
  if (!toggle) return;

  const current = () => document.documentElement.dataset.theme;
  const sync = () => {
    const dark = current() === "dark";
    toggle.setAttribute("aria-pressed", String(dark));
    toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    $('meta[name="theme-color"]')?.setAttribute("content", dark ? "#13110f" : "#f2ece1");
  };

  toggle.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    const apply = () => {
      document.documentElement.dataset.theme = next;
      setTheme(next);
      sync();
    };
    if (!document.startViewTransition || prefersReducedMotion()) return apply();

    // new theme spreads out in a circle from the toggle button
    const { left, top, width, height } = toggle.getBoundingClientRect();
    const x = left + width / 2;
    const y = top + height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const root = document.documentElement;
    root.classList.add("theme-switching");
    const transition = document.startViewTransition(apply);
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: "cubic-bezier(0.22, 1, 0.36, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    });
    transition.finished.finally(() => root.classList.remove("theme-switching"));
  });

  // follow the system setting until the user picks one
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (getTheme()) return;
    document.documentElement.dataset.theme = e.matches ? "dark" : "light";
    sync();
  });

  sync();
}

function initHeader() {
  const header = $(".site-header");
  if (!header) return;

  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const toggle = $(".menu-toggle");
  const links = $(".nav-links");
  if (!toggle || !links) return;

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    links.classList.toggle("is-open", open);
    document.body.classList.toggle("menu-open", open);
  };

  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  links.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && links.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
  window.matchMedia("(min-width: 761px)").addEventListener("change", (e) => {
    if (e.matches) setOpen(false);
  });
}

function updateTicketCount(animate = false) {
  const count = getRegistrations().length;
  $$(".ticket-count").forEach((badge) => {
    badge.textContent = count || "";
    badge.dataset.count = count;
    badge.closest("a")?.setAttribute("aria-label", count ? `My tickets (${count})` : "My tickets");
    if (animate) {
      badge.classList.remove("bump");
      void badge.offsetWidth;
      badge.classList.add("bump");
    }
  });
}

let revealObserver;

export function observeReveals(root = document) {
  const items = $$("[data-reveal]:not(.is-visible)", root);
  if (!("IntersectionObserver" in window) || prefersReducedMotion()) {
    items.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  revealObserver ??= new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
  );
  items.forEach((el) => revealObserver.observe(el));
}

// cards tilt slightly towards the pointer
export function initTilt(root = document) {
  const fine = canHover();
  $$("[data-tilt]", root).forEach((card) => {
    if (card.dataset.tiltReady) return;
    card.dataset.tiltReady = "true";
    const inner = $(".ticket-card__inner", card) ?? card;

    card.addEventListener("pointerenter", () => card.classList.add("is-hovered"));
    card.addEventListener("pointerleave", () => {
      card.classList.remove("is-hovered");
      inner.style.removeProperty("--rx");
      inner.style.removeProperty("--ry");
    });
    card.addEventListener("focusin", () => card.classList.add("is-hovered"));
    card.addEventListener("focusout", () => card.classList.remove("is-hovered"));

    if (!fine || prefersReducedMotion()) return;
    card.addEventListener("pointermove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      inner.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`);
      inner.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
    });
  });
}

function splitLetters(el) {
  const accentFrom = Number(el.dataset.accentFrom ?? -1);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement.closest(".visually-hidden") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  let index = 0;
  nodes.forEach((node) => {
    const frag = document.createDocumentFragment();
    // keep each word in a wrapper so lines only break between words
    node.textContent.split(/(\s+)/).forEach((chunk) => {
      if (!chunk) return;
      if (/^\s+$/.test(chunk)) {
        frag.append(chunk);
        return;
      }
      const word = document.createElement("span");
      word.className = "word";
      [...chunk].forEach((ch) => {
        const span = document.createElement("span");
        span.className = "letter";
        if (accentFrom >= 0 && index >= accentFrom) span.classList.add("is-accent");
        span.textContent = ch;
        word.append(span);
        index++;
      });
      frag.append(word);
    });
    node.replaceWith(frag);
  });
}

// letters get wider the closer the pointer is to them
function initStretchType() {
  $$("[data-stretch]").forEach((el) => {
    if (!$(".visually-hidden", el)) {
      const label = el.textContent.trim();
      el.innerHTML = `<span class="visually-hidden"></span><span aria-hidden="true">${el.innerHTML}</span>`;
      el.firstElementChild.textContent = label;
    }
    splitLetters(el);

    if (!canHover() || prefersReducedMotion()) return;

    const letters = $$(".letter", el);
    const min = Number(el.dataset.min ?? 60);
    const max = Number(el.dataset.max ?? 140);
    const reach = Number(el.dataset.reach ?? 320);
    const area = el.closest("[data-stretch-area]") ?? el;
    let frame;

    area.addEventListener("pointermove", (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        letters.forEach((letter) => {
          const rect = letter.getBoundingClientRect();
          const dx = e.clientX - (rect.left + rect.width / 2);
          const dy = (e.clientY - (rect.top + rect.height / 2)) * 1.6;
          const t = Math.max(0, 1 - Math.hypot(dx, dy) / reach);
          letter.style.setProperty("--w", Math.round(min + (max - min) * t * t));
        });
      });
    });
    area.addEventListener("pointerleave", () => {
      cancelAnimationFrame(frame);
      letters.forEach((letter) => letter.style.removeProperty("--w"));
    });
  });
}

// the plane in the logo flies an ellipse drawn around the name, sized to the logo
function initLogo() {
  $$(".logo").forEach((logo) => {
    if (!$(".logo__plane", logo)) return;
    const fit = () => {
      const w = logo.offsetWidth;
      const h = logo.offsetHeight;
      const rx = w / 2;
      const ry = h / 2;
      // starts on the left and goes clockwise over the top
      logo.style.setProperty("--orbit", `path("M 0 ${ry} A ${rx} ${ry} 0 1 1 ${w} ${ry} A ${rx} ${ry} 0 1 1 0 ${ry}")`);
      logo.classList.add("has-orbit");
    };
    document.fonts.ready.then(fit);
    new ResizeObserver(fit).observe(logo);
  });
}

export function initMagnetic(root = document) {
  if (!canHover() || prefersReducedMotion()) return;
  $$("[data-magnetic]", root).forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) * 0.25;
      const y = (e.clientY - rect.top - rect.height / 2) * 0.35;
      el.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
    });
    el.addEventListener("pointerleave", () => (el.style.translate = ""));
  });
}

function initYear() {
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
}

export function toast(message, { duration = 3200 } = {}) {
  let region = $(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    region.setAttribute("role", "status");
    region.setAttribute("aria-live", "polite");
    document.body.append(region);
  }
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  region.append(item);
  setTimeout(() => {
    item.classList.add("is-leaving");
    item.addEventListener("animationend", () => item.remove(), { once: true });
  }, duration);
}

initTheme();
initLogo();
initHeader();
initStretchType();
initMagnetic();
initYear();
updateTicketCount();
observeReveals();
document.addEventListener("registrations:change", () => updateTicketCount(true));
