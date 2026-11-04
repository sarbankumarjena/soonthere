import { toast } from "../app.js";
import { $, $$, html, prefersReducedMotion } from "../lib/dom.js";
import { icons } from "../lib/icons.js";
import { dateParts, formatDate, formatShortDate, formatTime, pad, pluralise, relativeTime } from "../lib/format.js";
import { events, findClashes, getEvent, imageSrc, isPast, upcoming } from "../lib/catalog.js";
import { removeRegistration, removeRegistrationsWhere } from "../lib/storage.js";
import { currentUser, myBookings } from "../lib/auth.js";
import { downloadIcs } from "../lib/calendar.js";
import { passTicket } from "../components/pass.js";

const root = $("#tickets-root");
const dialog = $("#pass-dialog");
const DAY = 86_400_000;

// yyyy-mm-dd in a given time zone, so an event lands on the day it happens locally
const dayKey = (date, timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(date));

function bookings() {
  return myBookings()
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
  const user = currentUser();
  $("#who").innerHTML = user
    ? html`Signed in as <b>${user.name}</b>. These are the bookings made on your account or with ${user.email}.`
    : html`You're browsing as a guest, so these are the bookings made on this device without an account. <a href="account.html?next=tickets.html">Sign in</a> to keep them together.`;
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
        <div class="side-dial side-dial--time" id="time-dial" aria-hidden="true">
          <div class="side-dial__wheel">
            ${Array.from({ length: 48 }, (_, i) => html`<i class="side-dial__tick ${i % 2 ? "" : "is-major"}" style="--a:${i * 7.5}deg"></i>`)}
            ${Array.from({ length: 8 }, (_, i) => html`<span class="side-dial__num" style="--a:${i * 45}deg">${pad(i * 3)}</span>`)}
          </div>
          <div class="side-dial__hub">
            <span class="side-dial__k">Doors</span>
            <b class="side-dial__big" id="time-big"></b>
            <span class="side-dial__small" id="time-small"></span>
          </div>
          <span class="side-dial__mark"></span>
        </div>
        <div class="line__track-wrap">
          <ol class="line__track" id="line-track" role="list">${ahead.map((b) => stub(b, findClashes(b.event, all)))}</ol>
        </div>
        <div class="side-dial side-dial--date" id="date-dial" aria-hidden="true">
          <div class="side-dial__wheel" id="date-wheel"></div>
          <div class="side-dial__hub">
            <span class="side-dial__k" id="date-month"></span>
            <b class="side-dial__big" id="date-big"></b>
            <span class="side-dial__small" id="date-small"></span>
          </div>
          <span class="side-dial__mark"></span>
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
        ${past.length > 0 && html`<p>Every night out you've booked, kept on one reel.</p>`}
      </div>
      <div class="film ${past.length ? "" : "is-empty"}">
        <ol class="film__strip" role="list">${frames}</ol>
        ${!past.length && html`
          <div class="film__empty">
            <p class="film__empty-title">Nothing on the reel yet.</p>
            <p>You haven't been to anything with SoonThere so far. After an event you've booked has happened, it shows up here.</p>
          </div>`}
      </div>
    </section>`;
}

/* ---------- focus: the two side dials follow the ticket in the middle ---------- */

let focused = null;

// each wheel keeps a running angle so it always turns the short way round
const turn = { time: 0, date: 0 };
const nearest = (from, to) => from + ((((to - from) % 360) + 540) % 360) - 180;

function localParts(event) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: event.timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23",
  }).formatToParts(new Date(event.start));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

// hours run round a 24-hour bezel; the wheel turns so the start time faces the timeline
function setTime(event) {
  const { hour, minute } = localParts(event);
  turn.time = nearest(turn.time, 90 - (hour + minute / 60) * 15);
  $("#time-dial .side-dial__wheel").style.transform = `rotate(${turn.time}deg)`;
  $("#time-dial").dataset.period = hour >= 6 && hour < 19 ? "day" : "night";
  const [big, ...rest] = formatTime(event.start, event.timeZone).split(" ");
  $("#time-big").textContent = big;
  $("#time-small").textContent = `${rest.join(" ")} ${event.city}`.trim();
}

// the days of the event's month run round the second wheel, with a dot on every booked day
let wheelMonth = "";

function setDate(event) {
  const { year, month, day } = localParts(event);
  const days = new Date(year, month, 0).getDate();
  const step = 360 / days;
  const key = `${year}-${month}`;
  const wheel = $("#date-wheel");

  if (key !== wheelMonth) {
    const booked = new Set(
      bookings()
        .map((b) => localParts(b.event))
        .filter((p) => p.year === year && p.month === month)
        .map((p) => p.day),
    );
    const labelled = (d) => d === 1 || d % 5 === 0 || booked.has(d);
    wheel.innerHTML = Array.from({ length: days }, (_, i) => {
      const d = i + 1;
      return `<i class="side-dial__tick is-major" style="--a:${i * step}deg"></i>${labelled(d) ? `<span class="side-dial__num ${booked.has(d) ? "is-booked" : ""}" style="--a:${i * step}deg">${d}</span>` : ""}${booked.has(d) ? `<b class="side-dial__dot" style="--a:${i * step}deg"></b>` : ""}`;
    }).join("");
    wheelMonth = key;
  }

  turn.date = nearest(turn.date, 270 - (day - 1) * step);
  wheel.style.transform = `rotate(${turn.date}deg)`;
  const date = new Date(event.start);
  $("#date-month").textContent = new Intl.DateTimeFormat(undefined, { timeZone: event.timeZone, month: "short", year: "numeric" }).format(date);
  $("#date-big").textContent = day;
  $("#date-small").textContent = new Intl.DateTimeFormat(undefined, { timeZone: event.timeZone, weekday: "long" }).format(date);
  $("#date-dial").dataset.category = event.category;
}

function focusStub(item) {
  if (!item || item === focused) return;
  const booking = bookings().find((b) => b.id === item.dataset.id);
  focused?.classList.remove("is-focused");
  item.classList.add("is-focused");
  focused = item;
  setTime(booking.event);
  setDate(booking.event);
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
  wheelMonth = "";
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
      const ids = new Set(bookings().map((b) => b.id));
      removeRegistrationsWhere((r) => ids.has(r.id));
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
document.addEventListener("auth:change", render);
initDialog();
render();
