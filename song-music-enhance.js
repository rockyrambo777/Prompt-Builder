import { supabase } from "./app.js";

async function initSongMusicEnhancements() {
  const params = new URLSearchParams(window.location.search);
  const songId = (params.get("id") || "").trim();
  if (!songId) return;

  const { data: song, error: songError } = await supabase
    .from("songs")
    .select("id,album_id,production_status")
    .eq("id", songId)
    .maybeSingle();
  if (songError || !song) return;

  let album = null;
  if (song.album_id) {
    const { data } = await supabase
      .from("albums")
      .select("id,status,production_status")
      .eq("id", song.album_id)
      .maybeSingle();
    album = data || null;
  }

  const effectiveStatus = String(
    song.production_status ||
    (album && album.production_status) ||
    (album && album.status) ||
    ""
  ).trim();

  function enhance() {
    const panel = document.getElementById("panel-music");
    if (!panel) return false;

    const statusControl = document.getElementById("f_production_status");
    if (statusControl && statusControl.tagName !== "SELECT") {
      const select = document.createElement("select");
      select.id = "f_production_status";
      const standard = ["", "draft", "ideation", "approved", "producing", "released"];
      const values = [...standard];
      if (effectiveStatus && !values.includes(effectiveStatus)) values.push(effectiveStatus);

      for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value ? value.charAt(0).toUpperCase() + value.slice(1) : "—";
        select.appendChild(option);
      }
      select.value = effectiveStatus;
      statusControl.replaceWith(select);

      if (!song.production_status && effectiveStatus && select.parentElement) {
        const hint = document.createElement("div");
        hint.className = "hint";
        hint.textContent = "Using album status: " + effectiveStatus + ". Save to store it on this song.";
        select.parentElement.appendChild(hint);
      }
    }

    const card = panel.querySelector(".card");
    if (card && !document.getElementById("btnBuildLyricsSuno")) {
      const heading = card.querySelector("h2");
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginBottom = "14px";

      const link = document.createElement("a");
      link.id = "btnBuildLyricsSuno";
      link.className = "btn secondary";
      link.textContent = "BUILD LYRICS + SUNO PROMPT";
      link.href = "./song-lyrics-builder.html?song_id=" + encodeURIComponent(songId)
        + (song.album_id ? "&album_id=" + encodeURIComponent(song.album_id) : "");
      link.target = "_blank";
      link.rel = "noopener";
      row.appendChild(link);

      const hint = document.createElement("span");
      hint.className = "muted";
      hint.textContent = "Build a creation prompt using this song and the artist DNA.";
      row.appendChild(hint);

      if (heading) heading.insertAdjacentElement("afterend", row);
      else card.prepend(row);
    }

    return !!document.getElementById("f_production_status") && !!document.getElementById("btnBuildLyricsSuno");
  }

  if (enhance()) return;

  const panel = document.getElementById("panel-music");
  if (!panel) return;
  const observer = new MutationObserver(() => {
    if (enhance()) observer.disconnect();
  });
  observer.observe(panel, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 10000);
}

initSongMusicEnhancements().catch((err) => console.warn("Song music enhancement failed", err));
