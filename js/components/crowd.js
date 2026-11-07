import { prefersReducedMotion } from "../lib/dom.js";

// The footer wordmark is drawn as a crowd of dots. Move the pointer through it and the
// nearby crowd turns and presses in towards you, keeping a little space clear around you,
// parting as you walk through, then drifting back to their places once you've gone by.

const HOME_PULL = 0.018; // how strongly each dot wants its own spot back
const FRICTION = 0.86;
const SETTLED = 0.05;

export function mountCrowd(el) {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement("canvas");
  canvas.className = "crowd";
  canvas.setAttribute("aria-hidden", "true");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  el.append(canvas);

  const area = el.closest("footer") ?? el;
  let dots = [];
  let width = 0;
  let height = 0;
  let pad = 0;
  let reach = 120;
  let colours = { ink: "#000", accent: "#f00" };
  const pointer = { x: 0, y: 0, active: false, finger: false };
  let frame = null;
  let visible = false;

  function readColours() {
    const accent = el.querySelector(".is-accent");
    colours = { ink: getComputedStyle(el).color, accent: accent ? getComputedStyle(accent).color : getComputedStyle(el).color };
  }

  // draw the wordmark off screen and put a dot wherever there's ink
  async function build() {
    const box = el.getBoundingClientRect();
    if (!box.width) return;
    const style = getComputedStyle(el);
    const size = parseFloat(style.fontSize);
    await document.fonts.load(`900 ${size}px ${style.fontFamily}`).catch(() => {});
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    pad = Math.round(size * 0.35);
    width = Math.round(box.width);
    height = Math.round(box.height + pad * 2);
    reach = Math.max(70, size * 0.95);

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.top = `${-pad}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    const o = off.getContext("2d", { willReadFrequently: true });
    o.font = `900 ${size}px ${style.fontFamily}`;
    if ("fontStretch" in o) o.fontStretch = "semi-condensed";
    if ("letterSpacing" in o) o.letterSpacing = style.letterSpacing;
    o.textBaseline = "alphabetic";

    const accentEl = el.querySelector(".is-accent");
    const full = el.textContent.trim();
    const tail = accentEl ? accentEl.textContent : "";
    const head = full.slice(0, full.length - tail.length);
    const metrics = o.measureText(full);
    const textWidth = metrics.width;
    const glyphHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
    // stretch the drawn word over the real one (canvas can't quite match its width axis),
    // keeping it inside the box vertically
    const range = document.createRange();
    range.setStartBefore(el.firstChild);
    range.setEndAfter(accentEl ?? el.lastChild);
    const real = range.getBoundingClientRect();
    const sx = (real.width || width * 0.95) / textWidth;
    const sy = Math.min(sx, (box.height * 1.02) / glyphHeight);
    const left = real.width ? real.left - box.left : (width - textWidth * sx) / 2;
    const baseline = pad + (box.height - glyphHeight * sy) / 2 + metrics.actualBoundingBoxAscent * sy;
    o.save();
    o.translate(left, baseline);
    o.scale(sx, sy);
    o.fillStyle = "#000";
    o.fillText(head, 0, 0);
    o.fillStyle = "#f00";
    o.fillText(tail, o.measureText(head).width, 0);
    o.restore();

    const pixels = o.getImageData(0, 0, width, height).data;
    const step = Math.max(3, Math.round(size / 40));
    dots = [];
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4;
        if (pixels[i + 3] < 140) continue;
        dots.push({
          hx: x, hy: y, x, y, vx: 0, vy: 0,
          accent: pixels[i] > 128,
          // some people in a crowd are keener than others
          keen: 0.6 + Math.random() * 0.8,
        });
      }
    }
    dots.radius = step * 0.46;
    el.classList.add("has-crowd");
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const r = dots.radius;
    for (const group of [false, true]) {
      ctx.fillStyle = group ? colours.accent : colours.ink;
      ctx.beginPath();
      for (const d of dots) {
        if (d.accent !== group) continue;
        ctx.moveTo(d.x + r, d.y);
        ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  function step() {
    frame = null;
    let moving = false;
    // a fingertip covers more than a cursor, so the crowd leaves it more room
    const near = pointer.finger ? Math.max(reach * 1.25, 100) : reach;
    const space = pointer.finger ? Math.max(near * 0.34, 32) : reach * 0.3;
    for (const d of dots) {
      let ax = (d.hx - d.x) * HOME_PULL;
      let ay = (d.hy - d.y) * HOME_PULL;
      if (pointer.active) {
        const dx = pointer.x - d.x;
        const dy = pointer.y - d.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < near) {
          // lean in towards the pointer, but never closer than `space`
          const falloff = 1 - dist / near;
          const pull = (dist - space) * falloff * falloff * 0.09 * d.keen;
          ax += (dx / dist) * pull;
          ay += (dy / dist) * pull;
        }
      }
      d.vx = (d.vx + ax) * FRICTION;
      d.vy = (d.vy + ay) * FRICTION;
      d.x += d.vx;
      d.y += d.vy;
      if (!moving && (Math.abs(d.vx) > SETTLED || Math.abs(d.vy) > SETTLED || Math.abs(d.hx - d.x) > 0.5 || Math.abs(d.hy - d.y) > 0.5)) moving = true;
    }
    draw();
    if ((moving || pointer.active) && visible) frame = requestAnimationFrame(step);
  }

  const wake = () => {
    if (!frame && visible) frame = requestAnimationFrame(step);
  };

  const place = (e) => {
    const box = canvas.getBoundingClientRect();
    pointer.x = e.clientX - box.left;
    pointer.y = e.clientY - box.top;
    pointer.finger = e.pointerType !== "mouse";
  };

  // mouse: the crowd reacts whenever the cursor passes near
  area.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" && !touching) return;
    place(e);
    pointer.active = pointer.y > -reach && pointer.y < height + reach;
    wake();
  });
  area.addEventListener("pointerleave", (e) => {
    if (e.pointerType !== "mouse") return;
    pointer.active = false;
    wake();
  });

  // touch: put a finger on the name and the crowd gathers round it; slide sideways and they
  // follow (sliding up or down still scrolls the page). Lift off and they linger a moment.
  let touching = false;
  let release;
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    touching = true;
    clearTimeout(release);
    place(e);
    pointer.active = true;
    wake();
  });
  const lift = () => {
    if (!touching) return;
    touching = false;
    release = setTimeout(() => {
      pointer.active = false;
      wake();
    }, 500);
  };
  window.addEventListener("pointerup", lift);
  window.addEventListener("pointercancel", lift);

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) wake();
  }).observe(el);

  let pending;
  new ResizeObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(build);
  }).observe(el);

  // the colours follow the theme
  new MutationObserver(() => {
    readColours();
    draw();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  readColours();
  build();
}
