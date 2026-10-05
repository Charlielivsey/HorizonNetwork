const { SlashCommandBuilder, ActivityType, MessageFlags, version: djsVersion } = require('discord.js');
const { embed, replyError } = require('../util');

const ACTIVITY_TYPES = {
  Playing: ActivityType.Playing,
  Watching: ActivityType.Watching,
  Listening: ActivityType.Listening,
  Competing: ActivityType.Competing,
};

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

module.exports = {
  category: 'Bot Administration',
  access: 'owner',
  data: new SlashCommandBuilder()
    .setName('botadmin')
    .setDescription('Bot owner controls')
    .addSubcommand((s) => s.setName('stats').setDescription('Bot statistics'))
    .addSubcommand((s) => s.setName('servers').setDescription('List every server the bot is in'))
    .addSubcommand((s) =>
      s
        .setName('leave')
        .setDescription('Make the bot leave a server')
        .addStringOption((o) => o.setName('server_id').setDescription('Server ID').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('status')
        .setDescription('Change the bot status (leave text empty to reset)')
        .addStringOption((o) =>
          o
            .setName('type')
            .setDescription('Activity type')
            .addChoices(...Object.keys(ACTIVITY_TYPES).map((t) => ({ name: t, value: t }))),
        )
        .addStringOption((o) => o.setName('text').setDescription('Status text').setMaxLength(128)),
    )
    .addSubcommand((s) => s.setName('sync').setDescription('Re-register all slash commands with Discord')),

  async execute(interaction) {
    const { client } = interaction;
    const sub = interaction.options.getSubcommand();
    const ephemeral = { flags: MessageFlags.Ephemeral };

    if (sub === 'stats') {
      const users = client.guilds.cache.reduce((sum, g) => sum + g.memberCount, 0);
      const mem = process.memoryUsage().rss / 1024 / 1024;
      return interaction.reply({
        embeds: [
          embed('info', '', `${client.user.username} statistics`).addFields(
            { name: 'Servers', value: String(client.guilds.cache.size), inline: true },
            { name: 'Users', value: users.toLocaleString('en-GB'), inline: true },
            { name: 'Commands', value: String(client.commands.size), inline: true },
            { name: 'Uptime', value: formatUptime(client.uptime), inline: true },
            { name: 'Memory', value: `${mem.toFixed(1)} MB`, inline: true },
            { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
            { name: 'Node.js', value: process.version, inline: true },
            { name: 'discord.js', value: djsVersion, inline: true },
          ),
        ],
        ...ephemeral,
      });
    }

    if (sub === 'servers') {
      const lines = client.guilds.cache
        .toSorted((a, b) => b.memberCount - a.memberCount)
        .map((g) => `**${g.name}** · \`${g.id}\` · ${g.memberCount} members`);
      const text = lines.join('\n');
      return interaction.reply({
        embeds: [embed('info', text.length > 4000 ? `${text.slice(0, 3990)}\n...` : text, `Servers (${lines.length})`)],
        ...ephemeral,
      });
    }

    if (sub === 'leave') {
      const guild = client.guilds.cache.get(interaction.options.getString('server_id').trim());
      if (!guild) return replyError(interaction, 'I am not in a server with that ID.');
      await guild.leave();
      return interaction.reply({ embeds: [embed('success', `Left **${guild.name}**.`)], ...ephemeral });
    }

    if (sub === 'status') {
      const text = interaction.options.getString('text');
      client.customStatus = text
        ? { text, type: ACTIVITY_TYPES[interaction.options.getString('type') ?? 'Playing'] }
        : null;
      client.refreshPresence();
      return interaction.reply({ embeds: [embed('success', text ? `Status set to **${text}**.` : 'Status reset.')], ...ephemeral });
    }

    await interaction.deferReply(ephemeral);
    const registered = await client.application.commands.set(client.commands.map((c) => c.data.toJSON()));
    return interaction.editReply({ embeds: [embed('success', `Registered ${registered.size} global commands.`)] });
  },
};
