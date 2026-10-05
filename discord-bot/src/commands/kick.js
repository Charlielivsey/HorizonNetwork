const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { embed, modLog, hierarchyError } = require('../util');

module.exports = {
  category: 'Moderation',
  permission: PermissionFlagsBits.KickMembers,
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(400)),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const reason = interaction.options.getString('reason') ?? 'No reason given';

    if (!member) {
      return interaction.reply({ embeds: [embed('error', 'That user is not in this server.')], flags: MessageFlags.Ephemeral });
    }
    const err = hierarchyError(interaction, member);
    if (err) return interaction.reply({ embeds: [embed('error', err)], flags: MessageFlags.Ephemeral });
    if (!member.kickable) {
      return interaction.reply({
        embeds: [embed('error', 'I cannot kick that member. Check my role is above theirs.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await member.send(`You were kicked from **${interaction.guild.name}**: ${reason}`).catch(() => {});
    await member.kick(`${interaction.user.tag}: ${reason}`);

    await interaction.reply({ embeds: [embed('success', `**${member.user.tag}** was kicked.\nReason: ${reason}`)] });
    await modLog(interaction.guild, 'Member kicked', [
      ['User', `${member.user.tag} (${member.id})`],
      ['Moderator', interaction.user.tag],
      ['Reason', reason],
    ]);
  },
};
