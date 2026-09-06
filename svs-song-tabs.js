import { supabase } from "./app.js";

function $(id) { return document.getElementById(id); }
function safe(v) { return v == null ? "" : String(v); }
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function tableMissing(err) {
  if (!err) return false;
  const m = (err.message || "") + " " + (err.code || "");
  return /does not exist|schema cache|PGRST/i.test(m) || err.code === "42P01" || err.code === "PGRST205";
}
function field(label, id, value, extra) {
  const wrap = el("label", "field");
  wrap.appendChild(el("span", "", label));
  const input = document.createElement(extra?.tag || "input");
  input.id = id;
  if (extra?.tag === "textarea") input.value = safe(value);
  else { input.type = extra?.type || "text"; input.value = safe(value); }
  if (extra?.cls) input.className = extra.cls;
  wrap.appendChild(input);
  return wrap;
}

async function snapshot(entityType, entityId, fieldGroup, row, reason) {
  try {
    await supabase.from("content_revisions").insert({
      entity_type: entityType,
      entity_id: entityId,
      field_group: fieldGroup,
      snapshot: row,
      created_by: "human",
      reason: reason || "save"
    });
  } catch { /* table may not exist yet */ }
}

let visualIdentities = [];
let resolvedIdentity = null;
let tabsPersonaId = null;
let identityImages = {};

const VI_START = "=== VISUAL ARTIST IDENTITY ===";
const VI_END = "=== END VISUAL ARTIST IDENTITY ===";

function composeVisualPromptBlock(identity) {
  if (!identity) return "";
  const stored = String(identity.prompt_block || "").trim();
  if (stored) {
    if (stored.includes("VISUAL ARTIST IDENTITY")) return stored;
    return VI_START + "\n" + stored + "\n" + VI_END;
  }
  const lines = [VI_START];
  const add = (label, val) => { if (val && String(val).trim()) lines.push(label + ": " + String(val).trim()); };
  add("Appearance", identity.appearance_definition);
  add("Face and features", identity.face_and_features);
  add("Hair and styling", identity.hair_and_styling);
  add("Wardrobe and palette", identity.wardrobe_and_palette);
  add("Lighting and grade", identity.lighting_and_grade);
  add("Setting and props", identity.setting_and_props);
  add("Camera and framing", identity.camera_and_framing);
  add("Must include", identity.must_include);
  add("Never include", identity.never_include);
  lines.push(VI_END);
  return lines.join("\n");
}

function pickDefaultIdentity(list, personaId) {
  if (personaId) {
    const pdef = list.find((v) => v.persona_id === personaId && v.is_default && (v.status || "active") === "active");
    if (pdef) return pdef;
  }
  const adef = list.find((v) => !v.persona_id && v.is_default && (v.status || "active") === "active");
  if (adef) return adef;
  return list.find((v) => !v.persona_id && (v.status || "active") === "active") || null;
}


async function refSrc(img) {
  if (!img) return "";
  if (img.public_url) return img.public_url;
  if (img.storage_path) {
    const { data, error } = await supabase.storage.from("visual-identity").createSignedUrl(img.storage_path, 3600);
    if (error) return "";
    return (data && data.signedUrl) || "";
  }
  return "";
}

async function loadImagesForIdentity(identityId) {
  if (!identityId) return [];
  if (identityImages[identityId]) return identityImages[identityId];
  const { data, error } = await supabase
    .from("visual_reference_images")
    .select("*")
    .eq("visual_identity_id", identityId)
    .order("sort_order", { ascending: true });
  const rows = error ? [] : (data || []);
  for (const img of rows) img._src = await refSrc(img);
  identityImages[identityId] = rows.filter((x) => x._src);
  return identityImages[identityId];
}

function identityById(id) {
  if (id) {
    const hit = visualIdentities.find((x) => x.id === id);
    if (hit) return hit;
  }
  return resolvedIdentity;
}

function pickRefImage(identity, preferredKind) {
  const id = identity && identity.id;
  const rows = (id && identityImages[id]) || [];
  if (!rows.length) return null;
  const kinds = preferredKind ? [preferredKind, "face", "full_body", "thumbnail", "scene"] : ["face", "full_body", "thumbnail", "scene"];
  for (const k of kinds) {
    const hit = rows.find((r) => (r.kind || "") === k);
    if (hit) return hit;
  }
  return rows[0];
}

function useImageBlock(kind, identity) {
  const pref = kind === "thumbnail" ? "thumbnail" : (kind === "shorts" ? "face" : "scene");
  const img = pickRefImage(identity, pref);
  if (!img) return "";
  const lines = ["=== USE ARTIST REFERENCE IMAGE ==="];
  lines.push("Download the artist identity image from SVS, place it in the image generator as the reference image, then generate.");
  lines.push("USE IMAGE: use this uploaded artist image as the reference.");
  if (kind === "thumbnail") {
    lines.push("Change this photo into a YouTube thumbnail (16:9). Keep this exact artist. Do not replace the person.");
  } else if (kind === "shorts") {
    lines.push("Change this photo into a vertical 9:16 Short. Keep this exact artist (same face, hair, wardrobe). Do not replace the person.");
  } else {
    lines.push("Change this photo into the scene below. Keep this exact artist (same face, hair, look). Do not invent a different person. Adapt pose, crop, lighting, and setting to the scene.");
  }
  lines.push("=== END USE ARTIST REFERENCE IMAGE ===");
  return lines.join("\n");
}

