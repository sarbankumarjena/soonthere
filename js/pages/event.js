import { initMagnetic, initTilt, observeReveals, toast } from "../app.js";
import { $, html, getParam } from "../lib/dom.js";
import { icons } from "../lib/icons.js";
import { formatDate, formatPrice, formatShortDate, formatTime, formatTimeRange, pluralise, relativeTime } from "../lib/format.js";
import { canRegister, getCategory, getEvent, getStatus, hasStarted, mapsUrl, related, seatsLeft } from "../lib/catalog.js";
import { getRegistrations } from "../lib/storage.js";
import { downloadIcs, eventLink } from "../lib/calendar.js";
import { eventCard, statusStamp } from "../components/card.js";
import { mountCountdown } from "../components/countdown.js";

const root = $("#event-root");
const cover = $("#event-cover");
const event = getEvent(getParam("id"));

const registerUrl = (e) => `register.html?event=${encodeURIComponent(e.id)}`;
const cityTime = (e) => `${e.city} time`;

// "That's 6:00 AM Friday for you" when the visitor is in a different time zone
function yourTime(e) {
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const opts = { hour: "numeric", minute: "2-digit", weekday: "long" };
  const there = new Intl.DateTimeFormat(undefined, { ...opts, timeZone: e.timeZone }).format(new Date(e.start));
  const here = new Intl.DateTimeFormat(undefined, opts).format(new Date(e.start));
  return mine === e.timeZone || there === here ? "" : here;
}

function bookingState(e) {
  const status = getStatus(e);
  if (status === "ended") return { open: false, title: "This one's over.", note: `It happened ${relativeTime(e.start)}. Keep an eye on the lineup for the next one.` };
  if (hasStarted(e)) return { open: false, title: "Doors are open.", note: "It's happening right now, so bookings have closed." };
  if (status === "sold-out") return { open: false, title: "Sold out.", note: "Every spot is taken. Spots sometimes free up when people cancel, so check back." };
  return { open: canRegister(e), title: "", note: "" };
}

function mine(e) {
  return getRegistrations()
    .filter((r) => r.eventId === e.id)
    .reduce((sum, r) => sum + r.passes, 0);
}

