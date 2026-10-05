const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const store = require('../store');
const tickets = require('../tickets');
const { embed, replyError } = require('../util');
const { hasPermission } = require('../permissions');

const ADMIN_SUBCOMMANDS = new Set(['panel', 'settings', 'support-add', 'support-remove']);
const STAFF_SUBCOMMANDS = new Set(['add', 'remove', 'rename', 'claim', 'list']);
const TICKET_MEMBER_ALLOW = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  AttachFiles: true,
  EmbedLinks: true,
};

module.exports = {
  category: 'Tickets',
  components: { ticket: tickets.handleComponent },
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Support ticket system')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('panel')
        .setDescription('Post a panel with an "Open Ticket" button')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Where to post (default: here)').addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((o) => o.setName('title').setDescription('Panel title').setMaxLength(256))
        .addStringOption((o) => o.setName('description').setDescription('Panel text').setMaxLength(2000))
        .addStringOption((o) => o.setName('button').setDescription('Button label').setMaxLength(80)),
    )
    .addSubcommand((s) =>
      s
        .setName('settings')
        .setDescription('Set the ticket category and transcript channel')
        .addChannelOption((o) =>
          o.setName('category').setDescription('Category new tickets go in').addChannelTypes(ChannelType.GuildCategory),
        )
        .addChannelOption((o) =>
          o
            .setName('transcripts')
            .setDescription('Channel where transcripts are saved')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('support-add')
        .setDescription('Add a role that can see and handle tickets')
        .addRoleOption((o) => o.setName('role').setDescription('Support role').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('support-remove')
        .setDescription('Remove a support role')
        .addRoleOption((o) => o.setName('role').setDescription('Support role').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('open')
        .setDescription('Open a new ticket')
        .addStringOption((o) => o.setName('subject').setDescription('What do you need help with?').setRequired(true).setMaxLength(1000)),
    )
    .addSubcommand((s) =>
      s
        .setName('close')
        .setDescription('Close this ticket and save a transcript')
        .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(500)),
    )
    .addSubcommand((s) => s.setName('claim').setDescription('Claim this ticket'))
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Add a user to this ticket')
        .addUserOption((o) => o.setName('user').setDescription('User to add').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Remove a user from this ticket')
        .addUserOption((o) => o.setName('user').setDescription('User to remove').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('rename')
        .setDescription('Rename this ticket channel')
        .addStringOption((o) => o.setName('name').setDescription('New name').setRequired(true).setMaxLength(90)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('List all open tickets')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;

    if (ADMIN_SUBCOMMANDS.has(sub) && !hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return replyError(interaction, 'You need the **Manage Server** permission to do that.');
    }
    if (STAFF_SUBCOMMANDS.has(sub) && !tickets.isTicketStaff(interaction)) {
      return replyError(interaction, 'Only ticket support staff can do that.');
    }

    switch (sub) {
      case 'panel': {
        const channel = interaction.options.getChannel('channel') ?? interaction.channel;
        const panel = embed(
          'info',
          interaction.options.getString('description') ??
            'Need help? Click the button below to open a private ticket with our staff team.',
          interaction.options.getString('title') ?? 'Support Tickets',
        );
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket:open')
            .setLabel(interaction.options.getString('button') ?? 'Open Ticket')
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary),
        );
        await channel.send({ embeds: [panel], components: [row] });
        return interaction.reply({ embeds: [embed('success', `Ticket panel posted in <#${channel.id}>.`)], flags: MessageFlags.Ephemeral });
      }

      case 'settings': {
        const category = interaction.options.getChannel('category');
        const transcripts = interaction.options.getChannel('transcripts');
        const config = store.updateGuild(guild.id, (c) => {
          if (category) c.tickets.categoryId = category.id;
          if (transcripts) c.tickets.transcriptChannelId = transcripts.id;
        });
        const fmt = (id) => (id ? `<#${id}>` : 'Not set');
        return interaction.reply({
          embeds: [
            embed(
              'success',
              `Ticket category: ${fmt(config.tickets.categoryId)}\nTranscript channel: ${fmt(config.tickets.transcriptChannelId)}`,
              'Ticket settings',
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      case 'support-add':
      case 'support-remove': {
        const role = interaction.options.getRole('role');
        const adding = sub === 'support-add';
        store.updateGuild(guild.id, (c) => {
          const ids = new Set(c.tickets.supportRoleIds);
          if (adding) ids.add(role.id);
          else ids.delete(role.id);
          c.tickets.supportRoleIds = [...ids];
        });
        return interaction.reply({
          embeds: [embed('success', `<@&${role.id}> ${adding ? 'can now' : 'can no longer'} handle new tickets.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      case 'open':
        return tickets.openTicket(interaction, interaction.options.getString('subject'));

      case 'close':
        return tickets.closeTicket(interaction, interaction.options.getString('reason') ?? undefined);

      case 'claim':
        return tickets.claimTicket(interaction);

      case 'list': {
        const open = Object.entries(store.getGuild(guild.id).tickets.open);
        const lines = open.map(
          ([channelId, t]) =>
            `**#${t.number}** <#${channelId}> by <@${t.ownerId}>${t.claimedBy ? ` · claimed by <@${t.claimedBy}>` : ''}`,
        );
        return interaction.reply({
          embeds: [embed('info', lines.slice(0, 40).join('\n') || 'No open tickets.', `Open tickets (${open.length})`)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // Remaining subcommands act on the current ticket channel.
    const ticket = tickets.getTicket(interaction);
    if (!ticket) return replyError(interaction, 'Use this inside an open ticket channel.');

    if (sub === 'rename') {
      const name = interaction.options.getString('name');
      await interaction.channel.setName(name);
      return interaction.reply({ embeds: [embed('success', `Ticket renamed to **${interaction.channel.name}**.`)] });
    }

    const user = interaction.options.getUser('user');
    if (sub === 'add') {
      await interaction.channel.permissionOverwrites.edit(user.id, TICKET_MEMBER_ALLOW);
      return interaction.reply({ embeds: [embed('success', `<@${user.id}> was added to this ticket.`)] });
    }
    if (user.id === ticket.ownerId) return replyError(interaction, 'You cannot remove the ticket owner. Close the ticket instead.');
    await interaction.channel.permissionOverwrites.delete(user.id);
    return interaction.reply({ embeds: [embed('success', `<@${user.id}> was removed from this ticket.`)] });
  },
};
