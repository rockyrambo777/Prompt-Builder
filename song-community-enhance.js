async function initCommunityEnhancements() {
  const params = new URLSearchParams(window.location.search);
  const songId = (params.get("id") || "").trim();
  if (!songId) return;

  function openCommunityTabFromHash() {
    if (window.location.hash !== "#community") return;
    const btn = document.querySelector('.tab[data-tab="community"]');
    if (btn) btn.click();
  }

  function enhance() {
    const panel = document.getElementById("panel-community");
    if (!panel) return false;
    const card = panel.querySelector(".card");
    if (!card) return false;

    if (!document.getElementById("btnCommunityBuilder")) {
      const heading = card.querySelector("h2");
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginBottom = "14px";

      const link = document.createElement("a");
      link.id = "btnCommunityBuilder";
      link.className = "btn primary";
      link.textContent = "BUILD COMMUNITY POST";
      link.href = "./song-community-builder.html?song_id=" + encodeURIComponent(songId);
      row.appendChild(link);

      const hint = document.createElement("span");
      hint.className = "muted";
      hint.textContent = "Build a copy-paste YouTube Community post prompt from this song.";
      row.appendChild(hint);

      if (heading) heading.insertAdjacentElement("afterend", row);
      else card.prepend(row);
    }

    openCommunityTabFromHash();
    return !!document.getElementById("btnCommunityBuilder");
  }

  openCommunityTabFromHash();
  if (enhance()) return;

  const panel = document.getElementById("panel-community");
  if (!panel) return;
  const observer = new MutationObserver(() => {
    openCommunityTabFromHash();
    if (enhance()) observer.disconnect();
  });
  observer.observe(panel, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10000);
}

initCommunityEnhancements().catch((err) => console.warn("Community enhancement failed", err));
