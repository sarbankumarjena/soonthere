import { html } from "../lib/dom.js";
import { pad, timeLeft } from "../lib/format.js";

const active = new Set();
let timer = null;

function tick() {
  const now = Date.now();
  active.forEach((countdown) => countdown.update(now));
  if (!active.size) {
    clearInterval(timer);
    timer = null;
  }
}

const UNITS = [
  ["days", "Days", "d"],
  ["hours", "Hours", "h"],
  ["minutes", "Mins", "m"],
  ["seconds", "Secs", "s"],
];

// "full" shows labelled boxes, "compact" shows 12d 04h 10m 05s
export function mountCountdown(el, target, { variant = "full", onEnd } = {}) {
  const end = new Date(target).getTime();

  if (variant === "full") {
    el.innerHTML = html`
      <div class="countdown" role="timer" aria-live="off">
        ${UNITS.map(
          ([key, label]) => html`
            <div class="countdown__unit">
              <span class="countdown__value" data-unit="${key}">00</span>
              <span class="countdown__label">${label}</span>
            </div>`,
        )}
      </div>`;
  } else {
    el.innerHTML = html`<span class="countdown countdown--compact" role="timer" aria-live="off">${UNITS.map(
      ([key, , short]) => html`<span><b data-unit="${key}">00</b>${short}</span>`,
    )}</span>`;
  }

  const slots = Object.fromEntries(UNITS.map(([key]) => [key, el.querySelector(`[data-unit="${key}"]`)]));
  const countdown = {
    update(now = Date.now()) {
      const left = timeLeft(end, now);
      UNITS.forEach(([key]) => {
        const value = key === "days" ? String(left.days) : pad(left[key]);
        const slot = slots[key];
        if (slot.textContent !== value) {
          slot.textContent = value;
          slot.classList.remove("flip");
          void slot.offsetWidth;
          slot.classList.add("flip");
        }
      });
      if (left.total === 0) {
        active.delete(countdown);
        onEnd?.();
      }
    },
    stop() {
      active.delete(countdown);
    },
  };

  countdown.update();
  // first render shouldn't animate
  el.querySelectorAll(".flip").forEach((s) => s.classList.remove("flip"));

  if (end > Date.now()) {
    active.add(countdown);
    timer ??= setInterval(tick, 1000);
  }
  return countdown;
}
