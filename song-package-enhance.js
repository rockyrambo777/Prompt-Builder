async function initMasterPackageEnhancements() {
  const params = new URLSearchParams(window.location.search);
  const songId = (params.get("id") || "").trim();
  if (!songId) return;
  const href = "./song-package-builder.html?id=" + encodeURIComponent(songId);

  function masterLink(id, cls) {
    const a = document.createElement("a");
    a.id = id;
    a.className = cls || "btn primary";
    a.textContent = "BUILD MASTER SONG PACKAGE";
    a.href = href;
    return a;
  }

  function addTopButton() {
    if (document.getElementById("btnMasterPkgTop")) return true;
    const actionRow = document.querySelector(".wrap .top > .row");
    if (!actionRow) return false;
    const link = masterLink("btnMasterPkgTop", "btn primary");
    const save = document.getElementById("btnSave");
    if (save) actionRow.insertBefore(link, save);
    else actionRow.appendChild(link);
    return true;
  }

  function addTabStrip() {
    if (document.getElementById("masterPkgStrip")) return true;
    const tabs = document.getElementById("tabs");
    if (!tabs) return false;
    const strip = document.createElement("div");
    strip.id = "masterPkgStrip";
    strip.className = "row";
    strip.style.margin = "0 0 12px";
    strip.appendChild(masterLink("btnMasterPkgTabs", "btn primary"));
    const hint = document.createElement("span");
    hint.className = "muted";
    hint.textContent = "One AI run for Long Video, Shorts, Community, and YouTube.";
    strip.appendChild(hint);
    tabs.insertAdjacentElement("beforebegin", strip);
    return true;
  }

  function addPanelButton(panelId, btnId) {
    const panel = document.getElementById(panelId);
    if (!panel) return false;
    const card = panel.querySelector(".card");
    if (!card) return false;
    if (document.getElementById(btnId)) return true;
    const heading = card.querySelector("h2");
    const row = document.createElement("div");
    row.className = "row";
    row.style.marginBottom = "14px";
    row.appendChild(masterLink(btnId, "btn secondary"));
    if (heading) heading.insertAdjacentElement("afterend", row);
    else card.prepend(row);
    return true;
  }

  function enhance() {
    addTopButton();
    addTabStrip();
    addPanelButton("panel-long", "btnMasterPkgLong");
    addPanelButton("panel-shorts", "btnMasterPkgShorts");
    addPanelButton("panel-community", "btnMasterPkgCommunity");
    return !!(document.getElementById("btnMasterPkgTop") && document.getElementById("masterPkgStrip"));
  }

  enhance();
  const observer = new MutationObserver(() => {
    if (enhance()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 12000);
}

initMasterPackageEnhancements().catch((err) => console.warn("Master package enhancement failed", err));
