const { Events } = require('discord.js');
const { checkAccess } = require('../permissions');
const { runCustomCommand } = require('../customCommands');
const { replyError } = require('../util');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    try {
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) await command.autocomplete(interaction);
        return;
      }

      if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
        const handler = client.components.get(interaction.customId.split(':')[0]);
        if (handler) await handler(interaction);
        return;
      }

      if (!interaction.isChatInputCommand()) return;

      const command = client.commands.get(interaction.commandName);
      if (!command) {
        if (interaction.inGuild()) await runCustomCommand(interaction);
        return;
      }

      const denied = checkAccess(interaction, command);
      if (denied) return replyError(interaction, denied);

      await command.execute(interaction);
    } catch (err) {
      console.error(`[interaction:${interaction.commandName ?? interaction.customId}]`, err);
      if (interaction.isRepliable()) {
        await replyError(interaction, 'Something went wrong. Check I have the permissions I need.').catch(() => {});
      }
    }
  },
};
