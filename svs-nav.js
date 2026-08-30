import { supabase } from "./app.js";

const LINKS = [
  { href: "home.html", label: "HOME" },
  { href: "artists.html", label: "ARTISTS" },
  { href: "production.html", label: "PRODUCTION" },
  { href: "schedule.html", label: "SCHEDULE" },
  { href: "distribution.html", label: "DISTRIBUTION" },
  { href: "catalogue.html", label: "CATALOGUE" },
  { href: "approvals.html", label: "APPROVALS" },
  { href: "users.html", label: "ADMIN", ownerOnly: true },
  { href: "bots.html", label: "BOTS", ownerOnly: true },
];

function currentPage() {
  const parts = (location.pathname || "").split("/");
  let p = (parts[parts.length - 1] || "").toLowerCase();
  if (!p || p === "/") p = "home.html";
  return p;
}

function pageMatches(href, page) {
  const h = href.toLowerCase();
  if (page === h) return true;
  if (h === "home.html" && (page === "" || page === "index.html")) return false;
  if (h === "artists.html" && (page === "artist-view.html" || page === "artist_view_filtered.html" || page === "artist-edit.html" || page === "artist-new.html")) return true;
  if (h === "distribution.html" && (page === "youtube.html" || page === "distribution-ditto.html" || page === "distribution-bandcamp.html" || page === "catalogue.html")) return true;
  if (h === "home.html" && page === "home.html") return true;
  return false;
}

async function isOwnerSession() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { owner: false, email: "" };
    const { data } = await supabase
      .from("app_users")
      .select("role,status")
      .eq("auth_user_id", session.user.id)
      .maybeSingle();
    const owner = !!(data && data.role === "owner" && data.status === "approved");
    return { owner, email: session.user.email || "" };
  } catch {
    return { owner: false, email: "" };
  }
}

async function mountNav() {
  const host = document.getElementById("svs-nav");
  if (!host) return;

  const { owner, email } = await isOwnerSession();
  const page = currentPage();

  host.innerHTML = "";
  const nav = document.createElement("div");
  nav.className = "svs-nav";

  const links = document.createElement("div");
  links.className = "svs-nav-links";

  for (const item of LINKS) {
    if (item.ownerOnly && !owner) continue;
    const a = document.createElement("a");
    a.href = "./" + item.href;
    a.textContent = item.label;
    if (pageMatches(item.href, page)) a.className = "active";
    links.appendChild(a);
  }

  const right = document.createElement("div");
  right.className = "svs-nav-right";
  if (email) {
    const who = document.createElement("span");
    who.className = "who";
    who.textContent = email;
    right.appendChild(who);
  }
  const logout = document.createElement("button");
  logout.className = "btn danger";
  logout.textContent = "Logout";
  logout.onclick = async () => {
    await supabase.auth.signOut();
    window.location.href = "./index.html";
  };
  right.appendChild(logout);

  nav.appendChild(links);
  nav.appendChild(right);
  host.appendChild(nav);
}

async function mountPageEnhancements() {
  if (currentPage() !== "song.html") return;
  try {
    await import("./song-music-enhance.js?v=20260830c");
  } catch (err) {
    console.warn("Could not load song music enhancements", err);
  }
  try {
    await import("./song-long-enhance.js?v=20260830b");
  } catch (err) {
    console.warn("Could not load long video enhancements", err);
  }
  try {
    await import("./song-package-enhance.js?v=20260830f");
  } catch (err) {
    console.warn("Could not load master package enhancements", err);
  }
  try {
    await import("./song-community-enhance.js?v=20260830i");
  } catch (err) {
    console.warn("Could not load community enhancements", err);
  }
}

function ready(fn) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
  else fn();
}

ready(mountNav);
ready(mountPageEnhancements);
