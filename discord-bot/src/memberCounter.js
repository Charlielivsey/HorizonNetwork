const store = require('./store');

// Discord only allows 2 channel renames per 10 minutes, so changes are batched.
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;
const dirty = new Set();

function counterName(guild, template) {
  return template.replaceAll('{count}', guild.memberCount.toLocaleString('en-GB')).slice(0, 100);
}

async function updateCounter(guild) {
  const { memberCounter } = store.getGuild(guild.id);
  if (!memberCounter.channelId) return;
  const channel = guild.channels.cache.get(memberCounter.channelId);
  if (!channel) return;
  const name = counterName(guild, memberCounter.template);
  if (channel.name !== name) await channel.setName(name, 'Member counter update');
}

function markDirty(guildId) {
  dirty.add(guildId);
}

function start(client) {
  setInterval(() => {
    for (const guildId of dirty) {
      dirty.delete(guildId);
      const guild = client.guilds.cache.get(guildId);
      if (guild) updateCounter(guild).catch((err) => console.error(`[counter:${guildId}]`, err.message));
    }
  }, UPDATE_INTERVAL_MS);
}

module.exports = { counterName, updateCounter, markDirty, start };
