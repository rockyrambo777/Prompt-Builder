const $ = (id) => document.getElementById(id);

let ARTISTS = [];

function deliverableChecklist(type) {
  switch (type) {
    case "short":
      return `Create:
1) YouTube SHORT title (punchy, emotional hook)
2) SHORT description (2–5 lines) + 6–12 hashtags
3) Tags (comma-separated)
4) Pinned comment (short, emoji-friendly)
Keep it optimized for Shorts.`;
    case "long":
      return `Create:
1) YouTube title
2) Full YouTube description (intro + optional scripture + lyrics block)
3) Tags (comma-separated)
4) Pinned comment
Keep it optimized for long-form.`;
    case "tags":
      return `Return ONLY tags, comma-separated. No extra text.`;
    case "pinned":
      return `Return ONLY the pinned comment. No extra text.`;
    case "thumb":
      return `Return ONLY a vidIQ-ready thumbnail description (what the thumbnail should look like). No extra text.`;
    case "canva":
      return `Return ONLY a Canva AI prompt for a 1920×1080 (16:9) background image (no text baked in). No extra text.`;
    default:
      return "";
  }
}

function buildPrompt(artist, type, data) {
  const rules = artist.rules.map(r => `- ${r}`).join("\n");
  const meta = [
    `Artist: ${artist.name}`,
    `Channel: ${artist.handle}`,
    `Style lane: ${artist.lane}`,
    `Singer type: ${data.singerType}`,
    data.bpm ? `BPM: ${data.bpm}` : null,
    data.key ? `Key: ${data.key}` : null,
    data.mood ? `Mood: ${data.mood}` : null
  ].filter(Boolean).join("\n");

  return `You are generating content for ONLY this artist. Follow these rules:
${rules}

${meta}
Song title: ${data.songTitle || "(not provided)"}

Extra notes:
${data.notes || "(none)"}

Lyrics:
${data.lyrics || "(no lyrics provided)"}

Task:
${deliverableChecklist(type)}

Brand tags base (optional, use if helpful):
${artist.default_tags}
`;
}

async function init() {
  const res = await fetch("./artists.json");
  ARTISTS = await res.json();

  const artistSel = $("artist");
  artistSel.innerHTML = ARTISTS.map(a => `<option value="${a.id}">${a.name}</option>`).join("");
}

$("generate").addEventListener("click", () => {
  const artistId = $("artist").value;
  const artist = ARTISTS.find(a => a.id === artistId);

  const data = {
    songTitle: $("songTitle").value.trim(),
    singerType: $("singerType").value,
    bpm: $("bpm").value.trim(),
    key: $("key").value.trim(),
    mood: $("mood").value.trim(),
    lyrics: $("lyrics").value.trim(),
    notes: $("notes").value.trim()
  };

  const type = $("deliverable").value;
  const prompt = buildPrompt(artist, type, data);

  $("output").value = prompt;
  $("copy").disabled = !prompt;
});

$("copy").addEventListener("click", async () => {
  const text = $("output").value;
  await navigator.clipboard.writeText(text);
  $("copy").textContent = "Copied!";
  setTimeout(() => ($("copy").textContent = "Copy"), 1200);
});

init();
