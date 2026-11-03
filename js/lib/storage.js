const KEYS = {
  registrations: "soonthere:registrations",
  theme: "soonthere:theme",
};

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getRegistrations() {
  const list = read(KEYS.registrations, []);
  return Array.isArray(list) ? list : [];
}

export function addRegistration(registration) {
  const list = getRegistrations();
  list.push(registration);
  const ok = write(KEYS.registrations, list);
  if (ok) notify();
  return ok;
}

export function removeRegistration(id) {
  write(KEYS.registrations, getRegistrations().filter((r) => r.id !== id));
  notify();
}

export function clearRegistrations() {
  write(KEYS.registrations, []);
  notify();
}

export function getTheme() {
  return read(KEYS.theme, null);
}

export function setTheme(theme) {
  write(KEYS.theme, theme);
}

function notify() {
  document.dispatchEvent(new CustomEvent("registrations:change"));
}

// keep other open tabs in sync
window.addEventListener("storage", (e) => {
  if (e.key === KEYS.registrations) notify();
});
