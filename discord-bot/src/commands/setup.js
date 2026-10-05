const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const store = require('../store');
const { embed, roleAssignError } = require('../util');

const TEXT_CHANNELS = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const fmt = (id, prefix) => (id ? `<${prefix}${id}>` : 'Not set');

module.exports = {
  category: 'Bot Setup',
  permission: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set up and configure the bot for this server')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s.setName('auto').setDescription('Automatically create log, ticket and transcript channels'),
    )
    .addSubcommand((s) => s.setName('view').setDescription('Show all current settings'))
    .addSubcommand((s) =>
      s
        .setName('welcome')
        .setDescription('Set the welcome channel and message (leave channel empty to disable)')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Channel for welcome messages').addChannelTypes(...TEXT_CHANNELS),
        )
        .addStringOption((o) =>
          o.setName('message').setDescription('Placeholders: {user} {username} {server} {count}').setMaxLength(1000),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('autorole')
        .setDescription('Role given to new members automatically (leave empty to disable)')
        .addRoleOption((o) => o.setName('role').setDescription('Role to give')),
    )
    .addSubcommand((s) =>
      s
        .setName('reset')
        .setDescription('Erase ALL bot settings, warnings and tickets for this server')
        .addBooleanOption((o) => o.setName('confirm').setDescription('Set to True to confirm').setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;
    const reply = (type, text) => interaction.reply({ embeds: [embed(type, text)], flags: MessageFlags.Ephemeral });

    if (sub === 'auto') {
      const me = guild.members.me;
      if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return reply('error', 'I need the **Manage Channels** permission to run auto setup.');
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const privateOverwrites = [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
      ];
      const logCategory = await guild.channels.create({
        name: 'Horizon Logs',
        type: ChannelType.GuildCategory,
        permissionOverwrites: privateOverwrites,
      });
      const make = (name) => guild.channels.create({ name, type: ChannelType.GuildText, parent: logCategory.id });
      const [mod, members, messages, tickets, network, transcripts] = await Promise.all([
        make('mod-logs'),
        make('member-logs'),
        make('message-logs'),
        make('ticket-logs'),
        make('network-announcements'),
        make('ticket-transcripts'),
      ]);
      const ticketCategory = await guild.channels.create({
        name: 'Tickets',
        type: ChannelType.GuildCategory,
        permissionOverwrites: privateOverwrites,
      });

      store.updateGuild(guild.id, (c) => {
        c.logs = { moderation: mod.id, members: members.id, messages: messages.id, tickets: tickets.id, network: network.id };
        c.tickets.categoryId = ticketCategory.id;
        c.tickets.transcriptChannelId = transcripts.id;
      });

      return interaction.editReply({
        embeds: [
          embed(
            'success',
            [
              'Created the **Horizon Logs** and **Tickets** categories (private to staff).',
              '',
              '**Next steps:**',
              '• `/ticket support-add` to choose which roles handle tickets',
              '• `/ticket panel` to post the "Open Ticket" button',
              '• `/setup welcome` and `/setup autorole` for new members',
              '• `/membercount setup` for a live member counter',
              '• `/permissions` and `/commands` to control who can use what',
            ].join('\n'),
            'Setup complete',
          ),
        ],
      });
    }

    if (sub === 'view') {
      const c = store.getGuild(guild.id);
      const logs = Object.entries(c.logs).map(([t, id]) => `${t}: ${fmt(id, '#')}`).join('\n');
      return interaction.reply({
        embeds: [
          embed('info', '', `Settings for ${guild.name}`).addFields(
            { name: 'Welcome channel', value: fmt(c.welcomeChannelId, '#'), inline: true },
            { name: 'Auto role', value: fmt(c.autoRoleId, '@&'), inline: true },
            { name: 'Member counter', value: fmt(c.memberCounter.channelId, '#'), inline: true },
            { name: 'Ticket category', value: fmt(c.tickets.categoryId, '#'), inline: true },
            { name: 'Transcripts', value: fmt(c.tickets.transcriptChannelId, '#'), inline: true },
            {
              name: 'Support roles',
              value: c.tickets.supportRoleIds.map((id) => `<@&${id}>`).join(' ') || 'None',
              inline: true,
            },
            { name: 'Log channels', value: logs },
            { name: 'Disabled commands', value: c.disabledCommands.map((n) => `\`/${n}\``).join(' ') || 'None' },
            { name: 'Custom commands', value: String(Object.keys(c.customCommands).length), inline: true },
            { name: 'Welcome message', value: c.welcomeMessage },
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'welcome') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');
      store.updateGuild(guild.id, (c) => {
        c.welcomeChannelId = channel?.id ?? null;
        if (message) c.welcomeMessage = message;
      });
      return reply('success', channel ? `Welcome messages will be sent in <#${channel.id}>.` : 'Welcome messages disabled.');
    }

    if (sub === 'autorole') {
      const role = interaction.options.getRole('role');
      if (role) {
        const err = roleAssignError(interaction, role);
        if (err) return reply('error', err);
      }
      store.updateGuild(guild.id, (c) => {
        c.autoRoleId = role?.id ?? null;
      });
      return reply('success', role ? `New members will receive <@&${role.id}>.` : 'Auto role disabled.');
    }

    if (!interaction.options.getBoolean('confirm')) return reply('warn', 'Reset cancelled.');
    store.deleteGuild(guild.id);
    await guild.commands.set([]).catch(() => {});
    return reply('success', 'All bot settings for this server have been erased.');
  },
};
