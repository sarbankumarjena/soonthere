// .ics files so people can drop an event straight into their calendar app

const icsDate = (date) => new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (value) => String(value).replace(/[\\;,]/g, (ch) => `\\${ch}`).replace(/\n/g, "\\n");

export function eventLink(event) {
  return new URL(`event.html?id=${encodeURIComponent(event.id)}`, window.location.href).href;
}

export function downloadIcs(event) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SoonThere//Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@soonthere`,
    `DTSTAMP:${icsDate(Date.now())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SUMMARY:${icsText(event.title)}`,
    `LOCATION:${icsText(`${event.venue}, ${event.area}, ${event.city}, ${event.country}`)}`,
    `DESCRIPTION:${icsText(`${event.summary}\n\n${eventLink(event)}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `${event.id}.ics` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
