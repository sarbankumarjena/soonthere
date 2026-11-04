import { observeReveals, toast } from "../app.js";
import { $, $$, html, getParam, prefersReducedMotion } from "../lib/dom.js";
import { icons } from "../lib/icons.js";
import { dateParts, formatDate, pluralise } from "../lib/format.js";
import { MAX_PASSES, findClashes, getEvent, getStatus, isBookable, seatsLeft, upcoming } from "../lib/catalog.js";
import { addRegistration, getRegistrations } from "../lib/storage.js";
import { currentUser } from "../lib/auth.js";
import { checkEmail, checkName, checkPasses, checkPhone, cleanPhone } from "../lib/validate.js";
import { downloadIcs } from "../lib/calendar.js";
import { passTicket } from "../components/pass.js";

const form = $("#register-form");
const fields = {
  event: $("#event"),
  passes: $("#passes"),
  name: $("#name"),
  email: $("#email"),
  phone: $("#phone"),
  note: $("#note"),
  terms: $("#terms"),
};
const touched = new Set();

const selectedEvent = () => getEvent(fields.event.value);
const maxPasses = (event) => (event ? Math.max(1, Math.min(MAX_PASSES, seatsLeft(event))) : MAX_PASSES);
const normaliseName = (value) => value.trim().replace(/\s+/g, " ");

function alreadyBooked(event, email) {
  const address = email.trim().toLowerCase();
  return getRegistrations().some((r) => r.eventId === event.id && r.email === address);
}

const checks = {
  event() {
    const event = selectedEvent();
    if (!fields.event.value) return "Pick the event you'd like to go to.";
    if (!event) return "We couldn't find that event. Try picking it again.";
    if (!isBookable(event)) return getStatus(event) === "sold-out" ? "That one's sold out." : "Bookings for that one have closed.";
    return "";
  },
  passes: () => checkPasses(fields.passes.value, maxPasses(selectedEvent())),
  name: () => checkName(fields.name.value),
  email() {
    const error = checkEmail(fields.email.value);
    if (error) return error;
    const event = selectedEvent();
    if (event && alreadyBooked(event, fields.email.value)) return "This email already has a booking for this event. You'll find it in My tickets.";
    return "";
  },
  phone: () => checkPhone(fields.phone.value),
  terms: () => (fields.terms.checked ? "" : "Please tick this so we know you've read it."),
};

function showError(key, message) {
  const input = fields[key];
  const slot = $(`#${key}-error`);
  input.setAttribute("aria-invalid", message ? "true" : "false");
  input.closest(".field, .form-end")?.classList.toggle("has-error", Boolean(message));
  slot.innerHTML = message ? html`${icons.close}<span>${message}</span>` : "";
}

function validate(key) {
  const message = checks[key]();
  showError(key, message);
  return !message;
}

function eventOption(event) {
  const { weekday, day, month } = dateParts(event);
  const open = isBookable(event);
  const reason = getStatus(event) === "sold-out" ? "sold out" : "closed";
  return html`<option value="${event.id}" ${open ? "" : "disabled"}>${event.title}, ${weekday} ${day} ${month}, ${event.city}${open ? "" : ` (${reason})`}</option>`;
}

function fillEvents() {
  const wanted = getEvent(getParam("event"));
  fields.event.innerHTML = html`
    <option value="">Choose an event</option>
    ${upcoming().map(eventOption)}`;

  if (!wanted) return;
  const back = $("#back-link");
  back.href = `event.html?id=${encodeURIComponent(wanted.id)}`;
  $("span", back).textContent = wanted.title;

  if (isBookable(wanted)) {
    fields.event.value = wanted.id;
  } else {
    touched.add("event");
    fields.event.value = "";
    showError("event", `${wanted.title} isn't taking bookings any more. Pick another event below.`);
  }
}

function syncEvent() {
  const event = selectedEvent();
  const max = maxPasses(event);
  fields.passes.max = max;
  if (Number(fields.passes.value) > max) fields.passes.value = max;
  const left = event ? seatsLeft(event) : 0;
  $("#passes-hint").textContent = event && left <= MAX_PASSES ? `Only ${pluralise(left, "spot")} left, so that's the most you can book.` : `Up to ${MAX_PASSES} per booking.`;

  const notice = $("#event-notice");
  const clashes = event ? findClashes(event) : [];
  notice.hidden = !clashes.length;
  if (clashes.length) {
    const names = clashes.map((c) => `${c.title} in ${c.city}`).join(" and ");
    notice.innerHTML = html`${icons.clock}<span>Heads up: you're already booked for ${names}, and the timings are tight. You can still go ahead.</span>`;
  }
}

