const { ApplicationCommandType, MessageFlags } = require('discord.js');
const store = require('./store');
const { fillPlaceholders } = require('./util');

// Custom commands are registered as guild-scoped slash commands, separate from the global ones.
async function syncCustomCommands(guild) {
  const { customCommands } = store.getGuild(guild.id);
  const body = Object.entries(customCommands).map(([name, c]) => ({
    name,
    description: c.description || 'Custom server command',
    type: ApplicationCommandType.ChatInput,
  }));
  await guild.commands.set(body);
}

async function runCustomCommand(interaction) {
  const config = store.getGuild(interaction.guildId);
  const command = config.customCommands[interaction.commandName];
  if (!command || config.disabledCommands.includes(interaction.commandName)) {
    return interaction.reply({ content: 'This command is not available.', flags: MessageFlags.Ephemeral });
  }
  const content = fillPlaceholders(command.response, { user: interaction.user, guild: interaction.guild });
  return interaction.reply({
    content,
    allowedMentions: { parse: ['users'] },
    flags: command.ephemeral ? MessageFlags.Ephemeral : undefined,
  });
}

module.exports = { syncCustomCommands, runCustomCommand };
