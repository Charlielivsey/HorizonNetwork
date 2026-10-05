const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const store = require('../store');
const { isTicketStaff } = require('../tickets');
const { embed, replyError } = require('../util');
const { hasPermission } = require('../permissions');

const nameOption = (o) =>
  o.setName('name').setDescription('Response name').setRequired(true).setMaxLength(50).setAutocomplete(true);

module.exports = {
  category: 'Tickets',
  data: new SlashCommandBuilder()
    .setName('response')
    .setDescription('Saved ticket responses (canned replies)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('send')
        .setDescription('Send a saved response in this channel')
        .addStringOption(nameOption)
        .addUserOption((o) => o.setName('user').setDescription('User to mention')),
    )
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Create or update a saved response')
        .addStringOption((o) => o.setName('name').setDescription('Response name').setRequired(true).setMaxLength(50))
        .addStringOption((o) => o.setName('content').setDescription('Response text (use \\n for new lines)').setRequired(true).setMaxLength(2000)),
    )
    .addSubcommand((s) => s.setName('remove').setDescription('Delete a saved response').addStringOption(nameOption))
    .addSubcommand((s) => s.setName('list').setDescription('List all saved responses')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const names = Object.keys(store.getGuild(interaction.guildId).responses);
    await interaction.respond(
      names
        .filter((n) => n.includes(focused))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n })),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const name = interaction.options.getString('name')?.toLowerCase().trim();

    if ((sub === 'add' || sub === 'remove') && !hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return replyError(interaction, 'You need the **Manage Server** permission to manage responses.');
    }
    if ((sub === 'send' || sub === 'list') && !isTicketStaff(interaction)) {
      return replyError(interaction, 'Only ticket support staff can use saved responses.');
    }

    const { responses } = store.getGuild(guildId);

    if (sub === 'list') {
      const lines = Object.entries(responses).map(([n, c]) => `**${n}** — ${c.slice(0, 80)}${c.length > 80 ? '...' : ''}`);
      return interaction.reply({
        embeds: [embed('info', lines.join('\n') || 'No saved responses yet. Add one with `/response add`.', 'Saved responses')],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'add') {
      const content = interaction.options.getString('content').replaceAll('\\n', '\n');
      store.updateGuild(guildId, (c) => {
        c.responses[name] = content;
      });
      return interaction.reply({ embeds: [embed('success', `Saved response **${name}**.`)], flags: MessageFlags.Ephemeral });
    }

    if (!responses[name]) return replyError(interaction, `No saved response called **${name}**.`);

    if (sub === 'remove') {
      store.updateGuild(guildId, (c) => {
        delete c.responses[name];
      });
      return interaction.reply({ embeds: [embed('success', `Deleted response **${name}**.`)], flags: MessageFlags.Ephemeral });
    }

    const user = interaction.options.getUser('user');
    return interaction.reply({
      content: user ? `<@${user.id}>` : undefined,
      embeds: [embed('info', responses[name]).setFooter({ text: `Sent by ${interaction.user.tag}` })],
    });
  },
};
