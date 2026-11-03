export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => entities[ch]);
}

class SafeHtml {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

export const raw = (value) => new SafeHtml(value);

const toHtml = (value) => {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join("");
  if (value === false || value == null) return "";
  return escapeHtml(value);
};

// tagged template: interpolated values are escaped, nested html`` results are not
export function html(strings, ...values) {
  return raw(strings.reduce((out, str, i) => out + str + (i < values.length ? toHtml(values[i]) : ""), ""));
}

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
