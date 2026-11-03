import { initTilt, observeReveals } from "../app.js";
import { $, $$, html, debounce, prefersReducedMotion } from "../lib/dom.js";
import { icons } from "../lib/icons.js";
import { formatShortDate, pluralise } from "../lib/format.js";
import {
  categories,
  events,
  byStart,
  getCategory,
  isPast,
  nextEvent,
  popularity,
  priceInUsd,
  upcoming,
} from "../lib/catalog.js";
import { eventCard, featuredCard } from "../components/card.js";
import { mountCountdown } from "../components/countdown.js";

const grid = $("#event-grid");
const form = $("#filters");
const searchInput = $("#search");
const sortSelect = $("#sort");
const pastToggle = $("#show-past");
const chipGroup = $("#category-filter");
const resultsMeta = $("#results-meta");

const state = { q: "", cat: "all", sort: "soonest", past: false };

// "Alcântara" should match "alcantara"
const normalise = (text) =>
  String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const searchIndex = new Map(
  events.map((e) => [
    e.id,
    normalise([e.title, e.venue, e.area, e.city, e.country, e.organiser, getCategory(e.category)?.label, ...e.tags].join(" ")),
  ]),
);

const sorters = {
  soonest: byStart,
  popular: (a, b) => popularity(b) - popularity(a),
  "price-asc": (a, b) => priceInUsd(a) - priceInUsd(b) || byStart(a, b),
  "price-desc": (a, b) => priceInUsd(b) - priceInUsd(a) || byStart(a, b),
};

function matchesSearch(event) {
  const terms = normalise(state.q).split(/\s+/).filter(Boolean);
  const haystack = searchIndex.get(event.id);
  return terms.every((term) => haystack.includes(term));
}

function visibleEvents() {
  return events.filter((e) => (state.past || !isPast(e)) && matchesSearch(e));
}

function filtered() {
  const list = visibleEvents().filter((e) => state.cat === "all" || e.category === state.cat);
  const sorted = list.sort(sorters[state.sort] ?? byStart);
  // past events always go to the end
  return [...sorted.filter((e) => !isPast(e)), ...sorted.filter(isPast)];
}

function renderChips() {
  const pool = visibleEvents();
  const count = (id) => (id === "all" ? pool.length : pool.filter((e) => e.category === id).length);
  const options = [{ id: "all", label: "All" }, ...categories];

  chipGroup.innerHTML = html`<legend class="visually-hidden">Category</legend>${options.map(
    (c) => html`
      <label class="chip-option" data-category="${c.id}">
        <input type="radio" name="cat" value="${c.id}" ${state.cat === c.id ? "checked" : ""}>
        <span>${c.label} <small>${count(c.id)}</small></span>
      </label>`,
  )}`;
}

function renderResults() {
  const list = filtered();
  const category = getCategory(state.cat);

  if (!list.length) {
    grid.innerHTML = html`
      <div class="empty-state">
        <h3>Nothing on that bill.</h3>
        <p>${state.q ? html`No events match “${state.q}”` : "No events here right now"}${category ? ` in ${category.label}` : ""}. Try another search or clear the filters.</p>
        <button class="btn btn-ghost btn-small" type="button" data-clear>Clear filters</button>
      </div>`;
  } else {
    grid.innerHTML = list.map((e) => eventCard(e)).join("");
    initTilt(grid);
  }

  const parts = [pluralise(list.length, "event")];
  if (category) parts.push(`in ${category.label}`);
  if (state.q) parts.push(`matching “${state.q}”`);
  resultsMeta.textContent = `Showing ${parts.join(" ")}`;
}

function render({ animate = true } = {}) {
  renderChips();
  const update = () => renderResults();
  if (animate && document.startViewTransition && !prefersReducedMotion()) {
    grid.classList.add("is-transitioning");
    $$(".ticket-card", grid).forEach((card) => (card.style.viewTransitionName = `card-${card.dataset.id}`));
    const transition = document.startViewTransition(() => {
      update();
      $$(".ticket-card", grid).forEach((card) => (card.style.viewTransitionName = `card-${card.dataset.id}`));
    });
    transition.finished.finally(() => {
      grid.classList.remove("is-transitioning");
      $$(".ticket-card", grid).forEach((card) => (card.style.viewTransitionName = ""));
    });
  } else {
    update();
  }
}

function readUrl() {
  const params = new URLSearchParams(location.search);
  state.q = params.get("q") ?? "";
  state.cat = categories.some((c) => c.id === params.get("cat")) ? params.get("cat") : "all";
  state.sort = sorters[params.get("sort")] ? params.get("sort") : "soonest";
  state.past = params.get("past") === "1";
  searchInput.value = state.q;
  sortSelect.value = state.sort;
  pastToggle.checked = state.past;
}

