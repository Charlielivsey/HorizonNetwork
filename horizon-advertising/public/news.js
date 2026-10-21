// Shows the news sent to Horizon Advertising from HN Group News.
(async function () {
  const section = document.getElementById("news"), list = document.getElementById("news-list");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  try {
    const r = await fetch("/api/news");
    if (!r.ok) return;
    const posts = (await r.json()).posts || [];
    if (!posts.length) return;
    list.innerHTML = posts.map((p) => '<article class="card"><p class="meta">' + esc(p.category) + " · " + esc(new Date(p.publishedAt || p.updatedAt).toLocaleDateString("en-GB")) + "</p><h3>" + esc(p.title) + "</h3><p>" + esc(p.summary) + '</p><details><summary>Read more</summary><p class="body">' + esc(p.body) + "</p></details></article>").join("");
    section.hidden = false;
  } catch {}
})();
