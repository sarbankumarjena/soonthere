import { toast } from "../app.js";
import { $, $$, html, prefersReducedMotion } from "../lib/dom.js";
import { icons } from "../lib/icons.js";
import { dateParts, formatDate, formatPrice, formatShortDate, formatTime, pluralise, relativeTime } from "../lib/format.js";
import { events, findClashes, getEvent, imageSrc, isPast, upcoming } from "../lib/catalog.js";
import { clearRegistrations, getRegistrations, removeRegistration } from "../lib/storage.js";
import { downloadIcs } from "../lib/calendar.js";
import { passTicket } from "../components/pass.js";

const root = $("#tickets-root");
const dialog = $("#pass-dialog");
const DAY = 86_400_000;

// yyyy-mm-dd in a given time zone, so an event lands on the day it happens locally
const dayKey = (date, timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));

function bookings() {
  return getRegistrations()
    .map((b) => ({ ...b, event: getEvent(b.eventId) }))
    .filter((b) => b.event)
    .sort((a, b) => new Date(a.event.start) - new Date(b.event.start));
}

/* ---------- summary ---------- */

function renderSummary(list, ahead) {
  const passes = list.reduce((sum, b) => sum + b.passes, 0);
  const next = ahead[0];
  $("#summary").textContent = list.length
    ? `${pluralise(list.length, "booking")} and ${pluralise(passes, "pass", "passes")} in total.${next ? ` Next up is ${next.event.title}, ${relativeTime(next.event.start)}.` : ""}`
    : "Nothing booked yet. Once you register for something it shows up here.";
}

/* ---------- season heatmap ---------- */

function heatmap(ahead) {
  const booked = new Map();
  ahead.forEach((b) => {
    const key = dayKey(b.event.start, b.event.timeZone);
    booked.set(key, [...(booked.get(key) ?? []), b]);
  });
  const happening = new Set(upcoming().map((e) => dayKey(e.start, e.timeZone)));

  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
  const last = Math.max(...events.map((e) => new Date(e.start).getTime()), today.getTime());
  const weeks = Math.ceil((last - start.getTime()) / (7 * DAY)) + 1;
  const todayKey = dayKey(today);
  const monthFmt = new Intl.DateTimeFormat(undefined, { month: "short" });
  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });

  const columns = [];
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const cells = [];
    let label = "";
    for (let d = 0; d < 7; d++) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
      const key = dayKey(date);
      if (date.getDate() <= 7 && date.getMonth() !== lastMonth && d === 0) {
        label = monthFmt.format(date);
        lastMonth = date.getMonth();
      }
      const mine = booked.get(key);
      const classes = [mine && "is-booked", !mine && happening.has(key) && "is-on", key === todayKey && "is-today", key < todayKey && "is-gone"].filter(Boolean).join(" ");
      const title = mine ? `${dayFmt.format(date)}: ${mine.map((b) => b.event.title).join(", ")}` : happening.has(key) ? `${dayFmt.format(date)}: something's on` : dayFmt.format(date);
      cells.push(
        mine
          ? html`<button type="button" class="heat__cell ${classes}" data-jump="${mine[0].id}" style="--level:${Math.min(3, mine.reduce((s, b) => s + b.passes, 0))}" title="${title}" aria-label="${title}"></button>`
          : html`<span class="heat__cell ${classes}" title="${title}"></span>`,
      );
    }
    columns.push(html`<div class="heat__week"><span class="heat__month">${label}</span>${cells}</div>`);
  }

  return html`
    <section class="tickets-block" aria-labelledby="heat-title">
      <div class="tickets-block__head">
        <h2 id="heat-title">Season at a glance</h2>
        <ul class="heat__legend" role="list">
          <li><i class="heat__cell is-booked" style="--level:1"></i> You're going</li>
          <li><i class="heat__cell is-on"></i> Something's on</li>
          <li><i class="heat__cell is-today"></i> Today</li>
        </ul>
      </div>
      <div class="heat" role="group" aria-label="Calendar of the season, one square per day" style="--weeks:${weeks}">
        <div class="heat__days" aria-hidden="true"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span></div>
        <div class="heat__grid">${columns}</div>
      </div>
    </section>`;
}

/* ---------- timeline ---------- */

