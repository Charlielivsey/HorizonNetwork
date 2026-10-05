const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const store = require('../store');
const memberCounter = require('../memberCounter');
const { embed, replyError } = require('../util');

module.exports = {
  category: 'Bot Setup',
  permission: PermissionFlagsBits.ManageGuild,
  data: new SlashCommandBuilder()
    .setName('membercount')
    .setDescription('Live member counter channel')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('setup')
        .setDescription('Create the member counter channel')
        .addStringOption((o) =>
          o.setName('format').setDescription('Channel name format, use {count}. Default: "Members: {count}"').setMaxLength(90),
        ),
    )
    .addSubcommand((s) => s.setName('disable').setDescription('Remove the member counter channel')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guild } = interaction;
    const config = store.getGuild(guild.id);

    if (!guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return replyError(interaction, 'I need the **Manage Channels** permission for the member counter.');
    }
    const existing = config.memberCounter.channelId && guild.channels.cache.get(config.memberCounter.channelId);

    if (sub === 'disable') {
      if (existing) await existing.delete('Member counter disabled').catch(() => {});
      store.updateGuild(guild.id, (c) => {
        c.memberCounter.channelId = null;
      });
      return interaction.reply({ embeds: [embed('success', 'Member counter removed.')], flags: MessageFlags.Ephemeral });
    }

    const format = interaction.options.getString('format') ?? config.memberCounter.template;
    if (!format.includes('{count}')) return replyError(interaction, 'The format must include `{count}`.');

    let channel = existing;
    if (channel) {
      await channel.setName(memberCounter.counterName(guild, format));
    } else {
      channel = await guild.channels.create({
        name: memberCounter.counterName(guild, format),
        type: ChannelType.GuildVoice,
        position: 0,
        permissionOverwrites: [
          { id: guild.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.Connect] },
          { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect] },
        ],
      });
    }
    store.updateGuild(guild.id, (c) => {
      c.memberCounter = { channelId: channel.id, template: format };
    });
    return interaction.reply({
      embeds: [embed('success', `Member counter set up: <#${channel.id}>\nIt updates every 10 minutes (a Discord rate limit).`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