function hookOverlayBlock(hook, kind) {
  const h = safe(hook).trim();
  if (!h) return "";
  if (kind === "thumbnail") {
    return [
      "=== THUMBNAIL HOOK TEXT ===",
      "Create a YouTube thumbnail (16:9) with the hook text ON the image.",
      "Overlay large, cinematic, readable text that reads: \"" + h + "\".",
      "Leave clean open space for the words. The hook must appear inside the thumbnail.",
      "=== END THUMBNAIL HOOK TEXT ==="
    ].join("\n");
  }
  if (kind === "shorts") {
    return [
      "=== SHORTS ON-SCREEN TEXT ===",
      "Vertical 9:16. Put this text on screen: \"" + h + "\".",
      "=== END SHORTS ON-SCREEN TEXT ==="
    ].join("\n");
  }
  return "";
}

function composeThumbnailPrompt(opts) {
  const identity = opts.identity || resolvedIdentity;
  const hook = safe(opts.hook).trim();
  const concept = safe(opts.concept).trim();
  const hasImg = !!pickRefImage(identity, "thumbnail");
  const lines = [];
  if (hasImg) {
    lines.push("USE IMAGE. Use the uploaded artist photo as the reference. Keep this exact person (face, hair, wardrobe). Do not replace them.");
    lines.push("Fit and crop the photo into a YouTube thumbnail, 16:9, cinematic, high contrast, readable when small.");
  } else {
    lines.push("YouTube thumbnail, 16:9, cinematic, high contrast, readable when small. Keep the artist look.");
  }
  if (hook) {
    lines.push("Put this hook text ON the image, large, clear, and easy to read: \"" + hook + "\".");
    lines.push("Leave clean open space for the words. The hook must be inside the thumbnail.");
  }
  if (concept) lines.push(concept);
  lines.push("Keep the artist look. Change crop, lighting, and background only as needed for a thumbnail.");
  return lines.join("\n\n");
}

function composeGeneratorPrompt(opts) {
  const identity = opts.identity || resolvedIdentity;
  const kind = opts.kind || "long";
  if (kind === "thumbnail") return composeThumbnailPrompt(opts);
  if (kind === "long-video" || kind === "shorts-video") return composeVideoPrompt(opts);
  if (kind === "long" || kind === "shorts") return composeImagePrompt(opts);
  const parts = [];
  const use = useImageBlock(kind === "shorts" ? "shorts" : "long", identity);
  if (use) parts.push(use);
  const body = safe(opts.body).trim();
  if (body) parts.push(body);
  return parts.filter(Boolean).join("\n\n").trim();
}

function looksLikeIdentityDump(text) {
  return /VISUAL ARTIST IDENTITY/i.test(safe(text));
}

function looksLikeStillDump(text) {
  const t = safe(text);
  return looksLikeIdentityDump(t) || /Fair-skinned woman/i.test(t);
}

function stripIdentityDump(text) {
  let t = safe(text).trim();
  t = t.replace(/=== VISUAL ARTIST IDENTITY ===[\s\S]*?=== END VISUAL ARTIST IDENTITY ===/gi, "").trim();
  t = t.replace(/=== USE ARTIST REFERENCE IMAGE ===[\s\S]*?=== END USE ARTIST REFERENCE IMAGE ===/gi, "").trim();
  if (/^USE IMAGE\b/i.test(t)) return "";
  return t;
}

function composeImagePrompt(opts) {
  const identity = opts.identity || resolvedIdentity;
  const kind = opts.kind === "shorts" ? "shorts" : "long";
  const hasImg = !!pickRefImage(identity, kind === "shorts" ? "face" : "scene");
  const concept = safe(opts.concept).trim();
  const hook = safe(opts.hook).trim();
  let still = stripIdentityDump(opts.body);
  if (still === concept) still = "";
  const lines = [];
  if (hasImg) {
    if (kind === "shorts") {
      lines.push("USE IMAGE. Use the uploaded artist photo as the reference. Change this photo into a vertical 9:16 Short still. Keep this exact artist (same face, hair, wardrobe). Do not replace the person.");
    } else {
      lines.push("USE IMAGE. Use the uploaded artist photo as the reference. Change this photo into this scene. Keep this exact artist (same face, hair, wardrobe). Do not replace the person. Adapt pose, crop, lighting, and setting to the scene.");
    }
  } else if (kind === "shorts") {
    lines.push("Vertical 9:16 Short still. Do not use an artist reference photo.");
  } else {
    lines.push("Scene still. Do not use an artist reference photo. Describe the scene only.");
  }
  if (concept) lines.push(concept);
  if (still) lines.push(still);
  if (kind === "shorts" && hook) lines.push("Put this text on the still: \"" + hook + "\".");
  return lines.join("\n\n");
}

