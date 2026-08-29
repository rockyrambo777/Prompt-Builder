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

export async function mountPackageTabs(ctx) {
  const { songId, artistId } = ctx;
  if (!songId) return;
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
  card.appendChild(field("Video concept", "lf_video_concept", p.video_concept, { tag: "textarea" }));
  card.appendChild(field("YouTube title", "lf_youtube_title", p.youtube_title));
  card.appendChild(field("YouTube description", "lf_youtube_description", p.youtube_description, { tag: "textarea" }));
  card.appendChild(field("YouTube tags", "lf_youtube_tags", p.youtube_tags));
  card.appendChild(field("Hashtags", "lf_hashtags", p.hashtags));
  card.appendChild(field("Pinned comment", "lf_pinned_comment", p.pinned_comment, { tag: "textarea" }));
  card.appendChild(field("Thumbnail hook", "lf_thumbnail_hook", p.thumbnail_hook));
  card.appendChild(field("Thumbnail concept", "lf_thumbnail_concept", p.thumbnail_concept, { tag: "textarea" }));
  card.appendChild(field("Thumbnail prompt", "lf_thumbnail_prompt", p.thumbnail_prompt, { tag: "textarea" }));
  card.appendChild(field("Playlist name", "lf_playlist_name", p.playlist_name));
  const grid = el("div", "form-grid");
  grid.appendChild(field("Planned publish (ISO)", "lf_planned_publish_at", p.planned_publish_at));
  grid.appendChild(field("Publication status", "lf_publication_status", p.publication_status || "draft"));
  card.appendChild(grid);

  const sceneHost = el("div", "");
  sceneHost.id = "lf_scenes";
  card.appendChild(el("h3", "", "Scenes (one row each, for family collaboration)"));
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
  n.appendChild(field("Lyric range", "", s.lyric_range));
  n.lastChild.querySelector("input").className = "sc_lyric";
  n.appendChild(field("Start", "", s.timestamp_start));
  n.lastChild.querySelector("input").className = "sc_start";
  n.appendChild(field("End", "", s.timestamp_end));
  n.lastChild.querySelector("input").className = "sc_end";
  card.appendChild(n);
  card.appendChild(field("Visual concept", "", s.visual_concept, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sc_visual";
  card.appendChild(field("Image prompt", "", s.image_prompt, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sc_image";
  card.appendChild(field("Video prompt", "", s.video_prompt, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sc_video";
  card.appendChild(field("Camera", "", s.camera_direction, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sc_camera";
  card.appendChild(field("Status", "", s.production_status || "todo"));
  card.lastChild.querySelector("input").className = "sc_status";
  return card;
}

function v(id) { const n = $(id); return n ? n.value : ""; }

async function saveLong(songId, existing) {
  const msg = $("msg");
  msg.className = "msg muted";
  msg.textContent = "Saving long video…";
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
      timestamp_start: card.querySelector(".sc_start")?.value || null,
      timestamp_end: card.querySelector(".sc_end")?.value || null,
      visual_concept: card.querySelector(".sc_visual")?.value || null,
      image_prompt: card.querySelector(".sc_image")?.value || null,
      video_prompt: card.querySelector(".sc_video")?.value || null,
      camera_direction: card.querySelector(".sc_camera")?.value || null,
      production_status: card.querySelector(".sc_status")?.value || "todo",
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
  n.appendChild(field("Lyric range", "", s.lyric_range));
  n.lastChild.querySelector("input").className = "sh_lyric";
  n.appendChild(field("Status", "", s.production_status || "todo"));
  n.lastChild.querySelector("input").className = "sh_status";
  card.appendChild(n);
  card.appendChild(field("On-screen text", "", s.onscreen_text, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_onscreen";
  card.appendChild(field("Image prompt", "", s.image_prompt, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_image";
  card.appendChild(field("Video prompt", "", s.video_prompt, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_video";
  card.appendChild(field("Description", "", s.description, { tag: "textarea" }));
  card.lastChild.querySelector("textarea").className = "sh_desc";
  card.appendChild(field("Hashtags", "", s.hashtags));
  card.lastChild.querySelector("input").className = "sh_hash";
  return card;
}

function renderShorts(panel, songId, rows) {
  panel.innerHTML = "";
  const card = el("div", "card");
  card.appendChild(el("h2", "", "Shorts"));
  card.appendChild(el("div", "muted", "Default is at least five. You can add more. Not capped at five."));
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

async function saveShorts(songId) {
  const msg = $("msg");
  msg.className = "msg muted";
  msg.textContent = "Saving shorts…";
  const cards = document.querySelectorAll("#sh_host .short-card");
  let n = 1;
  for (const card of cards) {
    const payload = {
      song_id: songId,
      short_number: Number(card.querySelector(".sh_num")?.value || n),
      title: card.querySelector(".sh_title")?.value || null,
      lyric_range: card.querySelector(".sh_lyric")?.value || null,
      production_status: card.querySelector(".sh_status")?.value || "todo",
      onscreen_text: card.querySelector(".sh_onscreen")?.value || null,
      image_prompt: card.querySelector(".sh_image")?.value || null,
      video_prompt: card.querySelector(".sh_video")?.value || null,
      description: card.querySelector(".sh_desc")?.value || null,
      hashtags: card.querySelector(".sh_hash")?.value || null,
      updated_at: new Date().toISOString()
    };
    const id = card.dataset.id;
    if (id) {
      payload.version = (Number(card.dataset.version) || 1) + 1;
      await snapshot("song_short_packages", id, "package", payload, "before_save");
      await supabase.from("song_short_packages").update(payload).eq("id", id).eq("version", Number(card.dataset.version) || 1);
    } else {
      const empty = !payload.title && !payload.lyric_range && !payload.onscreen_text && !payload.image_prompt && !payload.video_prompt;
      if (!empty) await supabase.from("song_short_packages").insert(payload);
    }
    n += 1;
  }
  await supabase.from("songs").update({ short_packaged: true }).eq("id", songId);
  msg.textContent = "Shorts saved.";
  msg.className = "msg success";
  await loadShorts(songId);
}

async function loadCommunity(songId, artistId, albumId) {
  const panel = $("panel-community");
  if (!panel) return;
  const { data, error } = await supabase.from("community_posts").select("*").eq("song_id", songId).order("created_at", { ascending: false });
  if (error && tableMissing(error)) {
    panel.innerHTML = "";
    panel.appendChild(el("div", "card coming", "Community tables are not applied yet."));
    return;
  }
  renderCommunity(panel, songId, artistId, albumId, error ? [] : (data || []));
}

function renderCommunity(panel, songId, artistId, albumId, posts) {
  panel.innerHTML = "";
  const card = el("div", "card");
  card.appendChild(el("h2", "", "Community posts"));
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
    c.appendChild(el("div", "muted", (p.publication_status || "draft") + " · " + safe(p.planned_publish_at || p.updated_at)));
    c.appendChild(el("div", "", p.body || ""));
    card.appendChild(c);
  }
  panel.appendChild(card);
}
