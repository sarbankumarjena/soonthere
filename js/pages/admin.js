import { toast } from "../app.js";
import { $, $$, html, debounce } from "../lib/dom.js";
import { icons } from "../lib/icons.js";
import { formatShortDate, formatTime, pluralise } from "../lib/format.js";
import {
  byStart, categories, deleteEvent, events, getCategory, getEvent, getStatus, imageSrc, isEdited, isPast, photos,
  resetEvents, seatsLeft, upsertEvent,
} from "../lib/catalog.js";
import { getRegistrations, removeRegistration, removeRegistrationsFor, updateRegistration } from "../lib/storage.js";
import { currentUser, getUsers, setRole } from "../lib/auth.js";

const root = $("#admin-root");
const dialog = $("#event-dialog");
const form = $("#event-form");
let tab = "events";
let query = "";
let editing = null;
let checkinEvent = "";
let lastScan = null;

/* ---------- helpers ---------- */

const enrolled = (e) => e.capacity - seatsLeft(e);

// "at 9:41 PM" for today's check-ins, "on 1 Nov, 9:41 PM" for anything older
function checkedInLabel(iso) {
  const at = new Date(iso);
  const time = at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (at.toDateString() === new Date().toDateString()) return `at ${time}`;
  return `on ${at.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}
const bookingsFor = (id) => getRegistrations().filter((r) => r.eventId === id);
const passesOf = (list) => list.reduce((sum, r) => sum + r.passes, 0);
const timeZones = [...new Set([...events.map((e) => e.timeZone), "UTC", "Europe/Madrid", "Asia/Tokyo", "Asia/Singapore", "Asia/Dubai", "America/Los_Angeles", "America/Chicago", "America/Toronto"])].sort();
const currencies = [...new Set([...events.map((e) => e.currency), "USD", "EUR", "GBP", "INR", "JPY", "SGD", "AED", "CAD"])].sort();

const statusLabel = { open: "On sale", "few-left": "Few left", "sold-out": "Sold out", ended: "Ended" };

function parts(date, timeZone) {
  const list = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(date));
  return Object.fromEntries(list.filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]));
}

// "2026-12-03" + "19:30" in Europe/Berlin -> UTC ISO string
function zonedToUtc(dateStr, timeStr, timeZone) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offset = (ts) => {
    const p = parts(ts, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ts;
  };
  let ts = wall - offset(wall);
  ts = wall - offset(ts);
  return new Date(ts).toISOString().replace(".000Z", "Z");
}

const two = (n) => String(n).padStart(2, "0");

function slug(title) {
  const base = title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "event";
  let id = base;
  for (let i = 2; getEvent(id); i++) id = `${base}-${i}`;
  return id;
}

function downloadCsv(rows, name) {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- overview ---------- */

function overview() {
  const regs = getRegistrations();
  const live = events.filter((e) => !isPast(e));
  const passes = passesOf(regs);
  const checked = passesOf(regs.filter((r) => r.checkedInAt));
  const stats = [
    [live.length, "events on sale or coming up", `${events.length} in total`],
    [passes, "passes booked on this site", pluralise(regs.length, "booking")],
    [checked, "passes checked in", passes ? `${Math.round((checked / passes) * 100)}% of booked` : "none yet"],
    [getUsers().length, "accounts", pluralise(getUsers().filter((u) => u.role === "admin").length, "admin")],
  ];
  return html`<ul class="admin-stats" role="list">${stats.map(([n, label, sub]) => html`<li><b>${n}</b><span>${label}</span><small>${sub}</small></li>`)}</ul>`;
}

/* ---------- events ---------- */

function eventsTab() {
  // what's coming up first, then what has already happened, most recent first
  const sorted = [...events].sort(byStart);
  const list = [...sorted.filter((e) => !isPast(e)), ...sorted.filter((e) => isPast(e)).reverse()]
    .filter((e) => !query || `${e.title} ${e.city} ${e.venue}`.toLowerCase().includes(query));
  return html`
    <div class="admin-toolbar">
      <label class="admin-search">${icons.search}<span class="visually-hidden">Search events</span><input type="search" placeholder="Search events" value="${query}" data-search></label>
      ${isEdited() && html`<button class="btn btn-small btn-ghost" type="button" data-reset>Restore the original lineup</button>`}
      <button class="btn btn-small btn-accent" type="button" data-new>${icons.plus} Add event</button>
    </div>
    <ul class="admin-list" role="list">
      ${list.map((e) => {
        const status = getStatus(e);
        const local = bookingsFor(e.id);
        const fill = Math.round((enrolled(e) / e.capacity) * 100);
        return html`
          <li class="admin-row" data-category="${e.category}">
            <img class="admin-row__thumb" src="${imageSrc(e, 480)}" alt="" loading="lazy">
            <div class="admin-row__main">
              <p class="admin-row__title"><a href="event.html?id=${encodeURIComponent(e.id)}">${e.title}</a></p>
              <p class="admin-row__meta">${formatShortDate(e)}, ${formatTime(e.start, e.timeZone)} <span>${e.venue}, ${e.city}</span></p>
            </div>
            <span class="chip" data-category="${e.category}">${getCategory(e.category)?.label}</span>
            <div class="admin-row__fill">
              <span class="seats__bar" aria-hidden="true"><span style="--fill:${fill}%"></span></span>
              <span>${enrolled(e).toLocaleString()} / ${e.capacity.toLocaleString()} booked</span>
              <small>${pluralise(passesOf(local), "pass", "passes")} booked on this site</small>
            </div>
            <span class="admin-status is-${status}">${statusLabel[status]}</span>
            <div class="admin-row__actions">
              <button class="btn btn-small btn-ghost" type="button" data-checkin-for="${e.id}">Tickets</button>
              <button class="btn btn-small btn-ghost" type="button" data-edit="${e.id}">Edit</button>
              <button class="btn btn-small btn-danger" type="button" data-delete="${e.id}">Remove</button>
            </div>
          </li>`;
      })}
      ${!list.length && html`<li class="admin-empty">No events match that search.</li>`}
    </ul>`;
}

/* ---------- check-in ---------- */

function checkinTab() {
  const sorted = [...events].sort(byStart);
  const options = [...sorted.filter((e) => !isPast(e)), ...sorted.filter((e) => isPast(e)).reverse()];
  const list = getRegistrations().filter((r) => !checkinEvent || r.eventId === checkinEvent);
  const event = getEvent(checkinEvent);
  return html`
    <div class="checkin">
      <form class="checkin__scan" id="checkin-form" novalidate>
        <label for="checkin-code">Booking number</label>
        <div class="checkin__row">
          <input id="checkin-code" name="code" placeholder="ST-XXXXXX" autocomplete="off" spellcheck="false" autocapitalize="characters">
          <button class="btn btn-accent" type="submit">Check in</button>
        </div>
        <div class="checkin__result ${lastScan ? `is-${lastScan.kind}` : ""}" id="checkin-result" role="status" aria-live="polite">${lastScan && html`<b>${lastScan.title}</b><span>${lastScan.text}</span>`}</div>
      </form>
      <div class="checkin__list">
        <div class="admin-toolbar">
          <div class="select-field">
            <label class="visually-hidden" for="checkin-event">Event</label>
            <select id="checkin-event" data-checkin-event>
              <option value="">All events</option>
              ${options.map((e) => html`<option value="${e.id}" ${e.id === checkinEvent ? "selected" : ""}>${e.title}</option>`)}
            </select>
          </div>
          <p class="admin-count">${event ? `${passesOf(list.filter((r) => r.checkedInAt))} of ${passesOf(list)} passes in` : pluralise(list.length, "booking")}</p>
        </div>
        ${attendees(list)}
      </div>
    </div>`;
}

function attendees(list, { cancel = false } = {}) {
  if (!list.length) return html`<p class="admin-empty">No bookings here yet. They appear as people register on this device.</p>`;
  return html`
    <ul class="admin-list admin-list--compact" role="list">
      ${list.map((r) => {
        const e = getEvent(r.eventId);
        return html`
          <li class="admin-row admin-row--booking ${r.checkedInAt ? "is-in" : ""}">
            <span class="mono admin-row__code">${r.id}</span>
            <div class="admin-row__main">
              <p class="admin-row__title">${r.name} <small>${pluralise(r.passes, "pass", "passes")}</small></p>
              <p class="admin-row__meta">${r.email} <span>${r.phone}</span></p>
            </div>
            <p class="admin-row__meta">${e?.title ?? "Removed event"}<span>${r.userId ? "Member" : "Guest"}</span></p>
            <span class="admin-status ${r.checkedInAt ? "is-open" : ""}">${r.checkedInAt ? `In ${checkedInLabel(r.checkedInAt)}` : "Not in yet"}</span>
            <div class="admin-row__actions">
              <button class="btn btn-small btn-ghost" type="button" data-toggle-in="${r.id}">${r.checkedInAt ? "Undo" : "Check in"}</button>
              ${cancel && html`<button class="btn btn-small btn-danger" type="button" data-cancel="${r.id}">Cancel</button>`}
            </div>
          </li>`;
      })}
    </ul>`;
}

function scan(code) {
  const id = code.trim().toUpperCase().replace(/^ST-?/, "ST-");
  const booking = getRegistrations().find((r) => r.id === id);
  const say = (kind, title, text) => {
    lastScan = { kind, title, text };
    render();
  };
  if (!booking) return say("bad", "Not found", `There's no booking ${id || "with that number"} on this site.`);
  const event = getEvent(booking.eventId);
  if (checkinEvent && booking.eventId !== checkinEvent) return say("warn", "Wrong event", `${booking.id} is for ${event?.title ?? "another event"}.`);
  if (booking.checkedInAt) return say("warn", "Already used", `${booking.name} was checked in ${checkedInLabel(booking.checkedInAt)}.`);
  lastScan = { kind: "ok", title: "Admitted", text: `${booking.name}, ${pluralise(booking.passes, "pass", "passes")} for ${event?.title ?? "this event"}.` };
  updateRegistration(booking.id, { checkedInAt: new Date().toISOString() });
}