function stub(b, clashes) {
  const { event } = b;
  const { day, month, weekday } = dateParts(event);
  return html`
    <li class="stub" data-id="${b.id}" data-category="${event.category}">
      <p class="stub__date">${weekday} ${day} ${month}</p>
      <button class="stub__card" type="button" data-open="${b.id}" aria-label="Open pass for ${event.title}">
        <span class="stub__media print is-colour"><img src="${imageSrc(event, 480)}" alt="" width="480" height="320" loading="lazy"></span>
        <span class="stub__body">
          <span class="stub__title">${event.title}</span>
          <span class="stub__meta">${icons.pin}${event.city}</span>
          <span class="stub__meta">${icons.ticket}${pluralise(b.passes, "pass", "passes")}</span>
        </span>
        ${clashes.length > 0 && html`<span class="stub__clash" title="Tight timing with ${clashes.map((c) => c.title).join(", ")}">${icons.clock} Tight timing</span>`}
      </button>
      <p class="stub__time">${formatTime(event.start, event.timeZone)} ${event.city} time</p>
    </li>`;
}

function timeline(ahead) {
  if (!ahead.length) {
    return html`
      <section class="tickets-block" aria-labelledby="line-title">
        <div class="tickets-block__head"><h2 id="line-title">Coming up</h2></div>
        <div class="tickets-empty">
          <p class="tickets-empty__title">Nothing on the horizon.</p>
          <p>Pick something from the lineup and it'll appear here on your timeline.</p>
          <a class="btn btn-accent" href="index.html#lineup">Browse the lineup ${icons.arrow}</a>
        </div>
      </section>`;
  }
  const all = ahead.map((b) => ({ eventId: b.eventId }));
  return html`
    <section class="tickets-block" aria-labelledby="line-title">
      <div class="tickets-block__head">
        <h2 id="line-title">Coming up</h2>
        <div class="line__nav">
          <button class="dial__btn" type="button" data-line="-1" aria-label="Earlier booking">${icons.arrowLeft}</button>
          <button class="dial__btn" type="button" data-line="1" aria-label="Later booking">${icons.arrow}</button>
        </div>
      </div>
      <div class="line">
        <div class="line__clock" aria-hidden="true">
          <p class="line__label">Doors open</p>
          <div class="clock" id="clock" data-period="day">
            <svg viewBox="0 0 120 120">
              <circle class="clock__face" cx="60" cy="60" r="55"/>
              <g class="clock__stars">${[[34, 30], [86, 26], [92, 52], [28, 66], [80, 88], [44, 92]].map(([x, y], i) => html`<circle cx="${x}" cy="${y}" r="${i % 2 ? 0.9 : 1.3}"/>`)}</g>
              ${Array.from({ length: 60 }, (_, i) => html`<line class="clock__tick ${i % 5 ? "" : "is-hour"}" x1="60" y1="8" x2="60" y2="${i % 5 ? 11 : 14}" transform="rotate(${i * 6} 60 60)"/>`)}
              ${[["12", 60, 27], ["3", 95, 64], ["6", 60, 100], ["9", 25, 64]].map(([n, x, y]) => html`<text class="clock__num" x="${x}" y="${y}">${n}</text>`)}
              <g class="clock__sky" transform="translate(60 80)">
                <g class="clock__sun"><circle r="4.2"/>${Array.from({ length: 8 }, (_, i) => html`<line x1="0" y1="-6.5" x2="0" y2="-8.5" transform="rotate(${i * 45})"/>`)}</g>
                <path class="clock__moon" d="M2.5 -5.5a6 6 0 1 0 3 10.6A5 5 0 0 1 2.5 -5.5Z"/>
              </g>
              <line class="clock__hand clock__hand--hour" x1="60" y1="66" x2="60" y2="36"/>
              <line class="clock__hand clock__hand--minute" x1="60" y1="68" x2="60" y2="19"/>
              <circle class="clock__pin" cx="60" cy="60" r="3.2"/>
            </svg>
          </div>
          <p class="line__caption" id="clock-caption"></p>
        </div>
        <div class="line__track-wrap">
          <ol class="line__track" id="line-track" role="list">${ahead.map((b) => stub(b, findClashes(b.event, all)))}</ol>
        </div>
        <div class="line__calendar" aria-hidden="true">
          <p class="line__label">On the day</p>
          <div class="tear" id="tear"></div>
          <p class="line__caption" id="tear-caption"></p>
        </div>
      </div>
    </section>`;
}

