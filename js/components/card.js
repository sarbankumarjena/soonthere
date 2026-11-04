import { html } from "../lib/dom.js";
import { icons } from "../lib/icons.js";
import { dateParts, formatPrice, formatShortDate, formatTime, relativeTime } from "../lib/format.js";
import { getCategory, getStatus, hasStarted, imageSrc, seatsLeft } from "../lib/catalog.js";

const stamps = {
  ended: { label: "Ended", cls: "stamp--ended" },
  "sold-out": { label: "Sold out", cls: "stamp--sold" },
  "few-left": { label: "Few left", cls: "stamp--few" },
};

export function statusStamp(event) {
  const stamp = stamps[getStatus(event)];
  return stamp ? html`<span class="stamp ${stamp.cls}">${stamp.label}</span>` : "";
}

function whenLabel(event) {
  const status = getStatus(event);
  if (status === "ended") return "Happened " + relativeTime(event.start);
  if (hasStarted(event)) return "Happening now";
  if (status === "few-left") return `${seatsLeft(event)} spots left`;
  return "Starts " + relativeTime(event.start);
}

export function eventCard(event, { headingLevel = 3, eager = false } = {}) {
  const { day, month, weekday } = dateParts(event);
  const category = getCategory(event.category);
  const status = getStatus(event);
  const h = `h${headingLevel}`;

  return html`
    <article class="ticket-card ${status === "ended" ? "is-past" : ""}" data-category="${event.category}" data-id="${event.id}" data-tilt>
      <div class="ticket-card__shadow" aria-hidden="true"></div>
      <div class="ticket-card__inner">
        <div class="ticket-card__media print">
          <img src="${imageSrc(event, 480)}" srcset="${imageSrc(event, 480)} 480w, ${imageSrc(event, 960)} 960w"
            sizes="(max-width: 700px) 92vw, 400px" alt="${event.imageAlt}" width="480" height="320"
            loading="${eager ? "eager" : "lazy"}" decoding="async">
          <div class="ticket-card__tags">
            <span class="chip" data-category="${event.category}">${category?.label}</span>
            <span class="ticket-card__price">${formatPrice(event.price, event.currency)}</span>
          </div>
          <div class="ticket-card__stamp">${statusStamp(event)}</div>
        </div>
        <div class="ticket-card__body">
          <div class="ticket-card__date" aria-hidden="true">
            <span class="ticket-card__weekday">${weekday}</span>
            <span class="ticket-card__day">${day}</span>
            <span class="ticket-card__month">${month}</span>
          </div>
          <div class="ticket-card__info">
            <${h} class="ticket-card__title"><a href="event.html?id=${encodeURIComponent(event.id)}">${event.title}</a></${h}>
            <p class="ticket-card__venue">${icons.pin}<span>${event.venue}, ${event.city}</span></p>
            <p class="visually-hidden">${weekday} ${day} ${month}, ${formatTime(event.start, event.timeZone)}</p>
            <p class="ticket-card__summary">${event.summary}</p>
            <div class="ticket-card__foot">
              <span class="ticket-card__when">${whenLabel(event)}</span>
              <span class="ticket-card__cta" aria-hidden="true">Details ${icons.arrow}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

export function featuredCard(event, { large = false } = {}) {
  const category = getCategory(event.category);
  return html`
    <article class="poster-card ${large ? "poster-card--large" : ""}" data-category="${event.category}" data-id="${event.id}" data-tilt-soft>
      <div class="poster-card__media print">
        <img src="${imageSrc(event, large ? 960 : 480)}" srcset="${imageSrc(event, 480)} 480w, ${imageSrc(event, 960)} 960w"
          sizes="${large ? "(max-width: 860px) 92vw, 720px" : "(max-width: 860px) 92vw, 460px"}" alt="${event.imageAlt}" width="960" height="640" loading="lazy" decoding="async">
      </div>
      <div class="poster-card__content">
        <div class="poster-card__top">
          <span class="chip" data-category="${event.category}">${category?.label}</span>
          ${statusStamp(event)}
        </div>
        <div class="poster-card__bottom">
          <p class="poster-card__meta mono"><span>${formatShortDate(event)}</span><span>${event.city}</span></p>
          <h3 class="poster-card__title"><a href="event.html?id=${encodeURIComponent(event.id)}">${event.title}</a></h3>
          <div class="poster-card__foot">
            <span class="poster-card__price">${formatPrice(event.price, event.currency)}</span>
            <span class="poster-card__countdown" data-countdown="${event.start}"></span>
          </div>
        </div>
      </div>
    </article>
  `;
}
