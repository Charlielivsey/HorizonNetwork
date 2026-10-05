const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  time,
} = require('discord.js');
const store = require('./store');
const { embed, logFields, replyError, sendLog } = require('./util');
const { createTranscript } = require('./transcript');

const MEMBER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

function isTicketStaff(interaction) {
  const { supportRoleIds } = store.getGuild(interaction.guildId).tickets;
  return (
    interaction.memberPermissions.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels) ||
    supportRoleIds.some((id) => interaction.member.roles.cache.has(id))
  );
}

function getTicket(interaction) {
  return store.getGuild(interaction.guildId).tickets.open[interaction.channelId] ?? null;
}

function ticketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setEmoji('🙋').setStyle(ButtonStyle.Secondary),
  );
}

function subjectModal() {
  return new ModalBuilder()
    .setCustomId('ticket:create')
    .setTitle('Open a ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('subject')
          .setLabel('How can we help?')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(true),
      ),
    );
}

async function openTicket(interaction, subject) {
  const { guild, user } = interaction;
  const config = store.getGuild(guild.id);

  const existing = Object.entries(config.tickets.open).find(
    ([channelId, t]) => t.ownerId === user.id && guild.channels.cache.has(channelId),
  );
  if (existing) return replyError(interaction, `You already have an open ticket: <#${existing[0]}>`);

  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return replyError(interaction, 'I need the **Manage Channels** permission to create tickets.');
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const number = store.updateGuild(guild.id, (c) => {
    c.tickets.counter += 1;
  }).tickets.counter;

  const category = config.tickets.categoryId && guild.channels.cache.get(config.tickets.categoryId);
  const channel = await guild.channels.create({
    name: `ticket-${String(number).padStart(4, '0')}`,
    type: ChannelType.GuildText,
    parent: category?.type === ChannelType.GuildCategory ? category.id : undefined,
    topic: `Ticket #${number} opened by ${user.tag} (${user.id})`,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: me.id, allow: [...MEMBER_ALLOW, PermissionFlagsBits.ManageChannels] },
      { id: user.id, allow: MEMBER_ALLOW },
      ...config.tickets.supportRoleIds
        .filter((id) => guild.roles.cache.has(id))
        .map((id) => ({ id, allow: MEMBER_ALLOW })),
    ],
  });

  store.updateGuild(guild.id, (c) => {
    c.tickets.open[channel.id] = { number, ownerId: user.id, subject, claimedBy: null, openedAt: Date.now() };
  });

  const pings = [`<@${user.id}>`, ...config.tickets.supportRoleIds.map((id) => `<@&${id}>`)].join(' ');
  await channel.send({
    content: pings,
    embeds: [
      embed('info', `Thanks for reaching out! Staff will be with you shortly.\n\n**Subject:**\n${subject}`, `Ticket #${number}`),
    ],
    components: [ticketButtons()],
  });

  await interaction.editReply({ embeds: [embed('success', `Your ticket has been created: <#${channel.id}>`)] });
  await logFields(
    guild,
    'tickets',
    `Ticket #${number} opened`,
    [
      ['Opened by', `${user.tag} (${user.id})`],
      ['Channel', `<#${channel.id}>`],
      ['Subject', subject, false],
    ],
    'success',
  );
}

async function closeTicket(interaction, reason = 'No reason given') {
  const ticket = getTicket(interaction);
  if (!ticket) return replyError(interaction, 'This is not an open ticket channel.');
  if (ticket.ownerId !== interaction.user.id && !isTicketStaff(interaction)) {
    return replyError(interaction, 'Only the ticket owner or support staff can close this ticket.');
  }

  const { guild, channel } = interaction;
  await interaction.reply({ embeds: [embed('warn', 'Saving transcript and closing this ticket in 5 seconds...')] });

  const { file, count } = await createTranscript(channel, `Ticket #${ticket.number}`);
  const summary = embed('info', '', `Ticket #${ticket.number} closed`).addFields(
    { name: 'Opened by', value: `<@${ticket.ownerId}>`, inline: true },
    { name: 'Closed by', value: `<@${interaction.user.id}>`, inline: true },
    { name: 'Claimed by', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed', inline: true },
    { name: 'Opened', value: time(new Date(ticket.openedAt), 'f'), inline: true },
    { name: 'Messages', value: String(count), inline: true },
    { name: 'Reason', value: reason },
  );

  const config = store.getGuild(guild.id);
  const transcriptChannel = guild.channels.cache.get(config.tickets.transcriptChannelId);
  if (transcriptChannel?.isTextBased()) {
    await transcriptChannel.send({ embeds: [summary], files: [file] }).catch(() => {});
  } else {
    await sendLog(guild, 'tickets', summary, [file]);
  }
  const owner = await interaction.client.users.fetch(ticket.ownerId).catch(() => null);
  await owner
    ?.send({ content: `Your ticket in **${guild.name}** was closed. Here is a copy of the conversation.`, embeds: [summary], files: [file] })
    .catch(() => {});

  store.updateGuild(guild.id, (c) => {
    delete c.tickets.open[channel.id];
  });
  setTimeout(() => channel.delete(`Ticket closed by ${interaction.user.tag}`).catch(() => {}), 5000);
}

async function claimTicket(interaction) {
  const ticket = getTicket(interaction);
  if (!ticket) return replyError(interaction, 'This is not an open ticket channel.');
  if (!isTicketStaff(interaction)) return replyError(interaction, 'Only support staff can claim tickets.');
  if (ticket.claimedBy) return replyError(interaction, `This ticket is already claimed by <@${ticket.claimedBy}>.`);

  store.updateGuild(interaction.guildId, (c) => {
    c.tickets.open[interaction.channelId].claimedBy = interaction.user.id;
  });
  await interaction.reply({ embeds: [embed('success', `<@${interaction.user.id}> will be handling this ticket.`)] });
  await logFields(interaction.guild, 'tickets', `Ticket #${ticket.number} claimed`, [
    ['Claimed by', interaction.user.tag],
    ['Channel', `<#${interaction.channelId}>`],
  ]);
}

async function handleComponent(interaction) {
  const action = interaction.customId.split(':')[1];
  if (action === 'open') return interaction.showModal(subjectModal());
  if (action === 'create') return openTicket(interaction, interaction.fields.getTextInputValue('subject'));
  if (action === 'close') return closeTicket(interaction);
  if (action === 'claim') return claimTicket(interaction);
}

module.exports = { isTicketStaff, getTicket, openTicket, closeTicket, claimTicket, handleComponent };
