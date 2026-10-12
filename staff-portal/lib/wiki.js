// Knowledge base (wiki). How-to pages anyone can write and edit, in simple Markdown. Every edit is
// kept in the page's history (the last 50), so changes can be seen and old versions restored.
// People who manage documents can delete pages. Stored in DATA_DIR/wiki.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const KEEP_HISTORY = 50;
const MANAGE = "documents.manage";

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "wiki.json", () => ({ pages: [] }));
  if (!db.data.pages.length && !db.data.seeded) {
    const now = new Date().toISOString();
    db.data.pages.push({
      id: crypto.randomBytes(8).toString("hex"), slug: "welcome", title: "Welcome to the knowledge base", section: "General",
      body: "# Welcome\n\nThis is the HN Group knowledge base: how-to guides anyone can write and improve.\n\n## Writing a page\n\n- Use **New page** to start one.\n- Headings start with `#`, lists with `-`, and **bold** text has two stars each side.\n- Link to another page with [[Page title]], or to a website with [text](https://example.com).\n\nEvery change is saved in the page history, so nothing is lost.",
      createdBy: null, createdAt: now, updatedBy: null, updatedAt: now, history: [],
    });
    db.data.seeded = true;
    db.save();
  }
}

const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);

function slugify(t) {
  return String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "page";
}

function uniqueSlug(title, except) {
  const base = slugify(title);
  let s = base, n = 2;
  while (db.data.pages.some((p) => p.slug === s && p !== except)) s = `${base}-${n++}`;
  return s;
}

function save(input, by, existing) {
  const title = str(input.title, 120);
  if (!title) throw new store.ValidationError("Give the page a title.");
  const body = String(input.body || "").slice(0, 100000);
  if (!body.trim()) throw new store.ValidationError("Write something on the page.");
  const section = str(input.section, 60) || "General";
  const now = new Date().toISOString();
  if (existing) {
    if (input.baseUpdatedAt && input.baseUpdatedAt !== existing.updatedAt) throw new store.ValidationError("Someone else changed this page while you were editing. Copy your changes, reload the page and try again.");
    existing.history.push({ title: existing.title, body: existing.body, section: existing.section, by: existing.updatedBy, at: existing.updatedAt, note: existing.note || "" });
    if (existing.history.length > KEEP_HISTORY) existing.history.splice(0, existing.history.length - KEEP_HISTORY);
    if (existing.title !== title) existing.slug = uniqueSlug(title, existing);
    Object.assign(existing, { title, body, section, updatedBy: by.id, updatedAt: now, note: str(input.note, 200) });
    db.save();
    return existing;
  }
  const page = { id: crypto.randomBytes(8).toString("hex"), slug: uniqueSlug(title), title, body, section, createdBy: by.id, createdAt: now, updatedBy: by.id, updatedAt: now, note: "Created", history: [] };
  db.data.pages.push(page);
  db.save();
  return page;
}

function bySlug(slug) {
  return db.data.pages.find((p) => p.slug === slug) || null;
}

function byTitle(title) {
  const t = String(title || "").trim().toLowerCase();
  return db.data.pages.find((p) => p.title.toLowerCase() === t) || null;
}

function restore(page, index, by) {
  const h = page.history[Number(index)];
  if (!h) throw new store.ValidationError("That version isn't available.");
  return save({ title: h.title, body: h.body, section: h.section, note: `Restored the version from ${h.at.slice(0, 10)}` }, by, page);
}

function remove(page) {
  db.data.pages = db.data.pages.filter((p) => p.id !== page.id);
  db.save();
}

const nameOf = (id) => { const p = id ? store.getPerson(id) : null; return p ? p.displayName : id ? "Former staff" : "HN Group"; };

function view(page, full) {
  const out = { id: page.id, slug: page.slug, title: page.title, section: page.section, updatedAt: page.updatedAt, updatedByName: nameOf(page.updatedBy), createdByName: nameOf(page.createdBy), edits: page.history.length + 1 };
  if (full) {
    out.body = page.body;
    out.history = page.history.map((h, i) => ({ index: i, title: h.title, at: h.at, byName: nameOf(h.by), note: h.note, body: h.body })).reverse();
    out.note = page.note || "";
    // Pages that link here.
    out.linkedFrom = db.data.pages.filter((p) => p !== page && p.body.toLowerCase().includes("[[" + page.title.toLowerCase() + "]]")).map((p) => ({ slug: p.slug, title: p.title }));
  }
  return out;
}

function list() {
  return db.data.pages.slice().sort((a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title)).map((p) => view(p, false));
}

function search(text) {
  const t = String(text || "").toLowerCase();
  return db.data.pages.filter((p) => (p.title + " " + p.body).toLowerCase().includes(t));
}

module.exports = { MANAGE, init, save, bySlug, byTitle, restore, remove, view, list, search };
