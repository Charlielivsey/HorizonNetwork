const { SlashCommandBuilder, InteractionContextType, MessageFlags, time } = require('discord.js');
const store = require('../store');
const { isNetworkStaff } = require('../permissions');
const { embed, replyError } = require('../util');

module.exports = {
  category: 'Network',
  data: new SlashCommandBuilder()
    .setName('networkinfo')
    .setDescription('Network utilities and information')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName('servers').setDescription('List the servers in the network'))
    .addSubcommand((s) => s.setName('stats').setDescription('Network-wide statistics'))
    .addSubcommand((s) =>
      s
        .setName('lookup')
        .setDescription('Look up a user across the network (network staff only)')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('bans').setDescription('List network bans (network staff only)')),

  async execute(interaction) {
    const { client } = interaction;
    const sub = interaction.options.getSubcommand();
    const network = store.getNetwork();
    const guilds = network.servers.map((id) => client.guilds.cache.get(id)).filter(Boolean);

    if (sub === 'servers') {
      const lines = guilds.map((g) => `**${g.name}** · ${g.memberCount.toLocaleString('en-GB')} members`);
      return interaction.reply({
        embeds: [embed('info', lines.join('\n') || 'No servers in the network yet.', `Network servers (${guilds.length})`)],
      });
    }

    if (sub === 'stats') {
      const members = guilds.reduce((sum, g) => sum + g.memberCount, 0);
      return interaction.reply({
        embeds: [
          embed('info', '', 'Network statistics').addFields(
            { name: 'Servers', value: String(guilds.length), inline: true },
            { name: 'Total members', value: members.toLocaleString('en-GB'), inline: true },
            { name: 'Network staff', value: String(network.staff.length), inline: true },
            { name: 'Network bans', value: String(Object.keys(network.bans).length), inline: true },
          ),
        ],
      });
    }

    if (!isNetworkStaff(client, interaction.user.id)) {
      return replyError(interaction, 'This is restricted to network staff.');
    }

    if (sub === 'bans') {
      const lines = Object.entries(network.bans).map(
        ([id, b]) => `<@${id}> \`${id}\` — ${b.reason} (${time(new Date(b.at), 'R')})`,
      );
      const text = lines.join('\n');
      return interaction.reply({
        embeds: [embed('info', (text.length > 4000 ? `${text.slice(0, 3990)}\n...` : text) || 'No network bans.', `Network bans (${lines.length})`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const user = interaction.options.getUser('user');
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const found = [];
    for (const guild of guilds) {
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member) found.push(`**${guild.name}** — joined ${time(member.joinedAt, 'R')}`);
    }
    const warnings = guilds.reduce((sum, g) => sum + (store.getGuild(g.id).warnings[user.id]?.length ?? 0), 0);
    const ban = network.bans[user.id];

    return interaction.editReply({
      embeds: [
        embed('info', `<@${user.id}> \`${user.id}\``, user.tag)
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            { name: 'Account created', value: time(user.createdAt, 'R'), inline: true },
            { name: 'Warnings (network)', value: String(warnings), inline: true },
            { name: 'Network banned', value: ban ? `Yes — ${ban.reason}` : 'No', inline: true },
            { name: `In network servers (${found.length})`, value: found.join('\n') || 'None' },
          ),
      ],
    });
  },
};
