const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const store = require('../store');
const { PROTECTED_COMMANDS } = require('../permissions');
const { embed, replyError } = require('../util');

function commandNames(interaction) {
  return [
    ...interaction.client.commands.filter((c) => !c.access).map((c) => c.data.name),
    ...Object.keys(store.getGuild(interaction.guildId).customCommands),
  ].filter((n) => !PROTECTED_COMMANDS.has(n));
}

const nameOption = (o) => o.setName('command').setDescription('Command name').setRequired(true).setAutocomplete(true);

module.exports = {
  category: 'Customization',
  permission: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Enable or disable bot commands on this server')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('disable').setDescription('Disable a command').addStringOption(nameOption))
    .addSubcommand((s) => s.setName('enable').setDescription('Re-enable a command').addStringOption(nameOption))
    .addSubcommand((s) => s.setName('list').setDescription('Show enabled and disabled commands')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      commandNames(interaction)
        .filter((n) => n.includes(focused))
        .sort()
        .slice(0, 25)
        .map((n) => ({ name: `/${n}`, value: n })),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      const { disabledCommands } = store.getGuild(guildId);
      const names = commandNames(interaction).sort();
      const enabled = names.filter((n) => !disabledCommands.includes(n));
      return interaction.reply({
        embeds: [
          embed('info', '', 'Command status').addFields(
            { name: 'Enabled', value: enabled.map((n) => `\`/${n}\``).join(' ') || 'None' },
            { name: 'Disabled', value: disabledCommands.map((n) => `\`/${n}\``).join(' ') || 'None' },
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const name = interaction.options.getString('command').replace(/^\//, '').toLowerCase();
    if (PROTECTED_COMMANDS.has(name)) return replyError(interaction, `\`/${name}\` cannot be disabled.`);
    if (!commandNames(interaction).includes(name)) return replyError(interaction, `Unknown command \`/${name}\`.`);

    store.updateGuild(guildId, (c) => {
      const set = new Set(c.disabledCommands);
      if (sub === 'disable') set.add(name);
      else set.delete(name);
      c.disabledCommands = [...set];
    });
    return interaction.reply({
      embeds: [embed('success', `\`/${name}\` is now **${sub === 'disable' ? 'disabled' : 'enabled'}**.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
