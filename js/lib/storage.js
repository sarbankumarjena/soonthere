const KEYS = {
  registrations: "soonthere:registrations",
  theme: "soonthere:theme",
};

export function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function write(key, value) {
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

export function addRegistrations(list) {
  if (!list.length) return;
  write(KEYS.registrations, [...getRegistrations(), ...list]);
  notify();
}

export function updateRegistration(id, changes) {
  const list = getRegistrations().map((r) => (r.id === id ? { ...r, ...changes } : r));
  write(KEYS.registrations, list);
  notify();
}

export function removeRegistrationsFor(eventId) {
  write(KEYS.registrations, getRegistrations().filter((r) => r.eventId !== eventId));
  notify();
}

export function removeRegistration(id) {
  write(KEYS.registrations, getRegistrations().filter((r) => r.id !== id));
  notify();
}

export function removeRegistrationsWhere(test) {
  write(KEYS.registrations, getRegistrations().filter((r) => !test(r)));
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
