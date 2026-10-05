const { Events, ActivityType } = require('discord.js');
const store = require('../store');
const memberCounter = require('../memberCounter');
const { syncCustomCommands } = require('../customCommands');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    const app = await client.application.fetch();
    if (app.owner?.members) app.owner.members.forEach((m) => client.owners.add(m.id));
    else if (app.owner) client.owners.add(app.owner.id);

    const body = client.commands.map((c) => c.data.toJSON());
    await client.application.commands.set(body);
    console.log(`Registered ${body.length} global slash commands.`);

    for (const guildId of store.allGuildIds()) {
      const guild = client.guilds.cache.get(guildId);
      if (guild && Object.keys(store.getGuild(guildId).customCommands).length) {
        await syncCustomCommands(guild).catch((err) => console.error(`[custom:${guildId}]`, err.message));
      }
      if (guild) memberCounter.markDirty(guildId);
    }
    memberCounter.start(client);

    const setPresence = () => {
      const status = client.customStatus;
      client.user.setActivity(status?.text ?? `${client.guilds.cache.size} servers | /help`, {
        type: status?.type ?? ActivityType.Watching,
      });
    };
    client.refreshPresence = setPresence;
    setPresence();
    setInterval(setPresence, 10 * 60 * 1000);

    console.log(`Logged in as ${client.user.tag} in ${client.guilds.cache.size} servers.`);
  },
};