function ticketPanel(e) {
  const state = bookingState(e);
  const left = seatsLeft(e);
  const taken = Math.round(((e.capacity - left) / e.capacity) * 100);
  const passes = mine(e);
  const local = yourTime(e);

  return html`
    <aside class="ticket-panel" data-category="${e.category}" aria-labelledby="ticket-title">
      <div class="ticket-panel__top">
        <h2 class="visually-hidden" id="ticket-title">Tickets</h2>
        <p class="ticket-panel__price">${formatPrice(e.price, e.currency)}${e.price ? html`<small>per pass</small>` : ""}</p>
        <dl class="ticket-panel__facts">
          <div><dt>${icons.calendar}<span class="visually-hidden">Date</span></dt><dd>${formatDate(e)}</dd></div>
          <div>
            <dt>${icons.clock}<span class="visually-hidden">Time</span></dt>
            <dd>${formatTimeRange(e)} <span class="muted">${cityTime(e)}</span>${local && html`<span class="ticket-panel__yours">That's ${local} for you</span>`}</dd>
          </div>
          <div><dt>${icons.pin}<span class="visually-hidden">Venue</span></dt><dd>${e.venue}, ${e.city}</dd></div>
        </dl>
      </div>

      <div class="ticket-panel__bottom">
        ${state.open
          ? html`
            <div class="ticket-panel__count" data-countdown></div>
            <div class="seats">
              <div class="seats__bar" aria-hidden="true"><span style="--fill:${taken}%"></span></div>
              <p class="seats__text"><b>${left.toLocaleString()}</b> of ${e.capacity.toLocaleString()} spots left</p>
            </div>
            <a class="btn btn-accent btn-block" href="${registerUrl(e)}" id="register-cta" data-magnetic>Register now ${icons.arrow}</a>`
          : html`
            <div class="ticket-panel__closed">
              <p class="ticket-panel__closed-title">${state.title}</p>
              <p>${state.note}</p>
            </div>
            <a class="btn btn-ghost btn-block" href="index.html#lineup">Find something else</a>`}
        ${passes > 0 && html`
          <p class="ticket-panel__mine">${icons.check} You've got ${pluralise(passes, "pass", "passes")} for this. <a href="tickets.html">See my tickets</a></p>`}
        <div class="ticket-panel__actions">
          <button class="btn btn-small btn-ghost" type="button" data-action="calendar">${icons.download} Add to calendar</button>
          <button class="btn btn-small btn-ghost" type="button" data-action="share">${icons.arrowUpRight} Share</button>
        </div>
      </div>
    </aside>`;
}

function details(e) {
  const category = getCategory(e.category);
  return html`
    <div class="event-main">
      <header class="event-head">
        <div class="event-head__tags">
          <span class="chip" data-category="${e.category}">${category?.label}</span>
          ${statusStamp(e)}
        </div>
        <h1 class="event-head__title">${e.title}</h1>
        <p class="event-head__summary">${e.summary}</p>
        <p class="event-head__by">Hosted by <b>${e.organiser}</b></p>
      </header>

      <section class="event-block" aria-labelledby="about-title" data-reveal>
        <h2 class="event-block__title" id="about-title">About</h2>
        <div class="event-prose">${e.description.map((p) => html`<p>${p}</p>`)}</div>
      </section>

      <section class="event-block" aria-labelledby="expect-title" data-reveal>
        <h2 class="event-block__title" id="expect-title">What to expect</h2>
        <ul class="highlights" role="list">${e.highlights.map((h) => html`<li>${icons.check}<span>${h}</span></li>`)}</ul>
      </section>

      <section class="event-block" aria-labelledby="schedule-title" data-reveal>
        <h2 class="event-block__title" id="schedule-title">On the day</h2>
        <ol class="schedule" role="list">
          ${e.schedule.map((s) => html`<li><time class="schedule__time">${s.time}</time><span class="schedule__item">${s.item}</span></li>`)}
        </ol>
        <p class="event-block__note">Times are local to ${e.city}.</p>
      </section>

      <section class="event-block" aria-labelledby="venue-title" data-reveal>
        <h2 class="event-block__title" id="venue-title">Where</h2>
        <div class="venue-card">
          <div class="venue-card__map" aria-hidden="true"><span class="venue-card__pin">${icons.pin}</span></div>
          <div class="venue-card__info">
            <p class="venue-card__name">${e.venue}</p>
            <p>${e.area}, ${e.city}<br>${e.country}</p>
            <a class="link-arrow" href="${mapsUrl(e)}" target="_blank" rel="noopener">Open in maps ${icons.arrowUpRight}</a>
          </div>
        </div>
        <ul class="tag-list" role="list" aria-label="Tags">${e.tags.map((t) => html`<li>${t}</li>`)}</ul>
      </section>
    </div>`;
}

function buyBar(e) {
  const bar = $("#buy-bar");
  if (!bookingState(e).open) return;
  bar.innerHTML = html`
    <div class="buy-bar__info">
      <b>${formatPrice(e.price, e.currency)}</b>
      <span>${formatShortDate(e)}, ${formatTime(e.start, e.timeZone)}</span>
    </div>
    <a class="btn btn-accent btn-small" href="${registerUrl(e)}">Register</a>`;
  bar.hidden = false;

  // only show it once the main button has scrolled away, and tuck it away again at the footer
  const footer = $(".site-footer");
  let frame;
  const update = () => {
    frame = null;
    const cta = $("#register-cta");
    const passed = cta ? cta.getBoundingClientRect().bottom < 0 : false;
    const atFooter = footer.getBoundingClientRect().top < window.innerHeight;
    bar.classList.toggle("is-visible", passed && !atFooter);
  };
  window.addEventListener("scroll", () => (frame ??= requestAnimationFrame(update)), { passive: true });
  update();
}

function initActions(e) {
  root.addEventListener("click", async (ev) => {
    const action = ev.target.closest("[data-action]")?.dataset.action;
    if (action === "calendar") {
      downloadIcs(e);
      toast("Calendar file downloaded. Open it to add the event.");
    }
    if (action === "share") {
      const data = { title: e.title, text: e.summary, url: eventLink(e) };
      if (navigator.share) {
        try {
          await navigator.share(data);
        } catch {
          // closing the share sheet isn't an error worth reporting
        }
        return;
      }
      try {
        await navigator.clipboard.writeText(data.url);
        toast("Link copied. Send it to whoever's coming with you.");
      } catch {
        toast("Couldn't copy the link, but the address bar has it.");
      }
    }
  });
}

function renderRelated(e) {
  const list = related(e, 3);
  if (!list.length) return;
  $("#related-list").innerHTML = list.map((r) => eventCard(r)).join("");
  $("#related").hidden = false;
  initTilt($("#related"));
}

function render() {
  const status = getStatus(event);
  root.innerHTML = html`${details(event)}${ticketPanel(event)}`;
  root.dataset.category = event.category;
  cover.dataset.category = event.category;
  cover.classList.toggle("is-ended", status === "ended");
  const count = $("[data-countdown]", root);
  if (count) mountCountdown(count, event.start, { onEnd: render });
  observeReveals(root);
  initMagnetic(root);
}

function notFound() {
  cover.remove();
  document.title = "Event not found | SoonThere";
  root.classList.add("is-missing");
  root.innerHTML = html`
    <div class="event-missing">
      <p class="eyebrow"><span>Error 404</span><span>No such event</span></p>
      <h1>We can't find that one.</h1>
      <p>The link might be old, or the event was taken off the lineup. Everything that's still on is a click away.</p>
      <a class="btn btn-accent" href="index.html#lineup">Browse the lineup ${icons.arrow}</a>
    </div>`;
}

if (!event) {
  notFound();
} else {
  document.title = `${event.title} | SoonThere`;
  $('meta[name="description"]').content = event.summary;
  const img = $("img", cover);
  img.alt = event.imageAlt;
  img.addEventListener("load", () => cover.classList.add("is-developed"), { once: true });
  if (img.complete && img.naturalWidth) cover.classList.add("is-developed");

  render();
  buyBar(event);
  initActions(event);
  renderRelated(event);
  document.addEventListener("registrations:change", render);
}
