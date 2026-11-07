import { toast } from "../app.js";
import { $, $$, html, getParam } from "../lib/dom.js";
import { icons } from "../lib/icons.js";
import { pluralise } from "../lib/format.js";
import { DEMO_ADMIN, DEMO_MEMBER, currentUser, myBookings, signIn, signOut, signUp } from "../lib/auth.js";
import { checkEmail, checkName } from "../lib/validate.js";

const panel = $("#account-panel");
let mode = getParam("mode") === "signup" ? "signup" : "signin";

// only follow ?next= to pages on this site
function nextPage(user) {
  const next = getParam("next");
  if (next && /^[a-z]+\.html(\?[\w=&%-]*)?$/.test(next)) return next;
  return user.role === "admin" ? "admin.html" : "tickets.html";
}

function checkPassword(value, { strict }) {
  if (!value) return "Enter a password.";
  if (!strict) return "";
  if (value.length < 8) return "Use at least 8 characters.";
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) return "Mix in at least one letter and one number.";
  return "";
}

const field = (id, label, type, autocomplete, extra = "") => html`
  <div class="field">
    <label for="${id}">${label}</label>
    <input id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" required aria-describedby="${id}-error" ${extra}>
    <p class="field__error" id="${id}-error"></p>
  </div>`;

function renderForms() {
  const signup = mode === "signup";
  panel.innerHTML = html`
    <div class="account__tabs" role="tablist">
      <button type="button" role="tab" aria-selected="${String(!signup)}" data-mode="signin">Sign in</button>
      <button type="button" role="tab" aria-selected="${String(signup)}" data-mode="signup">Create account</button>
    </div>
    <form class="account__form" id="account-form" novalidate>
      ${signup && field("name", "Full name", "text", "name", 'maxlength="60"')}
      ${field("email", "Email", "email", "email")}
      ${field("password", "Password", "password", signup ? "new-password" : "current-password")}
      ${signup && html`<p class="field__hint">At least 8 characters, with a letter and a number.</p>`}
      <p class="account__error" id="form-error" role="alert"></p>
      <button class="btn btn-accent btn-block" type="submit">${signup ? "Create my account" : "Sign in"}</button>
    </form>
    ${!signup && html`
      <div class="account__demo">
        <p><b>Just looking around?</b> Try one of the demo accounts.</p>
        <div class="account__demo-row">
          <div><p>Demo user, a member with bookings</p><p class="mono">${DEMO_MEMBER.email}<br>${DEMO_MEMBER.password}</p></div>
          <button class="btn btn-small btn-ghost" type="button" data-demo="member">Sign in as demo user</button>
        </div>
        <div class="account__demo-row">
          <div><p>The organiser, with admin access</p><p class="mono">${DEMO_ADMIN.email}<br>${DEMO_ADMIN.password}</p></div>
          <button class="btn btn-small btn-ghost" type="button" data-demo="admin">Sign in as admin</button>
        </div>
      </div>`}
    <p class="account__note">Demo only: accounts are stored in this browser, not on a server, so they don't follow you to other devices.</p>`;
  $(`#${signup ? "name" : "email"}`).focus();
}

function showError(id, message) {
  const input = $(`#${id}`);
  input?.setAttribute("aria-invalid", message ? "true" : "false");
  input?.closest(".field")?.classList.toggle("has-error", Boolean(message));
  const slot = $(`#${id}-error`);
  if (slot) slot.innerHTML = message ? html`${icons.close}<span>${message}</span>` : "";
}

async function submit(e) {
  e.preventDefault();
  const signup = mode === "signup";
  const values = Object.fromEntries(new FormData(e.target));
  const errors = {
    ...(signup && { name: checkName(values.name ?? "") }),
    email: checkEmail(values.email ?? ""),
    password: checkPassword(values.password ?? "", { strict: signup }),
  };
  Object.entries(errors).forEach(([id, message]) => showError(id, message));
  $("#form-error").textContent = "";
  const first = Object.keys(errors).find((id) => errors[id]);
  if (first) return $(`#${first}`).focus();

  const button = $('button[type="submit"]', e.target);
  button.disabled = true;
  const result = signup ? await signUp(values) : await signIn(values.email, values.password);
  button.disabled = false;
  if (!result.ok) {
    if (result.field) {
      showError(result.field, result.error);
      return $(`#${result.field}`).focus();
    }
    $("#form-error").textContent = result.error;
    return;
  }
  toast(signup ? `Welcome to SoonThere, ${result.user.name.split(" ")[0]}.` : `Welcome back, ${result.user.name.split(" ")[0]}.`);
  setTimeout(() => (window.location.href = nextPage(result.user)), 700);
}

function renderProfile(user) {
  const passes = myBookings().reduce((sum, b) => sum + b.passes, 0);
  const admin = user.role === "admin";
  $("#account-title").textContent = `Hi, ${user.name.split(" ")[0]}.`;
  panel.innerHTML = html`
    <div class="profile">
      <span class="profile__avatar" aria-hidden="true">${user.name.charAt(0).toUpperCase()}</span>
      <div>
        <p class="profile__name">${user.name}</p>
        <p class="profile__email">${user.email}</p>
      </div>
      <span class="chip">${admin ? "Admin" : "Member"}</span>
    </div>
    <p class="profile__stats">${pluralise(myBookings().length, "booking")}, ${pluralise(passes, "pass", "passes")} in total.</p>
    <div class="profile__actions">
      <a class="btn btn-accent" href="tickets.html">My tickets ${icons.arrow}</a>
      ${admin && html`<a class="btn btn-ghost" href="admin.html">Open the admin area</a>`}
      <button class="btn btn-ghost" type="button" data-signout>Sign out</button>
    </div>`;
}

function render() {
  const user = currentUser();
  if (user) renderProfile(user);
  else renderForms();
}

panel.addEventListener("click", (e) => {
  const tab = e.target.closest("[data-mode]");
  if (tab) {
    mode = tab.dataset.mode;
    renderForms();
  }
  const demo = e.target.closest("[data-demo]");
  if (demo) {
    const account = demo.dataset.demo === "admin" ? DEMO_ADMIN : DEMO_MEMBER;
    $("#email").value = account.email;
    $("#password").value = account.password;
    $("#account-form").requestSubmit();
  }
  if (e.target.closest("[data-signout]")) {
    signOut();
    toast("Signed out. See you SoonThere.");
    $("#account-title").textContent = "Sign in to keep your passes together.";
    mode = "signin";
    renderForms();
  }
});

panel.addEventListener("submit", submit);
document.addEventListener("auth:change", () => {
  if (!$("#account-form")) render();
});
$$("[data-account-link]").forEach((link) => link.setAttribute("aria-current", "page"));
render();