function renderPreview() {
  $("#pass-preview").innerHTML = passTicket({
    event: selectedEvent(),
    name: normaliseName(fields.name.value),
    passes: Number(fields.passes.value) || 1,
  });
}

function bookingId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `ST-${[...bytes].map((b) => alphabet[b % alphabet.length]).join("")}`;
}

function confetti() {
  if (prefersReducedMotion()) return "";
  const colours = ["var(--cat-music)", "var(--cat-tech)", "var(--cat-food)", "var(--cat-arts)", "var(--cat-comedy)", "var(--cat-wellness)"];
  return html`<div class="confetti" aria-hidden="true">${Array.from({ length: 28 }, (_, i) => html`<i style="--x:${(i * 37) % 100}%;--d:${(i % 7) * 0.12}s;--r:${(i * 53) % 360}deg;--c:${colours[i % colours.length]}"></i>`)}</div>`;
}

// the pass arrives as a paper plane: it flies in along a dashed path, lands, then unfolds
function deliver(confirm) {
  const pass = $(".confirm__pass", confirm);
  if (prefersReducedMotion() || !CSS.supports("offset-path", 'path("M 0 0 L 1 1")')) return Promise.resolve();

  const box = pass.getBoundingClientRect();
  const w = window.innerWidth;
  const h = window.innerHeight;
  const tx = box.left + box.width / 2;
  const ty = Math.min(box.top + box.height / 2, h * 0.6);
  const d = `M -80 ${h * 0.82} C ${w * 0.28} ${h * 0.05}, ${tx + 160} ${ty - 300}, ${tx} ${ty}`;

  const layer = document.createElement("div");
  layer.className = "delivery";
  layer.setAttribute("aria-hidden", "true");
  layer.innerHTML = `
    <svg class="delivery__sky" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs><mask id="delivery-reveal"><path class="delivery__reveal" d="${d}" pathLength="1"/></mask></defs>
      <path class="delivery__trail" d="${d}" mask="url(#delivery-reveal)"/>
    </svg>
    <svg class="delivery__plane" viewBox="0 0 40 40" style="offset-path: path('${d}')">
      <path class="delivery__wing" d="M2 15 38 2 26 36 19 22Z"/><path class="delivery__fold" d="M19 22 38 2"/>
    </svg>`;
  document.body.append(layer);
  pass.classList.add("is-waiting");

  const plane = $(".delivery__plane", layer);
  const flight = plane.animate(
    [{ offsetDistance: "0%", scale: 0.7 }, { offsetDistance: "100%", scale: 1.6 }],
    { duration: 1300, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" },
  );
  $(".delivery__reveal", layer).animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1300, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" });

  return flight.finished.then(() => {
    plane.animate([{ opacity: 1, rotate: "0deg" }, { opacity: 0, rotate: "40deg", scale: 2.4 }], { duration: 380, easing: "ease-in", fill: "forwards" });
    $(".delivery__sky", layer).animate([{ opacity: 1 }, { opacity: 0 }], { duration: 900, delay: 300, fill: "forwards" });
    pass.classList.remove("is-waiting");
    pass.classList.add("is-unfolding");
    setTimeout(() => layer.remove(), 1300);
    return new Promise((resolve) => setTimeout(resolve, 900));
  });
}

function showConfirmation(booking, event) {
  const first = booking.name.split(" ")[0];
  const confirm = $("#confirm");
  confirm.innerHTML = html`
    <div class="confirm__copy">
      <p class="eyebrow"><span>${booking.id}</span><span>Confirmed</span></p>
      <h1 class="confirm__title" id="confirm-title"><span>You're in!</span> <span>See you SoonThere.</span></h1>
      <p class="confirm__text">${first}, your ${pluralise(booking.passes, "pass", "passes")} for <b>${event.title}</b> ${booking.passes > 1 ? "are" : "is"} saved under My tickets. Show ${booking.passes > 1 ? "them" : "it"} at the door on ${formatDate(event)}.</p>
      <p class="confirm__small">In a real launch this would also land in <b>${booking.email}</b>.</p>
      <div class="confirm__actions">
        <a class="btn btn-accent" href="tickets.html">See my tickets ${icons.arrow}</a>
        <button class="btn btn-ghost" type="button" data-action="calendar">${icons.download} Add to calendar</button>
      </div>
      <a class="link-arrow confirm__more" href="index.html#lineup">Find another night out ${icons.arrow}</a>
    </div>
    <div class="confirm__pass">${passTicket({ event, name: booking.name, passes: booking.passes, bookingId: booking.id, stamped: true })}</div>`;

  $('[data-action="calendar"]', confirm).addEventListener("click", () => {
    downloadIcs(event);
    toast("Calendar file downloaded. Open it to add the event.");
  });

  $("#register").hidden = true;
  $("#back-link").hidden = true;
  confirm.hidden = false;
  document.title = "You're in! | SoonThere";
  window.scrollTo({ top: 0, behavior: "instant" });
  confirm.focus({ preventScroll: true });

  deliver(confirm).then(() => {
    confirm.classList.add("is-delivered");
    confirm.insertAdjacentHTML("afterbegin", confetti());
    setTimeout(() => $(".confetti", confirm)?.remove(), 4000);
  });
}

async function submit(e) {
  e.preventDefault();
  Object.keys(checks).forEach((key) => touched.add(key));
  const invalid = Object.keys(checks).filter((key) => !validate(key));
  if (invalid.length) {
    fields[invalid[0]].focus();
    toast(invalid.length === 1 ? "One thing to fix before we can book you in." : `${invalid.length} things to fix before we can book you in.`);
    return;
  }

  const event = selectedEvent();
  const button = $("#submit");
  button.disabled = true;
  button.classList.add("is-busy");
  button.setAttribute("aria-label", "Getting you SoonThere");
  await new Promise((resolve) => setTimeout(resolve, prefersReducedMotion() ? 300 : 1100));

  const booking = {
    id: bookingId(),
    eventId: event.id,
    name: normaliseName(fields.name.value),
    email: fields.email.value.trim().toLowerCase(),
    phone: cleanPhone(fields.phone.value.trim()),
    passes: Number(fields.passes.value),
    note: fields.note.value.trim(),
    userId: currentUser()?.id ?? null,
    createdAt: new Date().toISOString(),
  };

  button.disabled = false;
  button.classList.remove("is-busy");
  button.removeAttribute("aria-label");

  if (!addRegistration(booking)) {
    toast("Your browser didn't let us save the pass. Private mode can block this, so try a normal window.", { duration: 6000 });
    return;
  }
  showConfirmation(booking, event);
}

function initFields() {
  Object.entries(fields).forEach(([key, input]) => {
    if (!checks[key]) return;
    input.addEventListener("blur", () => {
      if (key !== "terms" && !input.value) return;
      touched.add(key);
      validate(key);
    });
    input.addEventListener(input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input", () => {
      if (input.tagName === "SELECT") touched.add(key);
      if (touched.has(key)) validate(key);
    });
  });

  fields.event.addEventListener("change", () => {
    syncEvent();
    if (touched.has("passes")) validate("passes");
    if (touched.has("email")) validate("email");
    renderPreview();
  });
  [fields.name, fields.passes].forEach((input) => input.addEventListener("input", renderPreview));

  $$(".stepper__btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      const max = maxPasses(selectedEvent());
      const next = Math.min(max, Math.max(1, (Number(fields.passes.value) || 1) + Number(btn.dataset.step)));
      fields.passes.value = next;
      touched.add("passes");
      validate("passes");
      renderPreview();
    }),
  );

  const count = $("#note-count");
  fields.note.addEventListener("input", () => (count.textContent = `${fields.note.value.length} / 200`));

  form.addEventListener("submit", submit);
}

// signed-in visitors get their details filled in
function prefill() {
  const user = currentUser();
  if (!user) return;
  if (!fields.name.value) fields.name.value = user.name;
  if (!fields.email.value) fields.email.value = user.email;
  $("#signed-in").hidden = false;
  $("#signed-in").innerHTML = html`${icons.check}<span>Booking as <b>${user.name}</b>. The pass is saved to your account.</span>`;
}

fillEvents();
prefill();
syncEvent();
renderPreview();
initFields();
observeReveals();