/* ---------- bookings + members ---------- */

function bookingsTab() {
  const list = getRegistrations()
    .filter((r) => !query || `${r.id} ${r.name} ${r.email}`.toLowerCase().includes(query))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return html`
    <div class="admin-toolbar">
      <label class="admin-search">${icons.search}<span class="visually-hidden">Search bookings</span><input type="search" placeholder="Name, email or booking number" value="${query}" data-search></label>
      <button class="btn btn-small btn-ghost" type="button" data-export ${getRegistrations().length ? "" : "disabled"}>${icons.download} Export CSV</button>
    </div>
    ${attendees(list, { cancel: true })}`;
}

function membersTab() {
  const me = currentUser();
  const regs = getRegistrations();
  return html`
    <ul class="admin-list admin-list--compact" role="list">
      ${getUsers().map((u) => html`
        <li class="admin-row admin-row--member">
          <span class="profile__avatar" aria-hidden="true">${u.name.charAt(0).toUpperCase()}</span>
          <div class="admin-row__main">
            <p class="admin-row__title">${u.name} ${u.id === me.id && html`<small>you</small>`}</p>
            <p class="admin-row__meta">${u.email}<span>Joined ${new Date(u.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span></p>
          </div>
          <p class="admin-row__meta">${pluralise(regs.filter((r) => r.userId === u.id || r.email === u.email).length, "booking")}</p>
          <span class="chip">${u.role === "admin" ? "Admin" : "Member"}</span>
          <div class="admin-row__actions">
            ${u.id !== me.id && html`<button class="btn btn-small btn-ghost" type="button" data-role="${u.id}">${u.role === "admin" ? "Remove admin" : "Make admin"}</button>`}
          </div>
        </li>`)}
    </ul>`;
}

/* ---------- page ---------- */

const tabs = [
  ["events", "Events"],
  ["checkin", "Check-in"],
  ["bookings", "Bookings"],
  ["members", "Members"],
];

function render() {
  const user = currentUser();
  if (user?.role !== "admin") {
    root.innerHTML = html`
      <section class="admin-locked">
        <p class="eyebrow"><span>Admin</span><span>Staff only</span></p>
        <h1>This area is for organisers.</h1>
        <p>${user ? `You're signed in as ${user.name}, which is a member account.` : "Sign in with an admin account to manage events and check tickets."}</p>
        <a class="btn btn-accent" href="account.html?next=admin.html">${user ? "Switch account" : "Sign in"} ${icons.arrow}</a>
      </section>`;
    return;
  }
  const focus = document.activeElement?.matches("[data-search]");
  root.innerHTML = html`
    <header class="admin-head">
      <div>
        <p class="eyebrow"><span>Admin</span><span>${user.name}</span></p>
        <h1>Run the night.</h1>
      </div>
      <p class="admin-head__note">Everything here is saved in this browser. Changes to the lineup show up across the site straight away.</p>
    </header>
    ${overview()}
    <div class="admin-tabs" role="tablist" aria-label="Admin sections">
      ${tabs.map(([id, label]) => html`<button type="button" role="tab" id="tab-${id}" aria-controls="admin-panel" aria-selected="${String(tab === id)}" data-tab="${id}">${label}</button>`)}
    </div>
    <section class="admin-panel" id="admin-panel" role="tabpanel" aria-labelledby="tab-${tab}">
      ${{ events: eventsTab, checkin: checkinTab, bookings: bookingsTab, members: membersTab }[tab]()}
    </section>`;
  if (focus) {
    const input = $("[data-search]", root);
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }
}

/* ---------- event form ---------- */

function formField(name, label, input, hint = "") {
  return html`
    <div class="field" data-field="${name}">
      <label for="ef-${name}">${label}</label>
      ${input}
      ${hint && html`<p class="field__hint">${hint}</p>`}
      <p class="field__error" id="ef-${name}-error"></p>
    </div>`;
}

const text = (name, value = "", extra = "") => html`<input id="ef-${name}" name="${name}" value="${value}" aria-describedby="ef-${name}-error" ${extra}>`;
const area = (name, value = "", rows = 3) => html`<textarea id="ef-${name}" name="${name}" rows="${rows}" aria-describedby="ef-${name}-error">${value}</textarea>`;
const select = (name, options, value) => html`
  <div class="select-field select-field--large"><select id="ef-${name}" name="${name}">${options.map(([v, l]) => html`<option value="${v}" ${v === value ? "selected" : ""}>${l}</option>`)}</select></div>`;

function openEventForm(id = null) {
  editing = id ? getEvent(id) : null;
  const e = editing ?? { category: "music", timeZone: "Europe/London", currency: "GBP", capacity: 100, booked: 0, price: 0, image: photos[0], description: [], highlights: [], schedule: [], tags: [] };
  const p = editing ? parts(e.start, e.timeZone) : null;
  const date = p ? `${p.year}-${two(p.month)}-${two(p.day)}` : "";
  const time = p ? `${two(p.hour)}:${two(p.minute)}` : "19:00";
  const hours = editing ? Math.round(((new Date(e.end) - new Date(e.start)) / 3_600_000) * 2) / 2 : 3;

  $("#event-dialog-title").textContent = editing ? `Edit ${editing.title}` : "New event";
  $("#event-form-error").textContent = "";
  $("#event-form-body").innerHTML = html`
    <fieldset class="form-section"><legend><span>01</span> The basics</legend>
      ${formField("title", "Event name", text("title", e.title, 'maxlength="80"'))}
      <div class="field-row">
        ${formField("category", "Category", select("category", categories.map((c) => [c.id, c.label]), e.category))}
        ${formField("organiser", "Organiser", text("organiser", e.organiser))}
      </div>
      ${formField("summary", "Short description", area("summary", e.summary, 2), "One or two lines. Shown on the event cards.")}
      <label class="check"><input type="checkbox" name="featured" ${e.featured ? "checked" : ""}><span class="check__box" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></span><span>Show it under Featured events on the home page</span></label>
    </fieldset>
    <fieldset class="form-section"><legend><span>02</span> When and where</legend>
      <div class="field-row field-row--3">
        ${formField("date", "Date", text("date", date, 'type="date"'))}
        ${formField("time", "Doors (local time)", text("time", time, 'type="time"'))}
        ${formField("hours", "Length (hours)", text("hours", hours, 'type="number" min="0.5" max="72" step="0.5"'))}
      </div>
      ${formField("timeZone", "Time zone", select("timeZone", timeZones.map((z) => [z, z.replace(/_/g, " ")]), e.timeZone))}
      <div class="field-row">
        ${formField("venue", "Venue", text("venue", e.venue))}
        ${formField("area", "Area", text("area", e.area))}
      </div>
      <div class="field-row">
        ${formField("city", "City", text("city", e.city))}
        ${formField("country", "Country", text("country", e.country))}
      </div>
    </fieldset>
    <fieldset class="form-section"><legend><span>03</span> Tickets</legend>
      <div class="field-row field-row--3">
        ${formField("price", "Price (0 for free)", text("price", e.price, 'type="number" min="0" step="0.01"'))}
        ${formField("currency", "Currency", select("currency", currencies.map((c) => [c, c]), e.currency))}
        ${formField("capacity", "Capacity", text("capacity", e.capacity, 'type="number" min="1" step="1"'))}
      </div>
      ${formField("booked", "Already sold elsewhere", text("booked", e.booked, 'type="number" min="0" step="1"'), "Spots taken before this site's own bookings, e.g. at the door or by partners.")}
    </fieldset>
    <fieldset class="form-section"><legend><span>04</span> The page</legend>
      ${formField("description", "About", area("description", e.description.join("\n\n"), 5), "Leave a blank line between paragraphs.")}
      ${formField("highlights", "What to expect", area("highlights", e.highlights.join("\n"), 3), "One per line.")}
      ${formField("schedule", "On the day", area("schedule", e.schedule.map((s) => `${s.time} ${s.item}`).join("\n"), 4), "One per line, starting with the time, like 19:00 Doors open.")}
      ${formField("tags", "Tags", text("tags", e.tags.join(", ")), "Separated by commas. Used by search.")}
    </fieldset>
    <fieldset class="form-section"><legend><span>05</span> Cover photo</legend>
      <div class="photo-pick" role="radiogroup" aria-label="Cover photo">
        ${photos.map((ph) => html`<label class="photo-pick__item"><input type="radio" name="image" value="${ph}" ${!e.imageData && e.image === ph ? "checked" : ""}><img src="assets/images/events/${ph}-480.webp" alt="${ph.replace(/-/g, " ")}"></label>`)}
        <label class="photo-pick__item photo-pick__upload"><input type="radio" name="image" value="upload" ${e.imageData ? "checked" : ""}>
          ${e.imageData ? html`<img src="${e.imageData}" alt="Uploaded photo" id="upload-preview">` : html`<span id="upload-preview">${icons.plus} Upload</span>`}</label>
      </div>
      <input type="file" id="ef-file" accept="image/*" class="visually-hidden">
      <p class="field__hint">Uploads are cropped to 3:2 and kept in this browser.</p>
      <input type="hidden" name="imageData" value="${e.imageData ?? ""}">
      <input type="hidden" name="imageAlt" value="${e.imageAlt ?? ""}">
    </fieldset>`;
  dialog.showModal();
  $("#ef-title").focus();
}

async function readPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const canvas = Object.assign(document.createElement("canvas"), { width: 960, height: 640 });
  const scale = Math.max(960 / bitmap.width, 640 / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  canvas.getContext("2d").drawImage(bitmap, (960 - w) / 2, (640 - h) / 2, w, h);
  return canvas.toDataURL("image/webp", 0.78);
}

function collect() {
  const data = Object.fromEntries(new FormData(form));
  const errors = {};
  const need = (key, label, min = 1, max = 120) => {
    const v = (data[key] ?? "").trim();
    if (v.length < min) errors[key] = `${label} is needed.`;
    else if (v.length > max) errors[key] = `Keep it under ${max} characters.`;
    return v;
  };
  const num = (key, { min = 0, int = false } = {}) => {
    const v = Number(data[key]);
    if (data[key] === "" || !Number.isFinite(v) || v < min || (int && !Number.isInteger(v))) errors[key] = int ? `Use a whole number of ${min} or more.` : `Use a number of ${min} or more.`;
    return v;
  };
  const title = need("title", "A name", 3, 80);
  const summary = need("summary", "A short description", 10, 180);
  const venue = need("venue", "The venue");
  const city = need("city", "The city");
  const country = need("country", "The country");
  const area = (data.area ?? "").trim() || city;
  const organiser = (data.organiser ?? "").trim() || "SoonThere";
  if (!data.date) errors.date = "Pick a date.";
  if (!data.time) errors.time = "Pick a time.";
  const hours = num("hours", { min: 0.5 });
  const price = num("price");
  const capacity = num("capacity", { min: 1, int: true });
  const booked = num("booked", { int: true });
  if (!errors.booked && !errors.capacity && booked > capacity) errors.booked = "That's more than the capacity.";
  const description = (data.description ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (!description.length) errors.description = "Write a paragraph or two about it.";
  const schedule = (data.schedule ?? "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d{1,2}[:.]\d{2})\s+(.+)$/);
    return m ? { time: m[1].replace(".", ":").padStart(5, "0"), item: m[2] } : null;
  });
  if (schedule.includes(null)) errors.schedule = "Start each line with a time, like 19:00 Doors open.";
  if (data.image === "upload" && !data.imageData) errors.image = "Choose a photo to upload, or pick one of ours.";

  let start = "";
  let end = "";
  if (!errors.date && !errors.time && !errors.hours) {
    start = zonedToUtc(data.date, data.time, data.timeZone);
    end = new Date(new Date(start).getTime() + hours * 3_600_000).toISOString().replace(".000Z", "Z");
  }
  const uploaded = data.image === "upload";
  return {
    errors,
    event: {
      id: editing?.id ?? slug(title),
      title, category: data.category, featured: data.featured === "on", start, end, timeZone: data.timeZone,
      venue, area, city, country, price, currency: data.currency, capacity, booked, organiser,
      image: uploaded ? "custom" : data.image,
      ...(uploaded && { imageData: data.imageData }),
      imageAlt: data.imageAlt || `${title} at ${venue}`,
      summary, description,
      highlights: (data.highlights ?? "").split("\n").map((l) => l.trim()).filter(Boolean),
      schedule: schedule.filter(Boolean),
      tags: (data.tags ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
    },
  };
}

function saveEvent(e) {
  e.preventDefault();
  const { errors, event } = collect();
  $$(".field", form).forEach((f) => {
    const key = f.dataset.field;
    const slot = $(".field__error", f);
    f.classList.toggle("has-error", Boolean(errors[key]));
    if (slot) slot.innerHTML = errors[key] ? html`${icons.close}<span>${errors[key]}</span>` : "";
  });
  const keys = Object.keys(errors);
  if (keys.length) {
    $("#event-form-error").textContent = errors.image ?? `${pluralise(keys.length, "thing")} to fix before saving.`;
    $(`[name="${keys[0]}"]`, form)?.focus();
    return;
  }
  if (!upsertEvent(event)) {
    $("#event-form-error").textContent = "The browser ran out of room to save this. Try a smaller photo.";
    return;
  }
  dialog.close();
  toast(editing ? `${event.title} updated.` : `${event.title} added to the lineup.`);
  render();
}

/* ---------- events ---------- */

root.addEventListener("click", (e) => {
  const t = e.target;
  const tabBtn = t.closest("[data-tab]");
  if (tabBtn) {
    tab = tabBtn.dataset.tab;
    query = "";
    lastScan = null;
    render();
    $(`#tab-${tab}`).focus();
    return;
  }
  if (t.closest("[data-new]")) return openEventForm();
  const edit = t.closest("[data-edit]");
  if (edit) return openEventForm(edit.dataset.edit);
  const del = t.closest("[data-delete]");
  if (del) {
    const event = getEvent(del.dataset.delete);
    const count = bookingsFor(event.id).length;
    if (del.dataset.armed) {
      deleteEvent(event.id);
      removeRegistrationsFor(event.id);
      toast(`${event.title} removed${count ? `, along with ${pluralise(count, "booking")}` : ""}.`);
      return render();
    }
    del.dataset.armed = "true";
    del.textContent = count ? `Remove + ${pluralise(count, "booking")}?` : "Sure?";
    setTimeout(() => {
      if (!del.isConnected) return;
      delete del.dataset.armed;
      del.textContent = "Remove";
    }, 4000);
    return;
  }
  const checkFor = t.closest("[data-checkin-for]");
  if (checkFor) {
    tab = "checkin";
    checkinEvent = checkFor.dataset.checkinFor;
    render();
    return $("#checkin-code")?.focus();
  }
  if (t.closest("[data-reset]")) {
    resetEvents();
    toast("Original lineup restored.");
    return render();
  }
  const toggle = t.closest("[data-toggle-in]");
  if (toggle) {
    const r = getRegistrations().find((x) => x.id === toggle.dataset.toggleIn);
    updateRegistration(r.id, { checkedInAt: r.checkedInAt ? null : new Date().toISOString() });
    return;
  }
  const cancel = t.closest("[data-cancel]");
  if (cancel) {
    if (!cancel.dataset.armed) {
      cancel.dataset.armed = "true";
      cancel.textContent = "Sure?";
      return;
    }
    removeRegistration(cancel.dataset.cancel);
    toast(`Booking ${cancel.dataset.cancel} cancelled.`);
    return;
  }
  if (t.closest("[data-export]")) {
    const rows = [["Booking", "Event", "Name", "Email", "Phone", "Passes", "Booked at", "Checked in", "Account"]];
    getRegistrations().forEach((r) => rows.push([r.id, getEvent(r.eventId)?.title ?? r.eventId, r.name, r.email, r.phone, r.passes, r.createdAt, r.checkedInAt ?? "", r.userId ? "member" : "guest"]));
    downloadCsv(rows, "soonthere-bookings.csv");
    return;
  }
  const role = t.closest("[data-role]");
  if (role) {
    const user = getUsers().find((u) => u.id === role.dataset.role);
    setRole(user.id, user.role === "admin" ? "member" : "admin");
    toast(user.role === "admin" ? `${user.name} is a member now.` : `${user.name} is an admin now.`);
  }
});

root.addEventListener("input", debounce((e) => {
  if (!e.target.matches("[data-search]")) return;
  query = e.target.value.trim().toLowerCase();
  render();
}, 200));

root.addEventListener("change", (e) => {
  if (e.target.matches("[data-checkin-event]")) {
    checkinEvent = e.target.value;
    render();
  }
});

root.addEventListener("submit", (e) => {
  if (e.target.id !== "checkin-form") return;
  e.preventDefault();
  scan($("#checkin-code").value);
  $("#checkin-code").focus();
});

dialog.addEventListener("click", (e) => {
  if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
});

form.addEventListener("submit", saveEvent);

form.addEventListener("change", async (e) => {
  if (e.target.name === "image" && e.target.value === "upload" && !form.elements.imageData.value) $("#ef-file").click();
  if (e.target.id !== "ef-file" || !e.target.files[0]) return;
  try {
    const data = await readPhoto(e.target.files[0]);
    form.elements.imageData.value = data;
    $("#upload-preview").outerHTML = `<img src="${data}" alt="Uploaded photo" id="upload-preview">`;
    $('input[name="image"][value="upload"]', form).checked = true;
  } catch {
    toast("That file couldn't be read as a photo.");
  }
});

form.addEventListener("click", (e) => {
  if (e.target.closest(".photo-pick__upload") && form.elements.imageData.value) {
    e.preventDefault();
    $('input[name="image"][value="upload"]', form).checked = true;
    $("#ef-file").click();
  }
});

document.addEventListener("registrations:change", () => {
  if (!dialog.open) render();
});
document.addEventListener("auth:change", render);
render();