/* ---------- past bookings ---------- */

function filmRoll(past) {
  const frames = past.length
    ? past.map(
        (b) => html`
          <li class="film__frame" data-category="${b.event.category}">
            <button type="button" data-open="${b.id}" aria-label="Open pass for ${b.event.title}">
              <span class="film__photo print"><img src="${imageSrc(b.event, 480)}" alt="" loading="lazy"></span>
              <span class="film__label">${b.event.title}<small>${formatShortDate(b.event)}</small></span>
            </button>
          </li>`,
      )
    : Array.from({ length: 4 }, () => html`<li class="film__frame is-blank"><span class="film__photo"></span></li>`);

  return html`
    <section class="tickets-block" aria-labelledby="film-title">
      <div class="tickets-block__head">
        <h2 id="film-title">Been there</h2>
        <p>${past.length ? "Every night out you've booked, kept on one reel." : "Events you've been to will roll in here once they're over."}</p>
      </div>
      <div class="film"><ol class="film__strip" role="list">${frames}</ol></div>
    </section>`;
}

/* ---------- focus: clock + tear-off calendar follow the ticket in the middle ---------- */

let focused = null;

// hands keep a running angle so they always turn the short way round
const hands = { hour: 0, minute: 0 };
const nearest = (from, to) => from + ((((to - from) % 360) + 540) % 360) - 180;

function setClock(event) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: event.timeZone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(event.start));
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  hands.hour = nearest(hands.hour, (hour % 12) * 30 + minute / 2);
  hands.minute = nearest(hands.minute, minute * 6);
  $(".clock__hand--hour").style.transform = `rotate(${hands.hour}deg)`;
  $(".clock__hand--minute").style.transform = `rotate(${hands.minute}deg)`;
  $("#clock").dataset.period = hour >= 6 && hour < 18 ? "day" : "night";
  $("#clock-caption").textContent = `${formatTime(event.start, event.timeZone)} in ${event.city}`;
}

function calendarPage(event) {
  const { day, month } = dateParts(event);
  const date = new Date(event.start);
  const year = new Intl.DateTimeFormat(undefined, { timeZone: event.timeZone, year: "numeric" }).format(date);
  const weekday = new Intl.DateTimeFormat(undefined, { timeZone: event.timeZone, weekday: "long" }).format(date);
  return `<div class="tear__page" data-category="${event.category}"><span class="tear__month">${month} ${year}</span><b class="tear__day">${day}</b><span class="tear__weekday">${weekday}</span></div>`;
}

function setCalendar(event, direction) {
  const tear = $("#tear");
  const current = $(".tear__page:last-child", tear);
  tear.insertAdjacentHTML(direction > 0 ? "afterbegin" : "beforeend", calendarPage(event));
  $("#tear-caption").textContent = relativeTime(event.start);
  if (!current || prefersReducedMotion()) {
    current?.remove();
    return;
  }
  if (direction > 0) {
    // going forward: tear the old page off the top
    current.classList.add("is-tearing");
    current.addEventListener("animationend", () => current.remove(), { once: true });
  } else {
    // going back: the earlier page sticks back on over the top
    const page = $(".tear__page:last-child", tear);
    page.classList.add("is-sticking");
    page.addEventListener("animationend", () => {
      page.classList.remove("is-sticking");
      current.remove();
    }, { once: true });
  }
}

function focusStub(item) {
  if (!item || item === focused) return;
  const list = bookings();
  const from = focused ? list.findIndex((b) => b.id === focused.dataset.id) : -1;
  const to = list.findIndex((b) => b.id === item.dataset.id);
  focused?.classList.remove("is-focused");
  item.classList.add("is-focused");
  focused = item;
  const { event } = list[to];
  setClock(event);
  setCalendar(event, to >= from ? 1 : -1);
}

function initTimeline() {
  const track = $("#line-track");
  if (!track) return;
  const items = $$(".stub", track);
  let frame;
  const pick = () => {
    frame = null;
    const box = track.getBoundingClientRect();
    const centre = box.left + Math.min(box.width / 2, 220);
    const nearest = items.reduce((best, item) => {
      const r = item.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - centre);
      return d < best.d ? { item, d } : best;
    }, { item: items[0], d: Infinity });
    focusStub(nearest.item);
  };
  track.addEventListener("scroll", () => (frame ??= requestAnimationFrame(pick)), { passive: true });
  items.forEach((item) => item.addEventListener("pointerenter", () => focusStub(item)));
  focusStub(items[0]);

  root.querySelectorAll("[data-line]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const index = items.indexOf(focused) + Number(btn.dataset.line);
      const next = items[Math.max(0, Math.min(items.length - 1, index))];
      next.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", inline: "center", block: "nearest" });
      focusStub(next);
    }),
  );
}

