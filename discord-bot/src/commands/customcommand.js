const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const store = require('../store');
const { syncCustomCommands } = require('../customCommands');
const { embed, replyError } = require('../util');

const NAME_PATTERN = /^[a-z0-9_-]{1,32}$/;
const MAX_CUSTOM_COMMANDS = 50;

module.exports = {
  category: 'Customization',
  permission: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName('customcommand')
    .setDescription('Create your own slash commands for this server')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Create or update a custom command')
        .addStringOption((o) =>
          o.setName('name').setDescription('Command name (lowercase, no spaces)').setRequired(true).setMaxLength(32),
        )
        .addStringOption((o) =>
          o
            .setName('response')
            .setDescription('What the bot replies. Placeholders: {user} {username} {server} {count}. \\n = new line')
            .setRequired(true)
            .setMaxLength(2000),
        )
        .addStringOption((o) => o.setName('description').setDescription('Shown in the command menu').setMaxLength(100))
        .addBooleanOption((o) => o.setName('private').setDescription('Only the user who runs it can see the reply')),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Delete a custom command')
        .addStringOption((o) => o.setName('name').setDescription('Command name').setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List custom commands')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      Object.keys(store.getGuild(interaction.guildId).customCommands)
        .filter((n) => n.includes(focused))
        .slice(0, 25)
        .map((n) => ({ name: n, value: n })),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;
    const config = store.getGuild(guild.id);

    if (sub === 'list') {
      const lines = Object.entries(config.customCommands).map(([n, c]) => `\`/${n}\` — ${c.description || c.response.slice(0, 60)}`);
      return interaction.reply({
        embeds: [embed('info', lines.join('\n') || 'No custom commands yet. Create one with `/customcommand add`.', 'Custom commands')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const name = interaction.options.getString('name').toLowerCase().trim();

    if (sub === 'remove') {
      if (!config.customCommands[name]) return replyError(interaction, `No custom command called \`/${name}\`.`);
      store.updateGuild(guild.id, (c) => {
        delete c.customCommands[name];
      });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await syncCustomCommands(guild);
      return interaction.editReply({ embeds: [embed('success', `Deleted \`/${name}\`.`)] });
    }

    if (!NAME_PATTERN.test(name)) {
      return replyError(interaction, 'Names can only use lowercase letters, numbers, `-` and `_` (max 32 characters).');
    }
    if (interaction.client.commands.has(name)) return replyError(interaction, `\`/${name}\` is a built-in command.`);
    if (!config.customCommands[name] && Object.keys(config.customCommands).length >= MAX_CUSTOM_COMMANDS) {
      return replyError(interaction, `This server has reached the limit of ${MAX_CUSTOM_COMMANDS} custom commands.`);
    }

    store.updateGuild(guild.id, (c) => {
      c.customCommands[name] = {
        response: interaction.options.getString('response').replaceAll('\\n', '\n'),
        description: interaction.options.getString('description') ?? '',
        ephemeral: interaction.options.getBoolean('private') ?? false,
      };
    });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await syncCustomCommands(guild);
    return interaction.editReply({
      embeds: [embed('success', `Saved \`/${name}\`. It may take a few seconds to appear in the command menu.`)],
    });
  },
};
