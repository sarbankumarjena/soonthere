import { getCategory } from "./catalog.js";

// "Alcântara" should match "alcantara"
export const normalise = (text) =>
  String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const searchText = (event) =>
  normalise([event.title, event.venue, event.area, event.city, event.country, event.organiser, getCategory(event.category)?.label, ...(event.tags ?? [])].join(" "));

// every word typed has to appear somewhere in the event's details
export function matches(text, query) {
  return normalise(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => text.includes(term));
}
