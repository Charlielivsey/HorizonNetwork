const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { embed, modLog } = require('../util');

module.exports = {
  category: 'Moderation',
  permission: PermissionFlagsBits.ManageMessages,
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete recent messages in this channel')
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100),
    )
    .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user')),

  async execute(interaction) {
    const amount = interaction.options.getInteger('amount');
    const user = interaction.options.getUser('user');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let messages = await interaction.channel.messages.fetch({ limit: 100 });
    if (user) messages = messages.filter((m) => m.author.id === user.id);
    messages = messages.first(amount);

    // bulkDelete with filterOld=true skips messages older than 14 days (Discord API limit).
    const deleted = await interaction.channel.bulkDelete(messages, true);

    await interaction.editReply({ embeds: [embed('success', `Deleted **${deleted.size}** message(s).`)] });
    await modLog(interaction.guild, 'Messages purged', [
      ['Channel', `<#${interaction.channel.id}>`],
      ['Moderator', interaction.user.tag],
      ['Count', deleted.size],
      ...(user ? [['Filtered user', user.tag]] : []),
    ]);
  },
};
