async function initLongVideoEnhancements() {
  const params = new URLSearchParams(window.location.search);
  const songId = (params.get("id") || "").trim();
  if (!songId) return;

  function openLongTabFromHash() {
    if (window.location.hash !== "#long") return;
    const btn = document.querySelector('.tab[data-tab="long"]');
    if (btn) btn.click();
  }

  function enhance() {
    const panel = document.getElementById("panel-long");
    if (!panel) return false;
    const card = panel.querySelector(".card");
    if (!card) return false;

    if (!document.getElementById("btnLongAiBuilder")) {
      const heading = card.querySelector("h2");
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginBottom = "14px";

      const link = document.createElement("a");
      link.id = "btnLongAiBuilder";
      link.className = "btn primary";
      link.textContent = "BUILD / REBUILD WITH AI + AUDIO";
      link.href = "./song-long-builder.html?song_id=" + encodeURIComponent(songId);
      row.appendChild(link);

      const hint = document.createElement("span");
      hint.className = "muted";
      hint.textContent = "Copy a full audio-aware prompt to ChatGPT/Grok, then paste the returned JSON back into SVS.";
      row.appendChild(hint);

      if (heading) heading.insertAdjacentElement("afterend", row);
      else card.prepend(row);
    }

    openLongTabFromHash();
    return !!document.getElementById("btnLongAiBuilder");
  }

  openLongTabFromHash();
  if (enhance()) return;

  const panel = document.getElementById("panel-long");
  if (!panel) return;
  const observer = new MutationObserver(() => {
    openLongTabFromHash();
    if (enhance()) observer.disconnect();
  });
  observer.observe(panel, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10000);
}

initLongVideoEnhancements().catch((err) => console.warn("Long video enhancement failed", err));
