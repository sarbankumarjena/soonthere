import { prefersReducedMotion } from "../lib/dom.js";

// The words come together out of a scatter of dots, the same crowd as the footer,
// gathering into place. When they've settled, the real text takes over.

const easeOut = (t) => 1 - (1 - t) ** 3;

export function assembleText(el, { duration = 1100, spread = Math.min(420, window.innerWidth * 0.6) } = {}) {
  const lines = [...el.querySelectorAll("[data-assemble]")];
  if (prefersReducedMotion() || !lines.length) return Promise.resolve();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve();
  // hide the real text (and stop its own entrance) before measuring, so it's measured in place
  el.classList.add("is-assembling");
  const bail = () => {
    el.classList.remove("is-assembling");
    return Promise.resolve();
  };

  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.className = "assemble";
  canvas.setAttribute("aria-hidden", "true");
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);

  // draw each line where it sits on screen, then read back where the ink is
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const o = off.getContext("2d", { willReadFrequently: true });
  const colours = [];
  lines.forEach((line, i) => {
    const style = getComputedStyle(line);
    const range = document.createRange();
    range.selectNodeContents(line);
    const box = range.getBoundingClientRect();
    o.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if ("letterSpacing" in o) o.letterSpacing = style.letterSpacing;
    o.textBaseline = "alphabetic";
    const m = o.measureText(line.textContent);
    const sx = box.width / m.width || 1;
    o.save();
    o.translate(box.left, box.top + (box.height - (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)) / 2 + m.actualBoundingBoxAscent);
    o.scale(sx, 1);
    o.fillStyle = `rgb(${i + 1}, 0, 0)`;
    o.fillText(line.textContent, 0, 0);
    o.restore();
    colours.push(style.color);
  });

  const size = parseFloat(getComputedStyle(lines[0]).fontSize);
  const step = Math.max(3, Math.round(size / 26));
  const pixels = o.getImageData(0, 0, width, height).data;
  const title = el.getBoundingClientRect();
  const cx = title.left + title.width / 2;
  const cy = title.top + title.height / 2;
  const dots = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] < 140) continue;
      // start somewhere out in the room, and set off a little later the further away
      const angle = Math.random() * Math.PI * 2;
      const dist = spread * (0.35 + Math.random() * 0.65);
      const sx0 = cx + Math.cos(angle) * dist * 1.1;
      const sy0 = cy + Math.sin(angle) * dist * 0.55;
      dots.push({ x: sx0, y: sy0, sx: sx0, sy: sy0, tx: x, ty: y, line: pixels[i] - 1, delay: Math.random() * 0.35 });
    }
  }
  if (!dots.length) return bail();

  const radius = step * 0.46;
  document.body.append(canvas);

  return new Promise((resolve) => {
    const start = performance.now();
    const total = duration / 1000;
    const draw = (now) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = Math.min(1, t / 0.3);
      let done = true;
      colours.forEach((colour, line) => {
        ctx.fillStyle = colour;
        ctx.beginPath();
        for (const d of dots) {
          if (d.line !== line) continue;
          const k = Math.min(1, Math.max(0, (t - d.delay) / (total - 0.35)));
          if (k < 1) done = false;
          const e = easeOut(k);
          // a slight curve on the way in, so they arrive like people finding their spot
          const bend = Math.sin(k * Math.PI) * 18;
          d.x = d.sx + (d.tx - d.sx) * e + bend;
          d.y = d.sy + (d.ty - d.sy) * e;
          ctx.moveTo(d.x + radius, d.y);
          ctx.arc(d.x, d.y, radius, 0, Math.PI * 2);
        }
        ctx.fill();
      });
      if (!done) return requestAnimationFrame(draw);
      // hand over to the real text
      el.classList.remove("is-assembling");
      canvas.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: "ease-out" }).finished.then(() => canvas.remove());
      resolve();
    };
    requestAnimationFrame(draw);
  });
}
