const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const store = require('../store');
const { permissionName } = require('../permissions');
const { embed, replyError } = require('../util');

const configurable = (client) => client.commands.filter((c) => !c.access && !c.adminOnly);
const commandOption = (o) => o.setName('command').setDescription('Command name').setRequired(true).setAutocomplete(true);

module.exports = {
  category: 'Customization',
  adminOnly: true,
  data: new SlashCommandBuilder()
    .setName('permissions')
    .setDescription('Choose which roles can use each command')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('allow')
        .setDescription('Allow a role to use a command (only listed roles + admins will be able to)')
        .addStringOption(commandOption)
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('revoke')
        .setDescription('Remove a role from a command')
        .addStringOption(commandOption)
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('reset').setDescription('Return a command to its default permission').addStringOption(commandOption),
    )
    .addSubcommand((s) => s.setName('view').setDescription('Show who can use each command')),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      configurable(interaction.client)
        .map((c) => c.data.name)
        .filter((n) => n.includes(focused))
        .sort()
        .slice(0, 25)
        .map((n) => ({ name: `/${n}`, value: n })),
    );
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const commands = configurable(interaction.client);

    if (sub === 'view') {
      const { commandRoles } = store.getGuild(guildId);
      const lines = commands
        .sort((a, b) => a.data.name.localeCompare(b.data.name))
        .map((c) => {
          const roles = commandRoles[c.data.name];
          const who = roles?.length
            ? roles.map((id) => `<@&${id}>`).join(' ')
            : c.permission
              ? `Default (${permissionName(c.permission)})`
              : 'Default (everyone)';
          return `\`/${c.data.name}\` — ${who}`;
        });
      return interaction.reply({
        embeds: [
          embed('info', `${lines.join('\n')}\n\n-# Administrators can always use every command.`, 'Command permissions'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const name = interaction.options.getString('command').replace(/^\//, '').toLowerCase();
    if (!commands.has(name)) return replyError(interaction, `\`/${name}\` cannot be configured.`);

    if (sub === 'reset') {
      store.updateGuild(guildId, (c) => {
        delete c.commandRoles[name];
      });
      return interaction.reply({ embeds: [embed('success', `\`/${name}\` is back to its default permission.`)], flags: MessageFlags.Ephemeral });
    }

    const role = interaction.options.getRole('role');
    const config = store.updateGuild(guildId, (c) => {
      const set = new Set(c.commandRoles[name] ?? []);
      if (sub === 'allow') set.add(role.id);
      else set.delete(role.id);
      if (set.size) c.commandRoles[name] = [...set];
      else delete c.commandRoles[name];
    });
    const now = config.commandRoles[name]?.map((id) => `<@&${id}>`).join(' ') ?? 'default permission';
    return interaction.reply({
      embeds: [embed('success', `\`/${name}\` can now be used by: ${now}`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
