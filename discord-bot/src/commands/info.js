const { SlashCommandBuilder, InteractionContextType, time } = require('discord.js');
const { embed } = require('../util');

module.exports = {
  category: 'Information',
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Show information about the server or a user')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('server').setDescription('Information about this server'))
    .addSubcommand((s) =>
      s
        .setName('user')
        .setDescription('Information about a user')
        .addUserOption((o) => o.setName('user').setDescription('User to look up')),
    )
    .addSubcommand((s) =>
      s
        .setName('avatar')
        .setDescription("Show a user's avatar")
        .addUserOption((o) => o.setName('user').setDescription('User to show')),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'server') {
      const g = interaction.guild;
      const e = embed('info', g.description || '', g.name)
        .setThumbnail(g.iconURL())
        .addFields(
          { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
          { name: 'Members', value: String(g.memberCount), inline: true },
          { name: 'Channels', value: String(g.channels.cache.size), inline: true },
          { name: 'Roles', value: String(g.roles.cache.size), inline: true },
          { name: 'Boosts', value: String(g.premiumSubscriptionCount ?? 0), inline: true },
          { name: 'Created', value: time(g.createdAt, 'R'), inline: true },
        );
      return interaction.reply({ embeds: [e] });
    }

    const user = interaction.options.getUser('user') ?? interaction.user;

    if (sub === 'avatar') {
      const url = user.displayAvatarURL({ size: 1024 });
      return interaction.reply({ embeds: [embed('info', `[Open full size](${url})`, user.tag).setImage(url)] });
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const e = embed('info', `<@${user.id}>`, user.tag)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Account created', value: time(user.createdAt, 'R'), inline: true },
      );
    if (member) {
      const roles = member.roles.cache
        .filter((r) => r.id !== interaction.guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => `<@&${r.id}>`);
      e.addFields(
        { name: 'Joined server', value: time(member.joinedAt, 'R'), inline: true },
        { name: `Roles (${roles.length})`, value: roles.slice(0, 20).join(' ') || 'None' },
      );
    }
    return interaction.reply({ embeds: [e] });
  },
};
