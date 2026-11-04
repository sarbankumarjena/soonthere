// Each rule returns an error message, or "" when the value is fine.

const NAME = /^[\p{L}][\p{L}\p{M} .'’-]*$/u;
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export const cleanPhone = (value) => value.replace(/[\s().-]/g, "");

export function checkName(value) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) return "Please tell us your name.";
  if (name.length < 2) return "That's a bit short. Use the name on your ID.";
  if (name.length > 60) return "Keep it under 60 characters.";
  if (!NAME.test(name)) return "Names can use letters, spaces, hyphens and apostrophes.";
  return "";
}

export function checkEmail(value) {
  const email = value.trim();
  if (!email) return "We need an email to hold your pass.";
  if (!EMAIL.test(email)) return "That email doesn't look right. Check for a missing @ or a typo.";
  return "";
}

export function checkPhone(value) {
  const phone = cleanPhone(value.trim());
  if (!phone) return "Add a number in case anything changes on the day.";
  if (!/^\+?\d+$/.test(phone)) return "Use digits only. You can start with + and your country code.";
  const digits = phone.replace("+", "").length;
  if (digits < 7 || digits > 15) return "Phone numbers are 7 to 15 digits long.";
  return "";
}

export function checkPasses(value, max) {
  const passes = Number(value);
  if (!Number.isInteger(passes) || passes < 1) return "You'll need at least one pass.";
  if (passes > max) return max === 1 ? "Only one pass is left for this one." : `You can book up to ${max} passes for this one.`;
  return "";
}