function composeVideoPrompt(opts) {
  const kind = opts.kind || "long-video";
  const camera = safe(opts.camera).trim();
  let extra = safe(opts.body).trim();
  if (looksLikeStillDump(extra) || extra.startsWith("IMAGE TO VIDEO") || extra === camera) extra = "";
  const onscreen = safe(opts.hook).trim();
  const lines = [];
  if (kind === "shorts-video") {
    lines.push("IMAGE TO VIDEO. Start from the Shorts still you just generated. Use that image as the first frame.");
    lines.push("Keep this exact artist. Do not change the face, hair, or wardrobe. No warping, no new people.");
    lines.push("CAMERA: " + (camera || "Subtle 9:16 push-in. Keep the horizon steady. 8–10 seconds."));
    if (onscreen) lines.push("On-screen text: \"" + onscreen + "\".");
  } else {
    lines.push("IMAGE TO VIDEO. Start from the scene still you just generated. Use that image as the first frame.");
    lines.push("Keep this exact artist. Do not change the face, hair, or wardrobe. No warping, no new people.");
    lines.push("CAMERA: " + (camera || "Slow push-in. Hold the horizon. Subtle environmental motion only."));
  }
  if (extra) lines.push(extra);
  return lines.join("\n\n");
}

function identityDownloadRow(identity) {
  const wrap = el("div", "row");
  wrap.style.marginTop = "8px";
  wrap.style.flexWrap = "wrap";
  const id = identity && identity.id;
  const rows = (id && identityImages[id]) || [];
  if (!rows.length) {
    wrap.appendChild(el("span", "muted", identity ? "No identity image uploaded yet. Add one on the artist Visual identity page." : "No visual identity on this artist."));
    return wrap;
  }
  wrap.appendChild(el("span", "muted", "Download artist image, drop it into the generator, then paste the prompt:"));
  for (const img of rows) {
    const a = document.createElement("a");
    a.className = "link";
    a.href = img._src;
    a.download = (img.caption || img.kind || "artist-identity") + ".jpg";
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Download " + (img.kind || "image") + (img.caption ? " \u00b7 " + img.caption : "");
    a.style.marginRight = "12px";
    wrap.appendChild(a);
  }
  return wrap;
}

async function copyPrompt(text, btn, label) {
  const t = text || "";
  try { await navigator.clipboard.writeText(t); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  if (btn) {
    const old = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = label || old; }, 1200);
  }
}

async function loadVisualIdentities(artistId) {
  if (!artistId) return [];
  const { data, error } = await supabase.from("visual_identities")
    .select("*")
    .eq("artist_id", artistId)
    .eq("status", "active")
    .order("is_default", { ascending: false });
  if (error) return [];
  return data || [];
}

function visualIdentityBar(idPrefix, selectedId, label) {
  const wrap = el("div", "kv");
  wrap.style.marginTop = "10px";
  wrap.style.marginBottom = "8px";
  const top = el("div", "row");
  const pill = el("span", "pill" + (resolvedIdentity ? " ok" : " warn"),
    resolvedIdentity ? ("look: " + (resolvedIdentity.name || "default")) : "look: missing");
  top.appendChild(pill);
  top.appendChild(el("span", "muted", label || "Visual identity"));
  wrap.appendChild(top);
  wrap.appendChild(el("div", "hint", "Download the artist image, place it in the generator as the reference, then copy the prompt. Prompts say USE IMAGE and keep the artist look."));
  wrap.appendChild(identityDownloadRow(resolvedIdentity));
  const row = el("div", "row");
  row.style.marginTop = "8px";
  const sel = document.createElement("select");
  sel.id = idPrefix + "_visual_identity_id";
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = resolvedIdentity ? ("Default: " + (resolvedIdentity.name || "default")) : "(no default identity)";
  sel.appendChild(opt0);
  for (const v of visualIdentities) {
    const o = document.createElement("option");
    o.value = v.id;
    const scope = v.persona_id ? "persona" : "artist";
    o.textContent = (v.name || "default") + (v.is_default ? " \u00b7 default" : "") + " \u00b7 " + scope;
    if (selectedId && selectedId === v.id) o.selected = true;
    sel.appendChild(o);
  }
  row.appendChild(sel);
  const copy = el("button", "btn secondary", "Copy prompt block");
  copy.type = "button";
  copy.onclick = async () => {
    const id = sel.value || (resolvedIdentity && resolvedIdentity.id);
    const ident = identityById(id);
    const kind = idPrefix === "sh" ? "shorts" : "long";
    const block = composeGeneratorPrompt({ kind, identity: ident, body: composeVisualPromptBlock(ident) });
    await copyPrompt(block, copy, "Copy prompt block");
  };
  row.appendChild(copy);
  wrap.appendChild(row);
  return wrap;
}

function visualIdentitySelect(cls, selectedId) {
  const wrap = el("label", "field");
  wrap.appendChild(el("span", "", "Visual identity"));
  const sel = document.createElement("select");
  sel.className = cls;
  const opt0 = document.createElement("option");
  opt0.value = "";
  opt0.textContent = resolvedIdentity ? ("Default: " + (resolvedIdentity.name || "default")) : "(inherit / none)";
  sel.appendChild(opt0);
  for (const v of visualIdentities) {
    const o = document.createElement("option");
    o.value = v.id;
    o.textContent = (v.name || "default") + (v.is_default ? " \u00b7 default" : "");
    if (selectedId && selectedId === v.id) o.selected = true;
    sel.appendChild(o);
  }
  wrap.appendChild(sel);
  return wrap;
}