function writeUrl() {
  const params = new URLSearchParams();
  if (state.q) params.set("q", state.q);
  if (state.cat !== "all") params.set("cat", state.cat);
  if (state.sort !== "soonest") params.set("sort", state.sort);
  if (state.past) params.set("past", "1");
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}

function initFilters() {
  readUrl();
  render({ animate: false });

  const update = () => {
    writeUrl();
    render();
  };

  searchInput.addEventListener(
    "input",
    debounce(() => {
      state.q = searchInput.value.trim();
      update();
    }, 220),
  );
  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    update();
  });
  pastToggle.addEventListener("change", () => {
    state.past = pastToggle.checked;
    update();
  });
  chipGroup.addEventListener("change", (e) => {
    if (e.target.name !== "cat") return;
    state.cat = e.target.value;
    update();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    searchInput.blur();
  });
  grid.addEventListener("click", (e) => {
    if (!e.target.closest("[data-clear]")) return;
    Object.assign(state, { q: "", cat: "all", past: false });
    searchInput.value = "";
    pastToggle.checked = false;
    update();
    searchInput.focus();
  });

  // press "/" anywhere to jump to search
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.target.closest("input, textarea, select")) return;
    e.preventDefault();
    searchInput.focus();
    searchInput.scrollIntoView({ block: "center" });
  });

  document.addEventListener("registrations:change", () => render({ animate: false }));
}

function renderFeatured() {
  const list = upcoming().filter((e) => e.featured).slice(0, 3);
  const container = $("#featured-list");
  container.innerHTML = list.map((e, i) => featuredCard(e, { large: i === 0 })).join("");
  $$("[data-countdown]", container).forEach((el) => mountCountdown(el, el.dataset.countdown, { variant: "compact" }));
  $$(".poster-card", container).forEach((card, i) => {
    card.dataset.reveal = "";
    card.style.setProperty("--delay", `${i * 0.08}s`);
  });
  initTilt(container);
}

function renderNextUp() {
  const container = $("#next-up");
  const event = nextEvent();
  if (!event) {
    container.hidden = true;
    return;
  }
  container.innerHTML = html`
    <a class="next-up__card" href="event.html?id=${encodeURIComponent(event.id)}" data-category="${event.category}">
      <span class="next-up__label mono"><i></i> Next up</span>
      <strong class="next-up__title">${event.title}</strong>
      <span class="next-up__meta mono">${formatShortDate(event)} · ${event.city}</span>
      <span class="next-up__count" data-countdown></span>
      <span class="next-up__go" aria-hidden="true">${icons.arrowUpRight}</span>
    </a>`;
  mountCountdown($("[data-countdown]", container), event.start, { variant: "compact", onEnd: renderNextUp });
}

function renderStats() {
  const live = upcoming();
  const stats = [
    [live.length, "upcoming events"],
    [new Set(live.map((e) => e.city)).size, "cities"],
    [categories.length, "scenes"],
  ];
  const container = $("#hero-stats");
  container.innerHTML = stats
    .map(([value, label]) => html`<div><dt class="visually-hidden">${label}</dt><dd><b data-count-to="${value}">${value}</b> ${label}</dd></div>`)
    .join("");

  if (prefersReducedMotion()) return;
  $$("[data-count-to]", container).forEach((el) => {
    const target = Number(el.dataset.countTo);
    const start = performance.now();
    const duration = 1200;
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    };
    el.textContent = "0";
    requestAnimationFrame(step);
  });
}

function renderMarquees() {
  const cities = [...new Set(upcoming().map((e) => e.city))];
  const words = {
    ink: categories.map((c) => c.label),
    accent: cities,
  };
  $$(".tape").forEach((tape) => {
    const list = tape.classList.contains("tape--accent") ? words.accent : words.ink;
    const track = html`<div class="marquee__track">${list.map((w) => html`<span class="marquee__item">${w}${icons.star}</span>`)}</div>`;
    tape.innerHTML = `${track}${track}`;
  });
}

// set the cover the user clicked as the shared element for the page transition
function initCoverTransition() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="event.html"]');
    const card = link?.closest("[data-id]");
    if (!card) return;
    $$("[style*='view-transition-name']").forEach((el) => (el.style.viewTransitionName = ""));
    const media = $(".print", card);
    if (media) media.style.viewTransitionName = "event-cover";
  });
  window.addEventListener("pageshow", () => {
    $$(".print").forEach((el) => (el.style.viewTransitionName = ""));
  });
}

renderStats();
renderNextUp();
renderMarquees();
renderFeatured();
initFilters();
initCoverTransition();
observeReveals();
