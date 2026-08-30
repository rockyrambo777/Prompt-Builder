async function initCommunityEnhancements() {
  const params = new URLSearchParams(window.location.search);
  const songId = (params.get("id") || "").trim();
  if (!songId) return;

  const builderHref = "./song-community-builder.html?song_id=" + encodeURIComponent(songId);

  function openCommunityTabFromHash() {
    if (window.location.hash !== "#community") return;
    const btn = document.querySelector('.tab[data-tab="community"]');
    if (btn) btn.click();
  }

  function ensureBuilderButton(card) {
    let link = document.getElementById("btnCommunityBuilder");
    if (link) {
      link.href = builderHref;
      return link;
    }

    const row = document.createElement("div");
    row.className = "row";
    row.style.marginBottom = "14px";

    link = document.createElement("a");
    link.id = "btnCommunityBuilder";
    link.className = "btn primary";
    link.textContent = "BUILD COMMUNITY POST";
    link.href = builderHref;
    row.appendChild(link);

    const hint = document.createElement("span");
    hint.className = "muted";
    hint.textContent = "Build a copy-paste YouTube Community post prompt from this song.";
    row.appendChild(hint);

    const heading = card.querySelector("h2");
    if (heading) heading.insertAdjacentElement("afterend", row);
    else card.prepend(row);
    return link;
  }

  function replaceDeadEnd(panel) {
    const coming = panel.querySelector(".card.coming");
    if (!coming) return null;
    const text = (coming.textContent || "").trim();
    if (!/community tables are not applied yet/i.test(text) && !/community posts\s*[—-]\s*coming/i.test(text)) {
      return null;
    }
    panel.innerHTML = "";
    const card = document.createElement("div");
    card.className = "card";
    const h2 = document.createElement("h2");
    h2.textContent = "Community posts";
    card.appendChild(h2);
    ensureBuilderButton(card);
    const note = document.createElement("div");
    note.className = "muted";
    note.textContent = "Saved community post storage is not applied yet. You can still build a ready-to-paste YouTube Community post with the builder.";
    card.appendChild(note);
    panel.appendChild(card);
    return card;
  }

  function enhance() {
    const panel = document.getElementById("panel-community");
    if (!panel) return false;

    let card = replaceDeadEnd(panel) || panel.querySelector(".card");
    if (!card) {
      panel.innerHTML = "";
      card = document.createElement("div");
      card.className = "card";
      const h2 = document.createElement("h2");
      h2.textContent = "Community posts";
      card.appendChild(h2);
      panel.appendChild(card);
    }

    ensureBuilderButton(card);
    openCommunityTabFromHash();
    return !!document.getElementById("btnCommunityBuilder");
  }

  openCommunityTabFromHash();
  enhance();

  const panel = document.getElementById("panel-community");
  if (!panel) return;

  // Keep watching: loadCommunity() replaces panel HTML and can wipe the button.
  const observer = new MutationObserver(() => {
    openCommunityTabFromHash();
    enhance();
  });
  observer.observe(panel, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 30000);
}

initCommunityEnhancements().catch((err) => console.warn("Community enhancement failed", err));
