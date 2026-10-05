const { Events, time } = require('discord.js');
const store = require('../store');
const memberCounter = require('../memberCounter');
const { embed, logFields, fillPlaceholders } = require('../util');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    const { guild, user } = member;
    const network = store.getNetwork();
    const networkBan = network.bans[user.id];
    if (networkBan && network.servers.includes(guild.id)) {
      await guild.members
        .ban(user.id, { reason: `Network ban: ${networkBan.reason}` })
        .then(() =>
          logFields(guild, 'network', 'Network-banned user blocked', [
            ['User', `${user.tag} (${user.id})`],
            ['Reason', networkBan.reason],
          ]),
        )
        .catch((err) => console.error(`[networkban:${guild.id}]`, err.message));
      return;
    }

    memberCounter.markDirty(guild.id);
    const config = store.getGuild(guild.id);

    await logFields(
      guild,
      'members',
      'Member joined',
      [
        ['User', `${user.tag} (${user.id})`],
        ['Account created', time(user.createdAt, 'R')],
        ['Member count', guild.memberCount],
      ],
      'success',
    );

    if (config.autoRoleId) {
      await member.roles
        .add(config.autoRoleId, 'Auto role')
        .catch((err) => console.error(`[autorole:${guild.id}]`, err.message));
    }

    const channel = config.welcomeChannelId && guild.channels.cache.get(config.welcomeChannelId);
    if (channel?.isTextBased()) {
      const text = fillPlaceholders(config.welcomeMessage, { user, guild });
      await channel
        .send({ content: `<@${user.id}>`, embeds: [embed('info', text).setThumbnail(user.displayAvatarURL())] })
        .catch(() => {});
    }
  },
};
