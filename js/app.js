import { $, $$, canHover, prefersReducedMotion } from "./lib/dom.js";
import { getTheme, setTheme } from "./lib/storage.js";
import { currentUser, ensureDemoAccounts, myBookings } from "./lib/auth.js";
import { initHeaderSearch } from "./components/header-search.js";

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
    }).catch(() => {});
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
    if (open) document.dispatchEvent(new CustomEvent("menu:open"));
  };

  document.addEventListener("search:open", () => setOpen(false));

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
  const count = myBookings().length;
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

// The logo's flight path is drawn to fit the name: it starts on the left, slips behind the
// word (hidden where it passes behind the letters), loops back over the top, comes down the
// left side and sweeps out underneath, with the plane at the end of it.
const SVG = "http://www.w3.org/2000/svg";

function initLogo() {
  $$(".logo").forEach((logo) => {
    const word = $(".logo__word", logo);
    const svg = $(".logo__trail", logo);
    const plane = $(".logo__plane", logo);
    if (!word || !svg || !plane) return;
    let flight;

    const draw = () => {
      const box = logo.getBoundingClientRect();
      const wb = word.getBoundingClientRect();
      const em = parseFloat(getComputedStyle(logo).fontSize);
      const w = box.width;
      const h = box.height;
      const x0 = wb.left - box.left;
      const x1 = wb.right - box.left;
      const y0 = wb.top - box.top;
      const y1 = wb.bottom - box.top;
      const ww = x1 - x0;
      const mid = (y0 + y1) / 2;
      const r = (n) => n.toFixed(1);

      const behind = `M ${r(x0 - 0.45 * em)} ${r(mid + 0.1 * em)} C ${r(x0 + ww * 0.3)} ${r(mid - 0.05 * em)}, ${r(x1 - ww * 0.25)} ${r(mid - 0.15 * em)}, ${r(x1 + 0.25 * em)} ${r(mid - 0.22 * em)}`;
      const loop = ` C ${r(x1 + 0.68 * em)} ${r(y0 - 0.08 * em)}, ${r(x1 - ww * 0.15)} ${r(y0 - 0.36 * em)}, ${r(x0 + ww * 0.45)} ${r(y0 - 0.31 * em)}`
        + ` C ${r(x0 + ww * 0.05)} ${r(y0 - 0.27 * em)}, ${r(x0 - 0.55 * em)} ${r(y0 - 0.05 * em)}, ${r(x0 - 0.4 * em)} ${r(mid + 0.25 * em)}`
        + ` C ${r(x0 - 0.25 * em)} ${r(y1 + 0.3 * em)}, ${r(x1 - ww * 0.3)} ${r(y1 + 0.33 * em)}, ${r(x1 + 0.7 * em)} ${r(mid + 0.05 * em)}`;
      const full = behind + loop;

      // where the path passes behind the word, mask it out so it seems to go round the back
      const id = `logo-mask-${Math.random().toString(36).slice(2, 8)}`;
      // the remainder starts where the behind segment ends
      const rest = `M ${behind.split(" ").slice(-2).join(" ")}${loop}`;
      const box2 = `x="-20" y="-20" width="${r(w + 40)}" height="${r(h + 40)}"`;
      svg.setAttribute("viewBox", `0 0 ${r(w)} ${r(h)}`);
      svg.innerHTML = `
        <defs>
          <mask id="${id}-a" maskUnits="userSpaceOnUse" ${box2}>
            <path class="logo__reveal" d="${behind}"/>
            <rect x="${r(x0 - 2)}" y="${r(y0 - 1)}" width="${r(ww + 4)}" height="${r(y1 - y0 + 2)}" rx="3" fill="#000"/>
          </mask>
          <mask id="${id}-b" maskUnits="userSpaceOnUse" ${box2}><path class="logo__reveal" d="${rest}"/></mask>
        </defs>
        <path d="${behind}" mask="url(#${id}-a)"/>
        <path d="${rest}" mask="url(#${id}-b)"/>`;
      logo.style.setProperty("--flight", `path("${full}")`);

      // hide the plane while it's behind the word
      const probe = document.createElementNS(SVG, "path");
      probe.setAttribute("d", full);
      const total = probe.getTotalLength();
      const behindLength = (() => {
        const p = document.createElementNS(SVG, "path");
        p.setAttribute("d", behind);
        return p.getTotalLength();
      })();
      let enter = null;
      let exit = null;
      for (let l = 0; l <= behindLength; l += 1) {
        const pt = probe.getPointAtLength(l);
        const inside = pt.x > x0 + 2 && pt.x < x1 - 2 && pt.y > y0 && pt.y < y1;
        if (inside && enter === null) enter = l / total;
        if (!inside && enter !== null && exit === null) exit = l / total;
      }
      flight = { enter: enter ?? 0, exit: exit ?? 0, split: behindLength / total };
      logo.classList.add("is-ready");
    };

    const fly = () => {
      if (!flight || prefersReducedMotion() || !plane.animate) return;
      const { enter, exit, split } = flight;
      plane.animate(
        [
          { offsetDistance: "0%", opacity: 0, offset: 0 },
          { offsetDistance: "2%", opacity: 1, offset: 0.02 },
          { offsetDistance: `${enter * 100}%`, opacity: 1, offset: enter },
          { offsetDistance: `${(enter + 0.01) * 100}%`, opacity: 0, offset: enter + 0.01 },
          { offsetDistance: `${(exit - 0.01) * 100}%`, opacity: 0, offset: exit - 0.01 },
          { offsetDistance: `${exit * 100}%`, opacity: 1, offset: exit },
          { offsetDistance: "100%", opacity: 1, offset: 1 },
        ],
        { duration: 2600, easing: "linear" },
      );
      // the dashes draw in behind the plane, revealed through the masks
      $$(".logo__reveal", svg).forEach((path, i) => {
        const length = path.getTotalLength();
        path.animate(
          [{ strokeDasharray: `${length} ${length}`, strokeDashoffset: length }, { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 }],
          { duration: 2600 * (i === 0 ? split : 1 - split), delay: i === 0 ? 0 : 2600 * split, easing: "linear", fill: "backwards" },
        );
      });
    };

    let drawn = false;
    const fit = () => {
      draw();
      if (!drawn) {
        drawn = true;
        fly();
      }
    };
    document.fonts.ready.then(fit);
    new ResizeObserver(() => drawn && draw()).observe(logo);
    logo.addEventListener("pointerenter", fly);
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

function updateAccount() {
  const user = currentUser();
  $$("[data-account-link]").forEach((link) => {
    link.replaceChildren();
    if (user) {
      const avatar = document.createElement("span");
      avatar.className = "avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.textContent = user.name.charAt(0).toUpperCase();
      const name = document.createElement("span");
      name.className = "nav-account__name";
      name.textContent = user.name.split(" ")[0];
      link.append(avatar, name);
      link.setAttribute("aria-label", `Your account, ${user.name}`);
    } else {
      link.textContent = "Sign in";
      link.removeAttribute("aria-label");
    }
  });
  $$("[data-admin-link]").forEach((link) => (link.hidden = user?.role !== "admin"));
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
initHeaderSearch();
initStretchType();
initMagnetic();
initYear();
updateTicketCount();
updateAccount();
observeReveals();
ensureDemoAccounts().catch(() => {});
document.addEventListener("auth:change", () => {
  updateAccount();
  updateTicketCount();
});
document.addEventListener("registrations:change", () => updateTicketCount(true));
