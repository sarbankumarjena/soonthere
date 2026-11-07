import { initTilt, observeReveals } from "../app.js";
import { $, $$, html, debounce, prefersReducedMotion } from "../lib/dom.js";
import { icons } from "../lib/icons.js";
import { formatPrice, formatShortDate, formatTime, pluralise, relativeTime } from "../lib/format.js";
import {
  categories,
  events,
  byStart,
  getCategory,
  getStatus,
  imageSrc,
  isPast,
  nextEvent,
  popularity,
  priceInUsd,
  upcoming,
} from "../lib/catalog.js";
import { eventCard, featuredCard } from "../components/card.js";
import { mountCountdown } from "../components/countdown.js";
import { matches, searchText } from "../lib/search.js";
import { mountDial } from "../components/dial.js";

const grid = $("#event-grid");
const form = $("#filters");
const searchInput = $("#search");
const sortSelect = $("#sort");
const pastToggle = $("#show-past");
const chipGroup = $("#category-filter");
const resultsMeta = $("#results-meta");

const state = { q: "", cat: "all", sort: "soonest", past: false };

const searchIndex = new Map(events.map((e) => [e.id, searchText(e)]));

const sorters = {
  soonest: byStart,
  popular: (a, b) => popularity(b) - popularity(a),
  "price-asc": (a, b) => priceInUsd(a) - priceInUsd(b) || byStart(a, b),
  "price-desc": (a, b) => priceInUsd(b) - priceInUsd(a) || byStart(a, b),
};

function matchesSearch(event) {
  return matches(searchIndex.get(event.id), state.q);
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

const eventUrl = (event) => `event.html?id=${encodeURIComponent(event.id)}`;

let spotlightCountdown;

function renderSpotlight(event) {
  const el = $("#spotlight");
  const status = getStatus(event);
  const when = event.id === nextEvent()?.id ? "Next up" : relativeTime(event.start);
  const cta = { "sold-out": "Sold out, see details", "few-left": "Grab a last spot" }[status] ?? (event.price ? "Get tickets" : "Get a free pass");

  el.dataset.category = event.category;
  el.innerHTML = html`
    <div class="spotlight__label">
      <span class="mono">${when}</span>
      <span class="chip" data-category="${event.category}">${getCategory(event.category)?.label}</span>
    </div>
    <h2 class="spotlight__title"><a href="${eventUrl(event)}">${event.title}</a></h2>
    <ul class="spotlight__meta" role="list">
      <li>${icons.calendar}${formatShortDate(event)}, ${formatTime(event.start, event.timeZone)}</li>
      <li>${icons.pin}${event.venue}, ${event.city}</li>
      <li>${icons.ticket}${formatPrice(event.price, event.currency)}</li>
    </ul>
    <div class="spotlight__foot">
      <span data-countdown></span>
      <a class="btn btn-small ${status === "sold-out" ? "btn-ghost" : "btn-accent"}" href="${eventUrl(event)}">${cta}</a>
    </div>`;
  spotlightCountdown?.stop();
  spotlightCountdown = mountCountdown($("[data-countdown]", el), event.start, { variant: "compact" });
}

function initStage() {
  const list = upcoming();
  const stage = $("#stage");
  if (!list.length) {
    $("#dial").hidden = true;
    return;
  }

  const layers = $$(".stage__backdrop img", stage);
  let front = 0;
  let latest;

  // crossfade between two layers once the next photo has decoded
  const setBackdrop = (event) => {
    const incoming = layers[1 - front];
    const outgoing = layers[front];
    const token = (latest = {});
    incoming.src = imageSrc(event, 960);
    incoming
      .decode()
      .catch(() => {})
      .then(() => {
        if (token !== latest) return;
        incoming.classList.add("is-on");
        outgoing.classList.remove("is-on");
        front = 1 - front;
      });
  };

  mountDial($("#dial"), list, {
    pauseArea: stage,
    onChange(event) {
      stage.dataset.category = event.category;
      renderSpotlight(event);
      setBackdrop(event);
    },
    onOpen(event) {
      window.location.href = eventUrl(event);
    },
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

initStage();
renderMarquees();
renderFeatured();
initFilters();
initCoverTransition();
observeReveals();
