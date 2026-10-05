const { Events } = require('discord.js');

module.exports = {
  name: Events.GuildCreate,
  execute(guild) {
    console.log(`Joined server: ${guild.name} (${guild.id}), ${guild.memberCount} members`);
  },
};
