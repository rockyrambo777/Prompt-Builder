function isSongPage() {
  const page = (location.pathname || "").split("/").pop().toLowerCase();
  return page === "song.html";
}

function getAlbumLink() {
  return document.querySelector("#crumb a[href*='album.html?id=']");
}

function addBackToAlbumButton() {
  if (!isSongPage() || document.getElementById("btnBackAlbum")) return;
  const actionRow = document.querySelector(".wrap .top > .row");
  if (!actionRow) return;

  const btn = document.createElement("button");
  btn.id = "btnBackAlbum";
  btn.type = "button";
  btn.className = "btn secondary";
  btn.textContent = "← BACK TO ALBUM";
  btn.onclick = () => {
    const albumLink = getAlbumLink();
    if (albumLink && albumLink.href) window.location.href = albumLink.href;
    else window.history.back();
  };
  actionRow.prepend(btn);
}

function simplifySunoArea() {
  if (!isSongPage()) return;

  const panel = document.getElementById("panel-music");
  if (!panel) return;

  // Keep one Suno URL only. The checkbox still marks that one URL as the selected final.
  const fields = [...panel.querySelectorAll(".field")];
  for (const field of fields) {
    const first = field.firstElementChild;
    const label = (first && first.textContent || "").trim().toLowerCase();

    if (label === "selected final") {
      const extraTextInputs = field.querySelectorAll("input[type='text']");
      extraTextInputs.forEach((input) => input.remove());
    }

    if (label === "suno versions") {
      field.style.display = "none";
    }
  }
}

function applySongUi() {
  if (!isSongPage()) return;
  addBackToAlbumButton();
  simplifySunoArea();
}

if (isSongPage()) {
  applySongUi();
  const observer = new MutationObserver(applySongUi);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("load", applySongUi);
}
