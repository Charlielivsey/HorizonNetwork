const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { embed, modLog, hierarchyError } = require('../util');

module.exports = {
  category: 'Moderation',
  permission: PermissionFlagsBits.BanMembers,
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(400))
    .addIntegerOption((o) =>
      o
        .setName('delete_days')
        .setDescription('Delete their messages from the last N days (0-7)')
        .setMinValue(0)
        .setMaxValue(7),
    ),

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') ?? 'No reason given';
    const days = interaction.options.getInteger('delete_days') ?? 0;
    const member = interaction.options.getMember('user');

    const err = hierarchyError(interaction, member);
    if (err) return interaction.reply({ embeds: [embed('error', err)], flags: MessageFlags.Ephemeral });
    if (member && !member.bannable) {
      return interaction.reply({
        embeds: [embed('error', 'I cannot ban that member. Check my role is above theirs.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await user.send(`You were banned from **${interaction.guild.name}**: ${reason}`).catch(() => {});
    await interaction.guild.members.ban(user.id, {
      reason: `${interaction.user.tag}: ${reason}`,
      deleteMessageSeconds: days * 86400,
    });

    await interaction.reply({ embeds: [embed('success', `**${user.tag}** was banned.\nReason: ${reason}`)] });
    await modLog(interaction.guild, 'Member banned', [
      ['User', `${user.tag} (${user.id})`],
      ['Moderator', interaction.user.tag],
      ['Reason', reason],
    ]);
  },
};
