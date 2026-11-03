const locale = undefined; // use the visitor's locale

function parts(date, timeZone, options) {
  return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(new Date(date));
}

export function dateParts(event) {
  const { start, timeZone } = event;
  return {
    day: parts(start, timeZone, { day: "numeric" }),
    month: parts(start, timeZone, { month: "short" }),
    weekday: parts(start, timeZone, { weekday: "short" }),
  };
}

export function formatDate(event) {
  return parts(event.start, event.timeZone, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatShortDate(event) {
  return parts(event.start, event.timeZone, { weekday: "short", day: "numeric", month: "short" });
}

export function formatTime(date, timeZone) {
  return parts(date, timeZone, { hour: "numeric", minute: "2-digit" });
}

export function formatTimeRange(event) {
  return `${formatTime(event.start, event.timeZone)} – ${formatTime(event.end, event.timeZone)}`;
}

export function formatPrice(amount, currency) {
  if (!amount) return "Free";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

export function relativeTime(date, now = Date.now()) {
  const diff = new Date(date).getTime() - now;
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < hour) return rtf.format(Math.round(diff / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < 60 * day) return rtf.format(Math.round(diff / day), "day");
  return rtf.format(Math.round(diff / (30 * day)), "month");
}

export function timeLeft(date, now = Date.now()) {
  const total = Math.max(0, new Date(date).getTime() - now);
  return {
    total,
    days: Math.floor(total / 86_400_000),
    hours: Math.floor((total / 3_600_000) % 24),
    minutes: Math.floor((total / 60_000) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}

export const pad = (n) => String(n).padStart(2, "0");

export function pluralise(count, word, plural = `${word}s`) {
  return `${count} ${count === 1 ? word : plural}`;
}
