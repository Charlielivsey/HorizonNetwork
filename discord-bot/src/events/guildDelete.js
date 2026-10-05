const { Events } = require('discord.js');
const store = require('../store');

module.exports = {
  name: Events.GuildDelete,
  execute(guild) {
    if (!guild.available) return;
    console.log(`Removed from server: ${guild.name} (${guild.id})`);
    store.deleteGuild(guild.id);
  },
};
