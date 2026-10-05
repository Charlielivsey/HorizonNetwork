const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed } = require('../util');

const ORDER = [
  'Information',
  'Bot Setup',
  'Moderation',
  'Role Management',
  'Tickets',
  'Logging',
  'Customization',
  'Network',
  'Bot Administration',
];

module.exports = {
  category: 'Information',
  data: new SlashCommandBuilder().setName('help').setDescription('List all bot commands'),
  async execute(interaction) {
    const groups = new Map(ORDER.map((c) => [c, []]));
    for (const c of interaction.client.commands.values()) {
      if (!groups.has(c.category)) groups.set(c.category, []);
      groups.get(c.category).push(`\`/${c.data.name}\` ${c.data.description}`);
    }
    const e = embed('info', 'Use `/setup auto` to get started on a new server.', 'Horizon Bot Commands');
    for (const [category, lines] of groups) {
      if (lines.length) e.addFields({ name: category, value: lines.sort().join('\n') });
    }
    await interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
  },
};
