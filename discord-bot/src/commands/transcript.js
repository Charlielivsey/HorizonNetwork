const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { createTranscript } = require('../transcript');
const { embed } = require('../util');

module.exports = {
  category: 'Tickets',
  permission: PermissionFlagsBits.ManageMessages,
  data: new SlashCommandBuilder()
    .setName('transcript')
    .setDescription('Save an HTML transcript of this channel')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { file, count } = await createTranscript(interaction.channel, `#${interaction.channel.name}`);
    await interaction.editReply({
      embeds: [embed('success', `Transcript of **${count}** messages created. Open the file in any web browser.`)],
      files: [file],
    });
  },
};
