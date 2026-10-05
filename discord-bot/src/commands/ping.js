const { SlashCommandBuilder } = require('discord.js');
const { embed } = require('../util');

module.exports = {
  category: 'Information',
  data: new SlashCommandBuilder().setName('ping').setDescription('Check the bot latency'),
  async execute(interaction) {
    const sent = Date.now();
    await interaction.reply({ embeds: [embed('info', 'Pinging...')] });
    await interaction.editReply({
      embeds: [
        embed(
          'success',
          `Roundtrip: **${Date.now() - sent}ms**\nWebSocket: **${interaction.client.ws.ping}ms**`,
          'Pong!',
        ),
      ],
    });
  },
};
