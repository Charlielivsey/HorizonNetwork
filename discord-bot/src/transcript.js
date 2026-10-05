const { AttachmentBuilder } = require('discord.js');

const MAX_MESSAGES = 5000;

async function fetchAllMessages(channel, limit = MAX_MESSAGES) {
  const all = [];
  let before;
  while (all.length < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
  }
  return all.reverse();
}

function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderMessage(m) {
  const parts = [];
  if (m.content) parts.push(`<div class="content">${escapeHtml(m.content).replaceAll('\n', '<br>')}</div>`);
  for (const e of m.embeds) {
    parts.push(
      `<div class="embed">${e.title ? `<strong>${escapeHtml(e.title)}</strong><br>` : ''}${escapeHtml(
        e.description ?? '',
      ).replaceAll('\n', '<br>')}${e.fields
        .map((f) => `<div><strong>${escapeHtml(f.name)}</strong>: ${escapeHtml(f.value)}</div>`)
        .join('')}</div>`,
    );
  }
  for (const a of m.attachments.values()) {
    parts.push(`<div class="attachment"><a href="${escapeHtml(a.url)}">${escapeHtml(a.name)}</a></div>`);
  }
  return `<div class="msg">
  <img class="avatar" src="${escapeHtml(m.author.displayAvatarURL({ size: 64 }))}" alt="">
  <div><span class="author">${escapeHtml(m.author.tag)}</span>${m.author.bot ? '<span class="bot">BOT</span>' : ''}
  <span class="time">${m.createdAt.toUTCString()}</span>${parts.join('')}</div>
</div>`;
}

async function createTranscript(channel, title) {
  const messages = await fetchAllMessages(channel);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{background:#313338;color:#dbdee1;font-family:system-ui,sans-serif;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 4px}.meta{color:#949ba4;margin-bottom:24px;font-size:14px}
.msg{display:flex;gap:12px;padding:8px 0;border-top:1px solid #3f4147}
.avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0}
.author{font-weight:600;color:#f2f3f5}.time{color:#949ba4;font-size:12px;margin-left:8px}
.bot{background:#5865f2;color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;margin-left:6px}
.content{margin-top:2px;white-space:pre-wrap;word-break:break-word}
.embed{border-left:4px solid #5865f2;background:#2b2d31;padding:8px 12px;margin-top:6px;border-radius:4px}
a{color:#00a8fc}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">#${escapeHtml(channel.name)} in ${escapeHtml(channel.guild.name)} · ${messages.length} messages · generated ${new Date().toUTCString()}</div>
${messages.map(renderMessage).join('\n')}
</body></html>`;

  return {
    count: messages.length,
    file: new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `transcript-${channel.name}.html` }),
  };
}

module.exports = { createTranscript };
