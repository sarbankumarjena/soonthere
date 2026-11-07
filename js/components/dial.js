import { $, $$, html, prefersReducedMotion } from "../lib/dom.js";
import { dateParts, formatTime, pad } from "../lib/format.js";
import { imageSrc } from "../lib/catalog.js";

const INTERVAL = 7000;

// wide screens dock a smaller dial in the stage's bottom-right, beside the copy
const dockMode = window.matchMedia("(min-width: 1100px)");
// phones get smaller cards, spaced a little wider so the neighbours don't crowd the middle
const phone = window.matchMedia("(max-width: 560px)");

// Event cards sit on the rim of a large wheel. `pos` is a float index; the card
// at round(pos) is under the needle and becomes the active one.
export function mountDial(root, list, { onChange, onOpen, pauseArea = root } = {}) {
  const track = $(".dial__track", root);
  const count = $(".dial__count", root);
  const progress = $(".dial__progress", root);
  const reduced = prefersReducedMotion();
  const n = list.length;

  track.innerHTML = list
    .map((event, i) => {
      const { day, month, weekday } = dateParts(event);
      return html`
        <li class="dial__item" data-category="${event.category}">
          <button class="dial__card" type="button" data-index="${i}" aria-label="${event.title}, ${weekday} ${day} ${month}, ${event.city}">
            <span class="dial__date">${weekday} ${day} ${month}</span>
            <span class="print"><img src="${imageSrc(event, 480)}" alt="" width="480" height="320" draggable="false"></span>
            <span class="dial__time"><b>${formatTime(event.start, event.timeZone)}</b> ${event.city}</span>
          </button>
        </li>`;
    })
    .join("");

  const items = $$(".dial__item", track);
  const wrap = (i) => ((i % n) + n) % n;
  let radius = 1600;
  let stepRad = 0.1;
  let offset = 0;
  let visible = 4.5;
  let pos = 0;
  let target = 0;
  let active = -1;
  let frame = null;

  function draw() {
    const stepDeg = (stepRad * 180) / Math.PI;
    items.forEach((item, i) => {
      let d = i - pos;
      d -= n * Math.round(d / n);
      const a = Math.abs(d);
      const angle = offset + d * stepDeg;
      item.style.transform = `rotate(${angle}deg)`;
      item.style.setProperty("--a", `${angle}deg`);
      item.style.setProperty("--s", 1 + 0.12 * Math.max(0, 1 - a));
      item.style.opacity = Math.max(0, Math.min(1, visible - a));
      item.style.visibility = a > visible ? "hidden" : "";
      item.style.zIndex = String(10 - Math.round(a));
    });
    root.style.setProperty("--turn", `${-pos * stepDeg}deg`);

    const current = wrap(Math.round(pos));
    if (current !== active) {
      items[active]?.classList.remove("is-active");
      items[current].classList.add("is-active");
      active = current;
      count.textContent = `${pad(current + 1)} / ${pad(n)}`;
      onChange?.(list[current], current);
    }
  }

  function measure() {
    const cardW = items[0].offsetWidth;
    const docked = dockMode.matches;
    root.classList.toggle("is-docked", docked);
    radius = Math.max(root.clientWidth * (docked ? 1.15 : 1.05), docked ? 620 : 760);
    stepRad = (cardW * (docked ? 1.45 : phone.matches ? 1.4 : 1.2)) / radius;
    offset = 0;
    visible = docked ? 3.2 : phone.matches ? 3.2 : 4.5;
    root.style.setProperty("--R", `${radius}px`);
    root.style.setProperty("--gap-angle", `${((cardW * 0.62) / radius) * (180 / Math.PI)}deg`);
    root.style.setProperty("--step", `${(stepRad * 180) / Math.PI}deg`);
    root.style.setProperty("--tick-w", `${(1.2 / radius) * (180 / Math.PI)}deg`);
    draw();
  }

  function animate() {
    cancelAnimationFrame(frame);
    const tick = () => {
      const diff = target - pos;
      if (reduced || Math.abs(diff) < 0.001) {
        pos = target;
        draw();
        return;
      }
      pos += diff * 0.11;
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function restartTimer() {
    if (reduced) return;
    progress.classList.remove("is-running");
    void progress.offsetWidth;
    progress.classList.add("is-running");
  }

  function step(dir) {
    target = Math.round(target) + dir;
    animate();
    restartTimer();
  }

  function goTo(index) {
    const from = Math.round(target);
    let d = wrap(index) - wrap(from);
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    target = from + d;
    animate();
    restartTimer();
  }

  // pausing: a mouse resting on one of the cards, keyboard focus, dragging or a hidden tab.
  // Hovering the rest of the hero leaves it turning.
  const reasons = new Set();
  const pause = (reason, on) => {
    on ? reasons.add(reason) : reasons.delete(reason);
    root.classList.toggle("is-paused", reasons.size > 0);
  };
  root.addEventListener("pointerover", (e) => {
    if (e.pointerType === "mouse") pause("hover", Boolean(e.target.closest(".dial__card")));
  });
  root.addEventListener("pointerleave", () => pause("hover", false));
  pauseArea.addEventListener("focusin", (e) => pause("focus", e.target.matches(":focus-visible")));
  pauseArea.addEventListener("focusout", (e) => !pauseArea.contains(e.relatedTarget) && pause("focus", false));
  document.addEventListener("visibilitychange", () => pause("hidden", document.hidden));
  progress.addEventListener("animationend", () => step(1));

  let drag = null;
  let suppressClick = false;

  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest(".dial__controls")) return;
    drag = { x: e.clientX, y: e.clientY, from: pos, id: e.pointerId, moved: false };
  });

  root.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const along = dx;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      root.setPointerCapture(drag.id);
      root.classList.add("is-dragging");
      cancelAnimationFrame(frame);
      pause("drag", true);
    }
    pos = drag.from - along / (stepRad * radius);
    target = pos;
    draw();
  });

  const endDrag = () => {
    if (!drag) return;
    if (drag.moved) {
      suppressClick = true;
      root.classList.remove("is-dragging");
      pause("drag", false);
      target = Math.round(pos);
      animate();
      restartTimer();
    }
    drag = null;
  };
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);

  root.addEventListener("click", (e) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const stepBtn = e.target.closest("[data-step]");
    if (stepBtn) return step(Number(stepBtn.dataset.step));
    const card = e.target.closest("[data-index]");
    if (!card) return;
    const index = Number(card.dataset.index);
    if (index === active) onOpen?.(list[index]);
    else goTo(index);
  });

  root.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    step(e.key === "ArrowRight" ? 1 : -1);
    $(".dial__item.is-active .dial__card", root)?.focus({ preventScroll: true });
  });

  // trackpads: a sideways swipe turns the dial, vertical scrolling is left alone
  let wheel = 0;
  root.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      wheel += e.deltaX;
      if (Math.abs(wheel) > 50) {
        step(Math.sign(wheel));
        wheel = 0;
      }
    },
    { passive: false },
  );

  root.style.setProperty("--interval", `${INTERVAL}ms`);
  new ResizeObserver(measure).observe(root);
  dockMode.addEventListener("change", measure);
  measure();
  restartTimer();

  return { goTo, step };
}
