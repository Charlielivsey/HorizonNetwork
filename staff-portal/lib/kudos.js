// Kudos wall and staff milestones. Anyone can thank colleagues publicly ("kudos"), tagged with a
// value like Teamwork; others react. Milestones are worked out from staff records each day:
// birthdays (for people who share theirs), work anniversaries and new starters. People can say
// congratulations on a milestone. Stored in DATA_DIR/kudos.json.

const crypto = require("crypto");
const store = require("./store");
const datafile = require("./datafile");

const VALUES = {
  teamwork: "Teamwork",
  "above-and-beyond": "Above and beyond",
  customers: "Customer focus",
  ideas: "Great idea",
  helping: "Helping hand",
  thanks: "Thank you",
};
const REACTIONS = ["👏", "❤️", "🎉", "🙌", "😂"];
const MODERATE = "announcements.manage";

let db;

function init(dataDir) {
  db = datafile.open(dataDir, "kudos.json", () => ({ posts: [], congrats: {} }));
}

const newId = () => crypto.randomBytes(8).toString("hex");
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);

function brief(id) {
  const p = id ? store.getPerson(id) : null;
  if (!p) return { id, displayName: "Former staff" };
  return { id: p.id, displayName: p.displayName, jobTitle: p.jobTitle, company: p.company, avatarUrl: store.publicView(p).avatarUrl };
}

function give(from, input) {
  if (from.system) throw new store.ValidationError("The admin account can't give kudos.");
  const to = [...new Set((Array.isArray(input.to) ? input.to : []).filter((id) => id !== from.id))].slice(0, 10)
    .filter((id) => { const p = store.getPerson(id); return p && !p.system; });
  if (!to.length) throw new store.ValidationError("Choose who you're thanking.");
  const message = str(input.message, 600);
  if (!message) throw new store.ValidationError("Say what they did.");
  const post = { id: newId(), from: from.id, to, value: VALUES[input.value] ? input.value : "thanks", message, at: new Date().toISOString(), reactions: {} };
  db.data.posts.push(post);
  db.save();
  return post;
}

function get(id) {
  return db.data.posts.find((p) => p.id === id) || null;
}

function react(post, person, emoji) {
  if (!REACTIONS.includes(emoji)) throw new store.ValidationError("Choose a reaction.");
  const list = post.reactions[emoji] || (post.reactions[emoji] = []);
  const i = list.indexOf(person.id);
  if (i === -1) list.push(person.id); else list.splice(i, 1);
  db.save();
}

function canDelete(viewer, post) {
  return post.from === viewer.id || store.can(viewer, MODERATE);
}

function remove(post) {
  db.data.posts = db.data.posts.filter((p) => p.id !== post.id);
  db.save();
}

function view(post, viewer) {
  return {
    id: post.id, at: post.at, message: post.message, value: post.value, valueLabel: VALUES[post.value],
    from: brief(post.from), to: post.to.map(brief),
    reactions: REACTIONS.map((emoji) => ({ emoji, count: (post.reactions[emoji] || []).length, mine: (post.reactions[emoji] || []).includes(viewer.id) })),
    canDelete: canDelete(viewer, post),
  };
}

// Newest first; optionally only kudos involving some people (for a team page).
function list(viewer, opts) {
  opts = opts || {};
  let posts = db.data.posts.slice().reverse();
  if (opts.people) {
    const set = new Set(opts.people);
    posts = posts.filter((p) => set.has(p.from) || p.to.some((id) => set.has(id)));
  }
  return posts.slice(0, opts.limit || 100).map((p) => view(p, viewer));
}

// Most thanked people this month.
function leaders() {
  const month = today().slice(0, 7);
  const counts = {};
  for (const p of db.data.posts) if (p.at.slice(0, 7) === month) for (const id of p.to) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ ...brief(id), count: n }));
}

function countBetween(from, to) {
  return db.data.posts.filter((p) => p.at.slice(0, 10) >= from && p.at.slice(0, 10) <= to).length;
}

// ---------- Milestones ----------

function addDays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Birthdays and anniversaries in the next `ahead` days (and today), plus people who started in
// the last fortnight or start soon.
function milestones(viewer, opts) {
  opts = opts || {};
  const ahead = opts.ahead == null ? 7 : opts.ahead;
  const t = today();
  const end = addDays(t, ahead);
  const set = opts.people ? new Set(opts.people) : null;
  const out = [];
  for (const p of store.employees()) {
    if (set && !set.has(p.id)) continue;
    // The next occurrence of a month/day on or after today.
    const nextOf = (month, day) => {
      let y = Number(t.slice(0, 4));
      let d = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (d < t) d = `${y + 1}${d.slice(4)}`;
      return d;
    };
    if (p.birthday && p.birthday.show) {
      const d = nextOf(p.birthday.month, p.birthday.day);
      if (d <= end) out.push({ type: "birthday", date: d, person: brief(p.id), title: `${p.displayName}'s birthday` });
    }
    if (p.startDate) {
      const [sy, sm, sd] = p.startDate.split("-").map(Number);
      const d = nextOf(sm, sd);
      const years = Number(d.slice(0, 4)) - sy;
      if (years >= 1 && d <= end) out.push({ type: "anniversary", date: d, years, person: brief(p.id), title: `${p.displayName}: ${years} year${years === 1 ? "" : "s"} at HN Group` });
      if (p.startDate >= addDays(t, -14) && p.startDate <= end) out.push({ type: "starter", date: p.startDate, person: brief(p.id), title: p.startDate > t ? `${p.displayName} joins us` : `Welcome ${p.displayName}` });
    }
  }
  return out.map((x) => {
    const key = `${x.type}:${x.person.id}:${x.date}`;
    const list = db.data.congrats[key] || [];
    return { ...x, key, today: x.date === t, congrats: list.length, congratsNames: list.slice(-5).map((id) => brief(id).displayName), mine: list.includes(viewer.id), self: x.person.id === viewer.id };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function congratulate(key, person) {
  if (!/^(birthday|anniversary|starter):[a-f0-9]{16}:\d{4}-\d{2}-\d{2}$/.test(String(key || ""))) throw new store.ValidationError("That isn't a milestone.");
  const list = db.data.congrats[key] || (db.data.congrats[key] = []);
  const i = list.indexOf(person.id);
  if (i === -1) list.push(person.id); else list.splice(i, 1);
  // Old milestones are tidied away after a few months.
  const cutoff = addDays(today(), -120);
  for (const k of Object.keys(db.data.congrats)) if (k.slice(-10) < cutoff) delete db.data.congrats[k];
  db.save();
  return i === -1;
}

module.exports = { VALUES, REACTIONS, init, give, get, react, canDelete, remove, list, leaders, countBetween, milestones, congratulate };
