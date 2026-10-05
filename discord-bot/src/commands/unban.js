const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { embed, modLog } = require('../util');

module.exports = {
  category: 'Moderation',
  permission: PermissionFlagsBits.BanMembers,
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user by ID')
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) => o.setName('user_id').setDescription('ID of the banned user').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(400)),

  async execute(interaction) {
    const userId = interaction.options.getString('user_id').trim();
    const reason = interaction.options.getString('reason') ?? 'No reason given';

    const user = await interaction.guild.members
      .unban(userId, `${interaction.user.tag}: ${reason}`)
      .catch(() => null);
    if (!user) {
      return interaction.reply({
        embeds: [embed('error', 'That user is not banned, or the ID is invalid.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.reply({ embeds: [embed('success', `**${user.tag}** was unbanned.`)] });
    await modLog(interaction.guild, 'Member unbanned', [
      ['User', `${user.tag} (${user.id})`],
      ['Moderator', interaction.user.tag],
      ['Reason', reason],
    ]);
  },
};
