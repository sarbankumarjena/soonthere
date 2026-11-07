import { html } from "../lib/dom.js";
import { formatPrice, formatShortDate, formatTime } from "../lib/format.js";
import { imageSrc } from "../lib/catalog.js";

// bars worked out from the booking id, so every pass gets its own barcode
function barcode(seed) {
  const stops = [];
  let x = 0;
  for (let i = 0; i < 26; i++) {
    const code = seed.charCodeAt(i % seed.length) + i * 7;
    const bar = 1 + (code % 3);
    const gap = 1 + ((code >> 2) % 3);
    stops.push(`currentColor ${x}px ${x + bar}px`, `transparent ${x + bar}px ${x + bar + gap}px`);
    x += bar + gap;
  }
  return `linear-gradient(90deg, ${stops.join(", ")}) 0 0 / ${x}px 100% repeat-x`;
}

export function passTicket({ event, name = "", passes = 1, bookingId = "", stamped = false } = {}) {
  const total = event ? formatPrice(event.price * passes, event.currency) : "";
  return html`
    <article class="pass ${event ? "" : "is-empty"} ${stamped ? "is-stamped" : ""}" data-category="${event?.category ?? ""}">
      <div class="pass__media print ${event ? "is-colour" : ""}">
        ${event ? html`<img src="${imageSrc(event, 480)}" alt="" width="480" height="320">` : html`<span class="pass__placeholder">Pick an event to see it here</span>`}
        <span class="pass__brand">Soon<b>There</b></span>
      </div>
      <div class="pass__main">
        <p class="pass__kicker">Admit ${passes}</p>
        <p class="pass__title">${event?.title ?? "Your next night out"}</p>
        <dl class="pass__grid">
          <div><dt>Date</dt><dd>${event ? formatShortDate(event) : "Soon"}</dd></div>
          <div><dt>Doors</dt><dd>${event ? formatTime(event.start, event.timeZone) : "--:--"}</dd></div>
          <div><dt>Venue</dt><dd>${event ? `${event.venue}, ${event.city}` : "Somewhere good"}</dd></div>
          <div><dt>Total</dt><dd>${total || "--"}</dd></div>
        </dl>
      </div>
      <div class="pass__stub">
        <dl class="pass__grid">
          <div><dt>Name</dt><dd class="${name ? "" : "is-placeholder"}">${name || "Your name"}</dd></div>
          <div><dt>Booking</dt><dd class="${bookingId ? "" : "is-placeholder"}">${bookingId || "ST-??????"}</dd></div>
        </dl>
        <span class="pass__barcode" style="background:${barcode(bookingId || event?.id || "soonthere")}" aria-hidden="true"></span>
      </div>
      ${stamped && html`<span class="pass__stamp" aria-hidden="true">You're in</span>`}
    </article>`;
}
