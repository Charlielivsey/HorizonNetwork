const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const store = require('../store');
const { embed } = require('../util');

const DESCRIPTIONS = {
  moderation: 'Bans, kicks, timeouts, warnings, purges',
  members: 'Joins, leaves, nickname and role changes',
  messages: 'Deleted and edited messages',
  tickets: 'Tickets opened, claimed and closed',
  network: 'Network announcements and network bans',
};
const typeOption = (o) =>
  o
    .setName('type')
    .setDescription('Log type')
    .setRequired(true)
    .addChoices(...store.LOG_TYPES.map((t) => ({ name: t, value: t })));

module.exports = {
  category: 'Logging',
  permission: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName('logging')
    .setDescription('Choose where each type of log is sent')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Send a log type to a channel')
        .addStringOption(typeOption)
        .addChannelOption((o) =>
          o
            .setName('channel')
            .setDescription('Log channel')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((s) => s.setName('disable').setDescription('Turn off a log type').addStringOption(typeOption))
    .addSubcommand((s) => s.setName('view').setDescription('Show the current log channels')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const type = interaction.options.getString('type');

    if (sub === 'view') {
      const { logs } = store.getGuild(guildId);
      const lines = store.LOG_TYPES.map(
        (t) => `**${t}** — ${logs[t] ? `<#${logs[t]}>` : 'Disabled'}\n-# ${DESCRIPTIONS[t]}`,
      );
      return interaction.reply({ embeds: [embed('info', lines.join('\n'), 'Log channels')], flags: MessageFlags.Ephemeral });
    }

    const channel = sub === 'set' ? interaction.options.getChannel('channel') : null;
    if (channel) {
      const perms = channel.permissionsFor(interaction.guild.members.me);
      if (!perms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        return interaction.reply({
          embeds: [embed('error', `I need **View Channel**, **Send Messages** and **Embed Links** in <#${channel.id}>.`)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }
    store.updateGuild(guildId, (c) => {
      c.logs[type] = channel?.id ?? null;
    });
    return interaction.reply({
      embeds: [embed('success', channel ? `**${type}** logs will be sent to <#${channel.id}>.` : `**${type}** logs disabled.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