function selectedVisualId(idPrefix, fallback) {
  const n = $(idPrefix + "_visual_identity_id");
  const v = n ? n.value : "";
  return v || fallback || (resolvedIdentity && resolvedIdentity.id) || null;
}

export async function mountPackageTabs(ctx) {
  const { songId, artistId } = ctx;
  if (!songId) return;
  tabsPersonaId = ctx.personaId || null;
  visualIdentities = await loadVisualIdentities(artistId);
  resolvedIdentity = pickDefaultIdentity(visualIdentities, tabsPersonaId);
  identityImages = {};
  await Promise.all(visualIdentities.map((v) => loadImagesForIdentity(v.id)));
  await Promise.all([
    loadLong(songId),
    loadShorts(songId),
    loadCommunity(songId, artistId, ctx.albumId)
  ]);
}

async function loadLong(songId) {
  const panel = $("panel-long");
  if (!panel) return;
  const { data: pkg, error } = await supabase.from("song_long_packages").select("*").eq("song_id", songId).maybeSingle();
  if (error && tableMissing(error)) {
    panel.innerHTML = "";
    panel.appendChild(el("div", "card coming", "Long video tables are not applied yet."));
    return;
  }
  if (error) {
    panel.innerHTML = "";
    panel.appendChild(el("div", "card coming", "Could not load long video: " + error.message));
    return;
  }
  let scenes = [];
  if (pkg) {
    const r = await supabase.from("song_long_scenes").select("*").eq("long_package_id", pkg.id).order("scene_number");
    scenes = r.data || [];
  }
  renderLong(panel, songId, pkg, scenes);
}

function renderLong(panel, songId, pkg, scenes) {
  panel.innerHTML = "";
  const card = el("div", "card");
  card.appendChild(el("h2", "", "Long video"));
  const p = pkg || {};
  card.appendChild(visualIdentityBar("lf", p.visual_identity_id, "Long video + thumbnail"));
  card.appendChild(field("Video concept", "lf_video_concept", p.video_concept, { tag: "textarea" }));
  card.appendChild(field("YouTube title", "lf_youtube_title", p.youtube_title));
  card.appendChild(field("YouTube description", "lf_youtube_description", p.youtube_description, { tag: "textarea" }));
  card.appendChild(field("YouTube tags", "lf_youtube_tags", p.youtube_tags));
  card.appendChild(field("Hashtags", "lf_hashtags", p.hashtags));
  card.appendChild(field("Pinned comment", "lf_pinned_comment", p.pinned_comment, { tag: "textarea" }));
  card.appendChild(field("Thumbnail hook", "lf_thumbnail_hook", p.thumbnail_hook));
  card.appendChild(field("Thumbnail concept", "lf_thumbnail_concept", p.thumbnail_concept, { tag: "textarea" }));
  const thumbChip = el("div", "row");
  thumbChip.style.marginTop = "8px";
  const tname = resolvedIdentity ? (resolvedIdentity.name || "default") : "missing";
  thumbChip.appendChild(el("span", "pill" + (resolvedIdentity ? " ok" : " warn"), "thumbnail look: " + tname));
  const tcopy = el("button", "btn secondary", "Copy thumbnail prompt");
  tcopy.type = "button";
  function currentThumbPrompt() {
    return composeThumbnailPrompt({
      identity: identityById(selectedVisualId("lf", p.visual_identity_id)),
      hook: (card.querySelector("#lf_thumbnail_hook") || {}).value || p.thumbnail_hook,
      concept: (card.querySelector("#lf_thumbnail_concept") || {}).value || p.thumbnail_concept
    });
  }
  const savedThumb = safe(p.thumbnail_prompt).trim();
  thumbChip.appendChild(tcopy);
  const rebuildThumb = el("button", "btn secondary", "Rebuild from hook");
  rebuildThumb.type = "button";
  thumbChip.appendChild(rebuildThumb);
  card.appendChild(thumbChip);
  card.appendChild(field("Thumbnail prompt", "lf_thumbnail_prompt", savedThumb || currentThumbPrompt(), { tag: "textarea", cls: "prompt" }));
  card.appendChild(el("div", "hint", "Saved custom thumbnail prompts stay after reload. Rebuild from hook only when you want a fresh default. Download the artist photo, drop it in as the reference, then copy."));
  const thumbTa = card.querySelector("#lf_thumbnail_prompt");
  tcopy.onclick = async () => {
    await copyPrompt((thumbTa && thumbTa.value.trim()) || currentThumbPrompt(), tcopy, "Copy thumbnail prompt");
  };
  rebuildThumb.onclick = () => {
    if (thumbTa) thumbTa.value = currentThumbPrompt();
  };
  card.appendChild(field("Playlist name", "lf_playlist_name", p.playlist_name));
  const grid = el("div", "form-grid");
  grid.appendChild(field("Planned publish (ISO)", "lf_planned_publish_at", p.planned_publish_at));
  grid.appendChild(field("Publication status", "lf_publication_status", p.publication_status || "draft"));
  card.appendChild(grid);

  const sceneHost = el("div", "");
  sceneHost.id = "lf_scenes";
  card.appendChild(el("h3", "", "Scenes / stills (lyric-driven slideshow — aim for ~20)"));
  if (!scenes.length) {
    sceneHost.appendChild(el("div", "muted", "No scenes yet. Add the first one."));
  }
  for (const s of scenes) sceneHost.appendChild(sceneCard(s));
  card.appendChild(sceneHost);

  const row = el("div", "row");
  const add = el("button", "btn secondary", "Add scene");
  add.type = "button";
  add.onclick = () => {
    const n = sceneHost.querySelectorAll(".scene-card").length + 1;
    sceneHost.appendChild(sceneCard({ scene_number: n, production_status: "todo" }));
  };
  const save = el("button", "btn primary", "Save long video");
  save.type = "button";
  save.onclick = () => saveLong(songId, pkg);
  row.appendChild(add);
  row.appendChild(save);
  card.appendChild(row);
  panel.appendChild(card);
}

