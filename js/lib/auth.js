import { addRegistrations, getRegistrations, read, write } from "./storage.js";

// Accounts live in this browser only, like bookings. Passwords are never stored:
// each one is salted and hashed with SHA-256 before it's saved.

const USERS = "soonthere:users";
const SESSION = "soonthere:session";

export const DEMO_ADMIN = { email: "admin@soonthere.app", password: "soonthere-admin" };
export const DEMO_MEMBER = { email: "maya@soonthere.app", password: "soonthere-demo" };

const toHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hash(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
const newId = () => `u-${toHex(crypto.getRandomValues(new Uint8Array(6)))}`;
const normaliseEmail = (email) => email.trim().toLowerCase();

export function getUsers() {
  const list = read(USERS, []);
  return Array.isArray(list) ? list : [];
}

function saveUsers(list) {
  return write(USERS, list);
}

function announce() {
  document.dispatchEvent(new CustomEvent("auth:change"));
}

export function currentUser() {
  const session = read(SESSION, null);
  if (!session) return null;
  const user = getUsers().find((u) => u.id === session.userId);
  return user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null;
}

// signed in: your bookings (made on this account or with your email). Signed out: guest bookings.
export function ownsBooking(booking, user = currentUser()) {
  return user ? booking.userId === user.id || booking.email === user.email : !booking.userId;
}

export const myBookings = () => getRegistrations().filter((b) => ownsBooking(b));

function startSession(user) {
  write(SESSION, { userId: user.id, at: new Date().toISOString() });
  announce();
}

export function signOut() {
  try {
    localStorage.removeItem(SESSION);
  } catch {
    // already signed out
  }
  announce();
}

export async function signUp({ name, email, password }) {
  const users = getUsers();
  const address = normaliseEmail(email);
  if (users.some((u) => u.email === address)) return { ok: false, field: "email", error: "There's already an account with this email. Try signing in." };
  const salt = newSalt();
  const user = { id: newId(), name: name.trim().replace(/\s+/g, " "), email: address, role: "member", salt, hash: await hash(password, salt), createdAt: new Date().toISOString() };
  if (!saveUsers([...users, user])) return { ok: false, error: "Your browser didn't let us save the account. Private mode can block this." };
  startSession(user);
  return { ok: true, user };
}

export async function signIn(email, password) {
  const user = getUsers().find((u) => u.email === normaliseEmail(email));
  if (!user || (await hash(password, user.salt)) !== user.hash) {
    return { ok: false, error: "That email and password don't match an account." };
  }
  startSession(user);
  return { ok: true, user };
}

export function setRole(id, role) {
  saveUsers(getUsers().map((u) => (u.id === id ? { ...u, role } : u)));
  announce();
}

// demo accounts so the admin area and a lived-in "My tickets" can be tried straight away
const DEMO_SEEDED = "soonthere:demo-seeded";

async function demoUser(users, { email, password }, name, role) {
  const existing = users.find((u) => u.email === email);
  if (existing) return existing;
  const salt = newSalt();
  const user = { id: newId(), name, email, role, salt, hash: await hash(password, salt), createdAt: new Date().toISOString() };
  users.push(user);
  return user;
}

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();

export async function ensureDemoAccounts() {
  const users = getUsers();
  const before = users.length;
  await demoUser(users, DEMO_ADMIN, "SoonThere Admin", "admin");
  const maya = await demoUser(users, DEMO_MEMBER, "Maya Fernandes", "member");
  if (users.length !== before) saveUsers(users);

  // Maya's history is added once per browser, so cancelling her bookings sticks
  if (read(DEMO_SEEDED, false)) return;
  write(DEMO_SEEDED, true);
  const base = { userId: maya.id, name: maya.name, email: maya.email, phone: "+351912345678", note: "" };
  addRegistrations([
    { ...base, id: "ST-K7M2QX", eventId: "neon-tide", passes: 2, createdAt: daysAgo(9) },
    { ...base, id: "ST-P4WZ8D", eventId: "night-bites", passes: 3, note: "Bringing my parents, one of them uses a cane.", createdAt: daysAgo(6) },
    { ...base, id: "ST-H9C3RT", eventId: "frontend-forward", passes: 1, createdAt: daysAgo(14) },
    { ...base, id: "ST-Y6N5LB", eventId: "open-field", passes: 2, createdAt: daysAgo(3) },
    { ...base, id: "ST-R3VT7M", eventId: "sunrise-flow", passes: 1, createdAt: daysAgo(1) },
    { ...base, id: "ST-E2V8JA", eventId: "confetti-club", passes: 2, createdAt: daysAgo(40), checkedInAt: "2026-10-18T03:12:00Z" },
  ].filter((r) => !getRegistrations().some((x) => x.id === r.id)));
}

window.addEventListener("storage", (e) => {
  if (e.key === USERS || e.key === SESSION) announce();
});