/* ---------- pass dialog + cancelling ---------- */

function openPass(id) {
  const b = bookings().find((x) => x.id === id);
  if (!b) return;
  const past = isPast(b.event);
  $("#dialog-body").innerHTML = html`
    <h2 class="visually-hidden" id="dialog-title">Pass for ${b.event.title}</h2>
    ${passTicket({ event: b.event, name: b.name, passes: b.passes, bookingId: b.id })}
    <p class="pass-dialog__when">${formatDate(b.event)}</p>
    ${b.note && html`<p class="pass-dialog__note">Your note: ${b.note}</p>`}
    <div class="pass-dialog__actions" id="dialog-actions">
      <a class="btn btn-small btn-ghost" href="event.html?id=${encodeURIComponent(b.event.id)}">Event details</a>
      ${!past && html`<button class="btn btn-small btn-ghost" type="button" data-calendar>${icons.download} Add to calendar</button>`}
      ${!past && html`<button class="btn btn-small btn-danger" type="button" data-cancel>Cancel booking</button>`}
    </div>`;
  dialog.dataset.id = id;
  dialog.showModal();
}

function confirmCancel() {
  const id = dialog.dataset.id;
  const actions = $("#dialog-actions");
  actions.innerHTML = html`
    <p class="pass-dialog__confirm">Cancel this booking? ${(bookings().find((b) => b.id === id)?.passes ?? 1) > 1 ? "Those spots go" : "The spot goes"} back on sale.</p>
    <button class="btn btn-small btn-danger" type="button" data-cancel-yes>Yes, cancel it</button>
    <button class="btn btn-small btn-ghost" type="button" data-cancel-no>Keep it</button>`;
  $("[data-cancel-no]", actions).focus();
}

function initDialog() {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog || e.target.closest("[data-close]")) return dialog.close();
    const b = bookings().find((x) => x.id === dialog.dataset.id);
    if (e.target.closest("[data-calendar]")) {
      downloadIcs(b.event);
      toast("Calendar file downloaded. Open it to add the event.");
    }
    if (e.target.closest("[data-cancel]")) confirmCancel();
    if (e.target.closest("[data-cancel-no]")) openPass(b.id);
    if (e.target.closest("[data-cancel-yes]")) {
      dialog.close();
      removeRegistration(b.id);
      toast(`Booking ${b.id} cancelled. Those spots are back on sale.`);
    }
  });
}

/* ---------- page ---------- */

function render() {
  const list = bookings();
  const ahead = list.filter((b) => !isPast(b.event));
  const past = list.filter((b) => isPast(b.event));
  focused = null;
  renderSummary(list, ahead);
  root.innerHTML = html`
    ${timeline(ahead)}
    ${heatmap(ahead)}
    ${filmRoll(past)}
    ${list.length > 0 && html`
      <div class="tickets-foot">
        <p>Bookings live in this browser only. Clearing your browser data removes them too.</p>
        <button class="btn btn-small btn-ghost" type="button" data-clear>Clear all bookings</button>
      </div>`}`;
  initTimeline();
}

root.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) return openPass(open.dataset.open);
  const jump = e.target.closest("[data-jump]");
  if (jump) {
    const item = $(`.stub[data-id="${jump.dataset.jump}"]`);
    item?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", inline: "center", block: "center" });
    focusStub(item);
    return;
  }
  if (e.target.closest("[data-clear]")) {
    const button = e.target.closest("[data-clear]");
    if (button.dataset.armed) {
      clearRegistrations();
      toast("All bookings cleared.");
      return;
    }
    button.dataset.armed = "true";
    button.textContent = "Tap again to clear everything";
    setTimeout(() => {
      if (!button.isConnected) return;
      delete button.dataset.armed;
      button.textContent = "Clear all bookings";
    }, 4000);
  }
});

document.addEventListener("registrations:change", render);
initDialog();
render();
