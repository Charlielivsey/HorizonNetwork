const { Events } = require('discord.js');
const store = require('../store');

module.exports = {
  name: Events.ChannelDelete,
  execute(channel) {
    if (!channel.guild) return;
    const config = store.getGuild(channel.guild.id);
    if (!config.tickets.open[channel.id] && config.memberCounter.channelId !== channel.id) return;
    store.updateGuild(channel.guild.id, (c) => {
      delete c.tickets.open[channel.id];
      if (c.memberCounter.channelId === channel.id) c.memberCounter.channelId = null;
    });
  },
};