function sceneCard(s) {
  const card = el("div", "card scene-card");
  card.dataset.id = s.id || "";
  card.dataset.version = String(s.version || 1);
  const n = el("div", "form-grid");
  n.appendChild(field("Scene #", "", s.scene_number, { type: "number" }));
  n.lastChild.querySelector("input").className = "sc_num";
  n.appendChild(field("Lyric range / moment", "", s.lyric_range));
  n.lastChild.querySelector("input").className = "sc_lyric";
  // Legacy clock fields kept hidden — lyric-driven packages do not use them
  const startWrap = field("Start (unused)", "", s.timestamp_start || "");
  startWrap.style.display = "none";
  startWrap.querySelector("input").className = "sc_start";
  n.appendChild(startWrap);
  const endWrap = field("End (unused)", "", s.timestamp_end || "");
  endWrap.style.display = "none";
  endWrap.querySelector("input").className = "sc_end";
  n.appendChild(endWrap);
  card.appendChild(n);
  card.appendChild(el("div", "hint", "Anchor this still to a lyric moment (line/couplet/section). No clock timestamps."));
  card.appendChild(field("Visual concept", "", s.visual_concept, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sc_visual";
  const ident = identityById(s.visual_identity_id);
  const sceneImageShown = (!s.image_prompt || looksLikeIdentityDump(s.image_prompt))
    ? composeImagePrompt({ kind: "long", identity: ident, concept: s.visual_concept, body: s.image_prompt })
    : s.image_prompt;
  card.appendChild(field("Image prompt", "", sceneImageShown, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sc_image";
  card.appendChild(el("div", "hint", "Lyric-driven still: one image for this lyric moment. No image-to-video. No text baked into the still."));
  // Keep legacy video/camera fields hidden for old rows but do not encourage I2V
  const vidWrap = field("Video prompt (unused — image-only)", "", s.video_prompt || "", { tag: "textarea" });
  vidWrap.style.display = "none";
  vidWrap.querySelector("textarea").className = "sc_video";
  card.appendChild(vidWrap);
  const camWrap = field("Camera (unused)", "", s.camera_direction || "", { tag: "textarea" });
  camWrap.style.display = "none";
  camWrap.querySelector("textarea").className = "sc_camera";
  card.appendChild(camWrap);
  card.appendChild(visualIdentitySelect("sc_vi", s.visual_identity_id));
  card.appendChild(identityDownloadRow(identityById(s.visual_identity_id)));
  const scRow = el("div", "row");
  scRow.style.marginTop = "8px";
  const scImgCopy = el("button", "btn secondary", "Copy image prompt");
  scImgCopy.type = "button";
  scImgCopy.onclick = async () => {
    const ident = identityById(card.querySelector(".sc_vi")?.value);
    const block = composeGeneratorPrompt({
      kind: "long",
      identity: ident,
      concept: card.querySelector(".sc_visual")?.value,
      body: card.querySelector(".sc_image")?.value
    });
    await copyPrompt(block, scImgCopy, "Copy image prompt");
  };
  scRow.appendChild(scImgCopy);
  card.appendChild(scRow);
  card.appendChild(field("Status", "", s.production_status || "todo"));
  card.lastChild.querySelector("input").className = "sc_status";
  return card;
}

function v(id) { const n = $(id); return n ? n.value : ""; }

async function saveLong(songId, existing) {
  const msg = $("msg");
  msg.className = "msg muted";
  msg.textContent = "Saving long video\u2026";
  const row = {
    song_id: songId,
    video_concept: v("lf_video_concept") || null,
    youtube_title: v("lf_youtube_title") || null,
    youtube_description: v("lf_youtube_description") || null,
    youtube_tags: v("lf_youtube_tags") || null,
    hashtags: v("lf_hashtags") || null,
    pinned_comment: v("lf_pinned_comment") || null,
    thumbnail_hook: v("lf_thumbnail_hook") || null,
    thumbnail_concept: v("lf_thumbnail_concept") || null,
    thumbnail_prompt: v("lf_thumbnail_prompt") || null,
    playlist_name: v("lf_playlist_name") || null,
    planned_publish_at: v("lf_planned_publish_at") || null,
    publication_status: v("lf_publication_status") || "draft",
    visual_identity_id: selectedVisualId("lf", existing?.visual_identity_id),
    version: (existing?.version || 0) + 1,
    updated_at: new Date().toISOString()
  };
  let pkg = existing;
  if (!pkg) {
    const { data, error } = await supabase.from("song_long_packages").insert(row).select("*").single();
    if (error) { msg.textContent = "Save failed: " + error.message; msg.className = "msg error"; return; }
    pkg = data;
  } else {
    await snapshot("song_long_packages", pkg.id, "package", pkg, "before_save");
    const { data, error } = await supabase.from("song_long_packages").update(row).eq("id", pkg.id).eq("version", pkg.version).select("*");
    if (error) { msg.textContent = "Save failed: " + error.message; msg.className = "msg error"; return; }
    if (!data?.length) { msg.textContent = "Someone else saved this package. Refresh, then save again."; msg.className = "msg error"; return; }
    pkg = data[0];
  }
  const cards = document.querySelectorAll("#lf_scenes .scene-card");
  let n = 1;
  for (const card of cards) {
    const payload = {
      long_package_id: pkg.id,
      scene_number: Number(card.querySelector(".sc_num")?.value || n),
      lyric_range: card.querySelector(".sc_lyric")?.value || null,
      timestamp_start: null,
      timestamp_end: null,
      visual_concept: card.querySelector(".sc_visual")?.value || null,
      image_prompt: card.querySelector(".sc_image")?.value || null,
      video_prompt: card.querySelector(".sc_video")?.value || null,
      camera_direction: card.querySelector(".sc_camera")?.value || null,
      production_status: card.querySelector(".sc_status")?.value || "todo",
      visual_identity_id: card.querySelector(".sc_vi")?.value || selectedVisualId("lf", existing?.visual_identity_id),
      updated_at: new Date().toISOString()
    };
    const id = card.dataset.id;
    if (id) {
      payload.version = (Number(card.dataset.version) || 1) + 1;
      await supabase.from("song_long_scenes").update(payload).eq("id", id).eq("version", Number(card.dataset.version) || 1);
    } else {
      await supabase.from("song_long_scenes").insert(payload);
    }
    n += 1;
  }
  await supabase.from("songs").update({ long_packaged: true }).eq("id", songId);
  msg.textContent = "Long video saved.";
  msg.className = "msg success";
  await loadLong(songId);
}

async function loadShorts(songId) {
  const panel = $("panel-shorts");
  if (!panel) return;
  const { data, error } = await supabase.from("song_short_packages").select("*").eq("song_id", songId).order("short_number");
  if (error && tableMissing(error)) {
    panel.innerHTML = "";
    panel.appendChild(el("div", "card coming", "Shorts tables are not applied yet."));
    return;
  }
  if (error) {
    panel.innerHTML = "";
    panel.appendChild(el("div", "card coming", "Could not load shorts: " + error.message));
    return;
  }
  let rows = data || [];
  renderShorts(panel, songId, rows);
}

function shortCard(s) {
  const card = el("div", "card short-card");
  card.dataset.id = s.id || "";
  card.dataset.version = String(s.version || 1);
  const n = el("div", "form-grid");
  n.appendChild(field("Short #", "", s.short_number, { type: "number" }));
  n.lastChild.querySelector("input").className = "sh_num";
  n.appendChild(field("Title", "", s.title));
  n.lastChild.querySelector("input").className = "sh_title";
  n.appendChild(field("Lyric window", "", s.lyric_range));
  n.lastChild.querySelector("input").className = "sh_lyric";
  n.appendChild(field("Status", "", s.production_status || "todo"));
  n.lastChild.querySelector("input").className = "sh_status";
  card.appendChild(n);
  card.appendChild(field("On-screen text", "", s.onscreen_text, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_onscreen";
  const shIdent = identityById(s.visual_identity_id);
  const shortImageShown = (!s.image_prompt || looksLikeIdentityDump(s.image_prompt))
    ? composeImagePrompt({ kind: "shorts", identity: shIdent, concept: s.lyric_range, hook: s.onscreen_text || s.title, body: s.image_prompt })
    : s.image_prompt;
  card.appendChild(field("Image prompt", "", shortImageShown, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_image";
  card.appendChild(field("Image prompt 2", "", s.image_prompt_2, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_image2";
  card.appendChild(field("Image prompt 3", "", s.image_prompt_3, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_image3";
  card.appendChild(el("div", "hint", "Image-only Short: 3 stills (9:16). No image-to-video. No text baked into the stills."));
  const vidHidden = field("Video prompt (unused)", "", s.video_prompt || "", { tag: "textarea" });
  vidHidden.style.display = "none";
  vidHidden.querySelector("textarea").className = "sh_video";
  card.appendChild(vidHidden);
  const camHidden = field("Camera (unused)", "", s.camera_direction || "", { tag: "textarea" });
  camHidden.style.display = "none";
  camHidden.querySelector("textarea").className = "sh_camera";
  card.appendChild(camHidden);
  card.appendChild(field("Description", "", s.description, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_desc";
  card.appendChild(field("YouTube tags", "", s.youtube_tags, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_tags";
  card.appendChild(field("Hashtags", "", s.hashtags));
  card.lastChild.querySelector("input").className = "sh_hash";
  card.appendChild(field("Pinned comment", "", s.pinned_comment, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_pinned";
  card.appendChild(visualIdentitySelect("sh_vi", s.visual_identity_id));
  card.appendChild(identityDownloadRow(identityById(s.visual_identity_id)));
  const shRow = el("div", "row");
  shRow.style.marginTop = "8px";
  const shImgCopy = el("button", "btn secondary", "Copy image prompt");
  shImgCopy.type = "button";
  shImgCopy.onclick = async () => {
    const ident = identityById(card.querySelector(".sh_vi")?.value);
    const block = composeGeneratorPrompt({
      kind: "shorts",
      identity: ident,
      hook: card.querySelector(".sh_onscreen")?.value || card.querySelector(".sh_title")?.value,
      concept: card.querySelector(".sh_lyric")?.value,
      body: card.querySelector(".sh_image")?.value
    });
    await copyPrompt(block, shImgCopy, "Copy image prompt");
  };
  const shImg2Copy = el("button", "btn secondary", "Copy image 2");
  shImg2Copy.type = "button";
  shImg2Copy.onclick = async () => {
    const ident = identityById(card.querySelector(".sh_vi")?.value);
    const block = composeGeneratorPrompt({
      kind: "shorts",
      identity: ident,
      hook: card.querySelector(".sh_onscreen")?.value || card.querySelector(".sh_title")?.value,
      concept: card.querySelector(".sh_lyric")?.value,
      body: card.querySelector(".sh_image2")?.value
    });
    await copyPrompt(block, shImg2Copy, "Copy image 2");
  };
  const shImg3Copy = el("button", "btn secondary", "Copy image 3");
  shImg3Copy.type = "button";
  shImg3Copy.onclick = async () => {
    const ident = identityById(card.querySelector(".sh_vi")?.value);
    const block = composeGeneratorPrompt({
      kind: "shorts",
      identity: ident,
      hook: card.querySelector(".sh_onscreen")?.value || card.querySelector(".sh_title")?.value,
      concept: card.querySelector(".sh_lyric")?.value,
      body: card.querySelector(".sh_image3")?.value
    });
    await copyPrompt(block, shImg3Copy, "Copy image 3");
  };
  shRow.appendChild(shImgCopy);
  shRow.appendChild(shImg2Copy);
  shRow.appendChild(shImg3Copy);
  card.appendChild(shRow);
  return card;
}

function renderShorts(panel, songId, rows) {
  panel.innerHTML = "";
  const card = el("div", "card");
  card.appendChild(el("h2", "", "Shorts"));
  card.appendChild(el("div", "muted", "Default is five Shorts. Each Short uses 3 still images (slideshow). No image-to-video."));
  card.appendChild(visualIdentityBar("sh", resolvedIdentity && resolvedIdentity.id, "Shorts"));
  const host = el("div", "");
  host.id = "sh_host";
  const list = rows.slice();
  while (list.length < 5) list.push({ short_number: list.length + 1, production_status: "todo" });
  for (const s of list) host.appendChild(shortCard(s));
  card.appendChild(host);
  const row = el("div", "row");
  const add = el("button", "btn secondary", "Add short");
  add.type = "button";
  add.onclick = () => {
    const n = host.querySelectorAll(".short-card").length + 1;
    host.appendChild(shortCard({ short_number: n, production_status: "todo" }));
  };
  const save = el("button", "btn primary", "Save shorts");
  save.type = "button";
  save.onclick = () => saveShorts(songId);
  row.appendChild(add);
  row.appendChild(save);
  card.appendChild(row);
  panel.appendChild(card);
}

async function writeShortRow(id, payload, priorVersion) {
  const optionalCols = ["youtube_tags", "camera_direction"];
  let body = Object.assign({}, payload);
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    if (id) {
      res = await supabase.from("song_short_packages").update(body).eq("id", id).eq("version", priorVersion);
    } else {
      res = await supabase.from("song_short_packages").insert(body);
    }
    if (!res.error) return { ok: true, dropped: optionalCols.filter((c) => !(c in body)) };
    const m = (res.error.message || "") + " " + (res.error.code || "") + " " + (res.error.details || "");
    const drop = optionalCols.filter((c) => (c in body) && new RegExp(c, "i").test(m));
    if (!drop.length) return { ok: false, error: res.error.message };
    for (const c of drop) delete body[c];
  }
  return { ok: false, error: "Could not save short after stripping optional columns." };
}

async function saveShorts(songId) {
  const msg = $("msg");
  msg.className = "msg muted";
  msg.textContent = "Saving shorts\u2026";
  const cards = document.querySelectorAll("#sh_host .short-card");
  let n = 1;
  let warnMissing = false;
  for (const card of cards) {
    const payload = {
      song_id: songId,
      short_number: Number(card.querySelector(".sh_num")?.value || n),
      title: card.querySelector(".sh_title")?.value || null,
      lyric_range: card.querySelector(".sh_lyric")?.value || null,
      production_status: card.querySelector(".sh_status")?.value || "todo",
      onscreen_text: card.querySelector(".sh_onscreen")?.value || null,
      image_prompt: card.querySelector(".sh_image")?.value || null,
      image_prompt_2: card.querySelector(".sh_image2")?.value || null,
      image_prompt_3: card.querySelector(".sh_image3")?.value || null,
      video_prompt: null,
      camera_direction: null,
      description: card.querySelector(".sh_desc")?.value || null,
      youtube_tags: card.querySelector(".sh_tags")?.value || null,
      hashtags: card.querySelector(".sh_hash")?.value || null,
      pinned_comment: card.querySelector(".sh_pinned")?.value || null,
      visual_identity_id: card.querySelector(".sh_vi")?.value || selectedVisualId("sh", resolvedIdentity && resolvedIdentity.id),
      updated_at: new Date().toISOString()
    };
    const id = card.dataset.id;
    if (id) {
      payload.version = (Number(card.dataset.version) || 1) + 1;
      await snapshot("song_short_packages", id, "package", payload, "before_save");
      const wr = await writeShortRow(id, payload, Number(card.dataset.version) || 1);
      if (!wr.ok) { msg.textContent = "Save failed: " + wr.error; msg.className = "msg error"; return; }
      if (wr.dropped && wr.dropped.length) warnMissing = true;
    } else {
      const empty = !payload.title && !payload.lyric_range && !payload.onscreen_text && !payload.image_prompt && !payload.image_prompt_2 && !payload.image_prompt_3 && !payload.youtube_tags && !payload.pinned_comment;
      if (!empty) {
        const wr = await writeShortRow(null, payload, 1);
        if (!wr.ok) { msg.textContent = "Save failed: " + wr.error; msg.className = "msg error"; return; }
        if (wr.dropped && wr.dropped.length) warnMissing = true;
      }
    }
    n += 1;
  }
  await supabase.from("songs").update({ short_packaged: true }).eq("id", songId);
  msg.textContent = warnMissing
    ? "Shorts saved. Tags/camera columns were missing on one write path; refresh and save again if tags did not stick."
    : "Shorts saved.";
  msg.className = "msg success";
  await loadShorts(songId);
}

function communityBuilderRow(songId) {
  const row = el("div", "row");
  row.style.marginBottom = "14px";
  const link = document.createElement("a");
  link.id = "btnCommunityBuilder";
  link.className = "btn primary";
  link.textContent = "BUILD COMMUNITY POST";
  link.href = "./song-community-builder.html?song_id=" + encodeURIComponent(songId);
  row.appendChild(link);
  const hint = el("span", "muted", "Build a copy-paste YouTube Community post prompt from this song.");
  row.appendChild(hint);
  return row;
}

async function loadCommunity(songId, artistId, albumId) {
  const panel = $("panel-community");
  if (!panel) return;
  const { data, error } = await supabase.from("community_posts").select("*").eq("song_id", songId).order("created_at", { ascending: false });
  if (error && tableMissing(error)) {
    panel.innerHTML = "";
    const card = el("div", "card");
    card.appendChild(el("h2", "", "Community posts"));
    card.appendChild(communityBuilderRow(songId));
    card.appendChild(el("div", "muted", "Saved community post storage is not applied yet. You can still build a ready-to-paste YouTube Community post with the builder."));
    panel.appendChild(card);
    return;
  }
  renderCommunity(panel, songId, artistId, albumId, error ? [] : (data || []));
}

function renderCommunity(panel, songId, artistId, albumId, posts) {
  panel.innerHTML = "";
  const card = el("div", "card");
  card.appendChild(el("h2", "", "Community posts"));
  card.appendChild(communityBuilderRow(songId));
  card.appendChild(field("New post", "cm_body", "", { tag: "textarea" }));
  card.appendChild(field("Scripture", "cm_scripture", ""));
  const save = el("button", "btn primary", "Save post");
  save.type = "button";
  save.onclick = async () => {
    const body = v("cm_body");
    if (!body.trim()) return;
    const { error } = await supabase.from("community_posts").insert({
      artist_id: artistId, album_id: albumId || null, song_id: songId,
      body, scripture: v("cm_scripture") || null, publication_status: "draft", source: "human"
    });
    const msg = $("msg");
    if (error) { msg.textContent = "Save failed: " + error.message; msg.className = "msg error"; return; }
    msg.textContent = "Community post saved.";
    msg.className = "msg success";
    await loadCommunity(songId, artistId, albumId);
  };
  card.appendChild(save);
  for (const p of posts) {
    const c = el("div", "card");
    c.appendChild(el("div", "muted", (p.publication_status || "draft") + " \u00b7 " + safe(p.planned_publish_at || p.updated_at)));
    c.appendChild(el("div", "", p.body || ""));
    card.appendChild(c);
  }
  panel.appendChild(card);
}
