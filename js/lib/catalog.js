import { events, categories } from "../data/events.js";
import { getRegistrations } from "./storage.js";

export { events, categories };

export const MAX_PASSES = 5;

export function getEvent(id) {
  return events.find((e) => e.id === id) ?? null;
}

export function getCategory(id) {
  return categories.find((c) => c.id === id) ?? null;
}

export function isPast(event, now = Date.now()) {
  return new Date(event.end ?? event.start).getTime() < now;
}

export function hasStarted(event, now = Date.now()) {
  return new Date(event.start).getTime() <= now;
}

export function seatsLeft(event) {
  const mine = getRegistrations()
    .filter((r) => r.eventId === event.id)
    .reduce((sum, r) => sum + r.passes, 0);
  return Math.max(0, event.capacity - event.booked - mine);
}

export function getStatus(event) {
  if (isPast(event)) return "ended";
  const left = seatsLeft(event);
  if (left === 0) return "sold-out";
  if (left <= Math.max(10, event.capacity * 0.08)) return "few-left";
  return "open";
}

export function canRegister(event) {
  const status = getStatus(event);
  return status === "open" || status === "few-left";
}

export function byStart(a, b) {
  return new Date(a.start) - new Date(b.start);
}

export function upcoming(list = events) {
  return list.filter((e) => !isPast(e)).sort(byStart);
}

export function nextEvent() {
  return upcoming().find((e) => !hasStarted(e)) ?? null;
}

export function related(event, limit = 3) {
  const others = upcoming().filter((e) => e.id !== event.id);
  const same = others.filter((e) => e.category === event.category);
  return [...same, ...others.filter((e) => e.category !== event.category)].slice(0, limit);
}

export function imageSrc(event, size = 960) {
  return `assets/images/events/${event.image}-${size}.webp`;
}

export function mapsUrl(event) {
  const query = encodeURIComponent(`${event.venue}, ${event.area}, ${event.city}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}


// rough rates, only used so "sort by price" makes sense across currencies
const USD_RATES = { USD: 1, EUR: 1.08, GBP: 1.27, AUD: 0.66, HKD: 0.128, INR: 0.012, ZAR: 0.055, IDR: 0.000063, MXN: 0.055 };

export function priceInUsd(event) {
  return event.price * (USD_RATES[event.currency] ?? 1);
}

export function popularity(event) {
  return (event.capacity - seatsLeft(event)) / event.capacity;
}
