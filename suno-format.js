export function cleanLyrics(raw) {
  let t = (raw || "").toString().trim();
  if (!t) return "";
  t = t.replace(/^LYRICS:\s*/i, "");
  t = t.replace(/^```[a-zA-Z]*\s*/m, "");
  t = t.replace(/```$/m, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function stanzaKey(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function alreadySectioned(raw) {
  return /^\s*\[[^\]]+\]/m.test(raw || "");
}

export function formatSunoLyrics(raw) {
  const t = cleanLyrics(raw);
  if (!t) return "";
  if (alreadySectioned(t)) {
    return t.replace(/\[([^\]]+)\]/g, (_, n) => "[" + String(n).trim() + "]");
  }

  const stanzas = t.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (stanzas.length < 2) return t;

  const counts = new Map();
  for (const s of stanzas) {
    const k = stanzaKey(s);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let chorusKey = null;
  let chorusCount = 1;
  for (const [k, c] of counts) {
    if (c > chorusCount) {
      chorusKey = k;
      chorusCount = c;
    }
  }

  const chorusVariants = chorusKey
    ? stanzas.filter((s) => stanzaKey(s) === chorusKey)
    : [];
  const chorusText = chorusVariants.sort((a, b) => a.length - b.length)[0] || null;
  const longestChorus = chorusVariants.sort((a, b) => b.length - a.length)[0] || chorusText;

  const unique = [];
  const seen = new Set();
  for (const s of stanzas) {
    const k = stanzaKey(s);
    if (chorusKey && k === chorusKey) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(s);
  }

  const verses = [];
  const others = [];
  for (const s of unique) {
    const low = s.toLowerCase();
    const worship = /holy spirit|worship bridge|\bfather,|\bjesus, when everything/.test(low);
    if (worship && verses.length) others.push({ tag: "[Worship Bridge]", s });
    else if (verses.length >= 2) others.push({ tag: "[Bridge]", s });
    else verses.push(s);
  }

  if (chorusText && verses.length) {
    const out = [];
    out.push("[Chorus]", chorusText, "");
    verses.forEach((v, i) => {
      out.push("[Verse " + (i + 1) + "]", v, "", "[Chorus]", chorusText, "");
    });
    for (const o of others) {
      out.push(o.tag, o.s, "");
    }
    out.push("[Final Chorus]", longestChorus || chorusText);
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  return stanzas.map((s, i) => "[Verse " + (i + 1) + "]\n" + s).join("\n\n");
}
