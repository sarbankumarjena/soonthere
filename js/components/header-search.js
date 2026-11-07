import { $, $$, html } from "../lib/dom.js";
import { events, byStart, getCategory, imageSrc, isPast, upcoming } from "../lib/catalog.js";
import { formatShortDate } from "../lib/format.js";
import { matches, searchText } from "../lib/search.js";

const LIMIT = 5;
const eventUrl = (event) => `event.html?id=${encodeURIComponent(event.id)}`;
const lineupUrl = (q) => `index.html${q ? `?q=${encodeURIComponent(q)}` : ""}#lineup`;

// Search in the header. Suggestions drop down as you type. On the home page it steps
// aside while the lineup's own search box is on screen and comes back once that box
// scrolls away, carrying whatever was typed into it.
export function initHeaderSearch() {
  const header = $(".site-header");
  const form = $(".header-search");
  if (!header || !form) return;
  const input = $("input", form);
  const results = $(".header-search__results", form);
  const toggle = $(".search-toggle");
  const pageInput = $("#search");
  const index = new Map();
  let options = [];
  let active = -1;

  const textFor = (event) => {
    if (!index.has(event.id)) index.set(event.id, searchText(event));
    return index.get(event.id);
  };

  const option = (event, i) => html`
    <a class="header-search__option" id="hs-option-${i}" role="option" aria-selected="false" href="${eventUrl(event)}" data-category="${event.category}">
      <img src="${imageSrc(event, 480)}" alt="" width="56" height="40" loading="lazy">
      <span>
        <b>${event.title}</b>
        <small>${formatShortDate(event)}, ${event.city}${isPast(event) ? " (past)" : ""}</small>
      </span>
      <span class="header-search__cat">${getCategory(event.category)?.label}</span>
    </a>`;

  function render() {
    const q = input.value.trim();
    let list;
    let heading = "";
    if (q) {
      const found = events.filter((e) => matches(textFor(e), q));
      // upcoming first, then anything that has already happened
      list = [...found.filter((e) => !isPast(e)).sort(byStart), ...found.filter(isPast).sort(byStart).reverse()];
      results.innerHTML = list.length
        ? html`
            ${list.slice(0, LIMIT).map(option)}
            <a class="header-search__all" id="hs-option-${Math.min(list.length, LIMIT)}" role="option" aria-selected="false" href="${lineupUrl(q)}" data-all>
              ${list.length > LIMIT ? `See all ${list.length} results` : "Show these in the lineup"}
            </a>`
        : html`<p class="header-search__empty">Nothing matches “${q}”. Try a city, a venue or a kind of night out.</p>`;
    } else {
      list = upcoming().slice(0, 3);
      heading = "Coming up next";
      results.innerHTML = html`<p class="header-search__label">${heading}</p>${list.map(option)}`;
    }
    options = $$('[role="option"]', results);
    setActive(-1);
  }

  function setActive(i) {
    options[active]?.setAttribute("aria-selected", "false");
    active = i;
    const el = options[active];
    if (el) {
      el.setAttribute("aria-selected", "true");
      el.scrollIntoView({ block: "nearest" });
      input.setAttribute("aria-activedescendant", el.id);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  const open = () => {
    render();
    results.hidden = false;
    input.setAttribute("aria-expanded", "true");
  };

  const close = () => {
    results.hidden = true;
    input.setAttribute("aria-expanded", "false");
    setActive(-1);
  };

  // phones and tablets: the field opens over the header bar
  const expand = () => {
    header.classList.add("is-searching");
    toggle?.setAttribute("aria-expanded", "true");
    document.dispatchEvent(new CustomEvent("search:open"));
    input.focus();
  };

  const collapse = ({ refocus = false } = {}) => {
    close();
    if (!header.classList.contains("is-searching")) return;
    header.classList.remove("is-searching");
    toggle?.setAttribute("aria-expanded", "false");
    if (refocus) toggle?.focus();
  };

  // on the home page, hand the query to the lineup's search and scroll down to it
  function showInLineup(q) {
    pageInput.value = q;
    pageInput.dispatchEvent(new Event("input", { bubbles: true }));
    collapse();
    input.blur();
    $("#lineup").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    pageInput.focus({ preventScroll: true });
  }

  input.addEventListener("focus", open);
  input.addEventListener("input", open);

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (results.hidden) open();
      const n = options.length;
      if (n) setActive(e.key === "ArrowDown" ? (active + 1) % n : (active - 1 + n) % n);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (!results.hidden && input.value) {
        input.value = "";
        render();
      } else {
        collapse({ refocus: true });
        input.blur();
      }
    } else if (e.key === "Enter" && options[active]) {
      e.preventDefault();
      options[active].click();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (pageInput) showInLineup(q);
    else window.location.href = lineupUrl(q);
  });

  results.addEventListener("click", (e) => {
    if (e.target.closest("[data-all]") && pageInput) {
      e.preventDefault();
      showInLineup(input.value.trim());
    }
  });

  // keep the active option under the mouse too
  results.addEventListener("pointermove", (e) => {
    const el = e.target.closest('[role="option"]');
    if (el && options.indexOf(el) !== active) setActive(options.indexOf(el));
  });

  form.addEventListener("focusout", (e) => {
    if (form.contains(e.relatedTarget)) return;
    close();
    if (!input.value.trim()) collapse();
    syncWithPage();
  });

  document.addEventListener("pointerdown", (e) => {
    if (form.contains(e.target) || toggle?.contains(e.target)) return;
    close();
    collapse();
  });

  $(".header-search__close", form)?.addEventListener("click", () => collapse({ refocus: true }));
  toggle?.addEventListener("click", () => (header.classList.contains("is-searching") ? collapse() : expand()));
  document.addEventListener("menu:open", () => collapse());
  matchMedia("(min-width: 1024px)").addEventListener("change", () => collapse());

  // "/" jumps to search on every page; the home page points it at the lineup instead
  if (!pageInput) {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/" || e.target.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      if (matchMedia("(min-width: 1024px)").matches) input.focus();
      else expand();
    });
  }

  // home page: the two boxes trade places as the lineup's search scrolls in and out of view
  let pageVisible = false;
  function syncWithPage() {
    if (!pageInput) return;
    const hide = pageVisible && !form.contains(document.activeElement);
    if (!hide && header.classList.contains("has-page-search")) input.value = pageInput.value;
    header.classList.toggle("has-page-search", hide);
    if (hide) collapse();
  }

  if (pageInput && "IntersectionObserver" in window) {
    const target = pageInput.closest(".search-field") ?? pageInput;
    const headerHeight = Math.round(header.getBoundingClientRect().height);
    new IntersectionObserver(
      ([entry]) => {
        pageVisible = entry.isIntersecting;
        syncWithPage();
      },
      { rootMargin: `-${headerHeight}px 0px 0px 0px` },
    ).observe(target);
    pageInput.addEventListener("input", () => {
      if (!form.contains(document.activeElement)) input.value = pageInput.value;
    });
  }
}
