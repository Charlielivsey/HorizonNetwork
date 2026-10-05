const { SlashCommandBuilder, InteractionContextType, MessageFlags } = require('discord.js');
const store = require('../store');
const { isOwner } = require('../permissions');
const { embed, replyError, logFields, sendLog } = require('../util');

const OWNER_SUBCOMMANDS = new Set(['server-add', 'server-remove', 'staff-add', 'staff-remove']);

function networkGuilds(client) {
  return store
    .getNetwork()
    .servers.map((id) => client.guilds.cache.get(id))
    .filter(Boolean);
}

module.exports = {
  category: 'Network',
  access: 'network',
  data: new SlashCommandBuilder()
    .setName('network')
    .setDescription('Manage the Horizon server network (network staff only)')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('server-add')
        .setDescription('Add a server to the network')
        .addStringOption((o) => o.setName('server_id').setDescription('Server ID (default: this server)')),
    )
    .addSubcommand((s) =>
      s
        .setName('server-remove')
        .setDescription('Remove a server from the network')
        .addStringOption((o) => o.setName('server_id').setDescription('Server ID (default: this server)')),
    )
    .addSubcommand((s) =>
      s
        .setName('ban')
        .setDescription('Ban a user from every network server')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(400)),
    )
    .addSubcommand((s) =>
      s
        .setName('unban')
        .setDescription('Lift a network ban')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('announce')
        .setDescription('Send an announcement to every network server')
        .addStringOption((o) => o.setName('message').setDescription('Announcement (\\n = new line)').setRequired(true).setMaxLength(3000))
        .addStringOption((o) => o.setName('title').setDescription('Title').setMaxLength(256)),
    )
    .addSubcommand((s) =>
      s
        .setName('staff-add')
        .setDescription('Give a user network staff access')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('staff-remove')
        .setDescription('Remove network staff access')
        .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    ),

  async execute(interaction) {
    const { client } = interaction;
    const sub = interaction.options.getSubcommand();
    if (OWNER_SUBCOMMANDS.has(sub) && !isOwner(client, interaction.user.id)) {
      return replyError(interaction, 'Only the bot owner can do that.');
    }
    const ok = (text) => interaction.reply({ embeds: [embed('success', text)], flags: MessageFlags.Ephemeral });

    if (sub === 'server-add' || sub === 'server-remove') {
      const id = interaction.options.getString('server_id')?.trim() ?? interaction.guildId;
      const guild = client.guilds.cache.get(id);
      if (sub === 'server-add' && !guild) return replyError(interaction, 'I am not in a server with that ID.');
      store.updateNetwork((n) => {
        const set = new Set(n.servers);
        if (sub === 'server-add') set.add(id);
        else set.delete(id);
        n.servers = [...set];
      });
      return ok(`**${guild?.name ?? id}** ${sub === 'server-add' ? 'added to' : 'removed from'} the network.`);
    }

    if (sub === 'staff-add' || sub === 'staff-remove') {
      const user = interaction.options.getUser('user');
      store.updateNetwork((n) => {
        const set = new Set(n.staff);
        if (sub === 'staff-add') set.add(user.id);
        else set.delete(user.id);
        n.staff = [...set];
      });
      return ok(`**${user.tag}** ${sub === 'staff-add' ? 'is now' : 'is no longer'} network staff.`);
    }

    const guilds = networkGuilds(client);
    if (!guilds.length) return replyError(interaction, 'No servers are in the network yet. Use `/network server-add`.');

    if (sub === 'ban') {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      if (isOwner(client, user.id) || user.id === client.user.id) return replyError(interaction, 'You cannot network ban that user.');

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      store.updateNetwork((n) => {
        n.bans[user.id] = { reason, by: interaction.user.id, at: Date.now() };
      });
      const failed = [];
      for (const guild of guilds) {
        try {
          await guild.members.ban(user.id, { reason: `Network ban by ${interaction.user.tag}: ${reason}` });
          await logFields(guild, 'network', 'Network ban', [
            ['User', `${user.tag} (${user.id})`],
            ['By', interaction.user.tag],
            ['Reason', reason],
          ]);
        } catch {
          failed.push(guild.name);
        }
      }
      return interaction.editReply({
        embeds: [
          embed(
            failed.length ? 'warn' : 'success',
            `**${user.tag}** banned from ${guilds.length - failed.length}/${guilds.length} network servers.` +
              (failed.length ? `\nFailed (missing permissions?): ${failed.join(', ')}` : ''),
          ),
        ],
      });
    }

    if (sub === 'unban') {
      const user = interaction.options.getUser('user');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      store.updateNetwork((n) => {
        delete n.bans[user.id];
      });
      let count = 0;
      for (const guild of guilds) {
        if (await guild.members.unban(user.id, `Network unban by ${interaction.user.tag}`).catch(() => null)) count++;
      }
      return interaction.editReply({
        embeds: [embed('success', `Network ban lifted for **${user.tag}** (unbanned in ${count} server(s)).`)],
      });
    }

    const announcement = embed(
      'info',
      interaction.options.getString('message').replaceAll('\\n', '\n'),
      interaction.options.getString('title') ?? 'Network Announcement',
    ).setFooter({ text: `Sent by ${interaction.user.tag}` });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    let sent = 0;
    const missing = [];
    for (const guild of guilds) {
      if (!store.getGuild(guild.id).logs.network) {
        missing.push(guild.name);
        continue;
      }
      await sendLog(guild, 'network', announcement);
      sent++;
    }
    return interaction.editReply({
      embeds: [
        embed(
          'success',
          `Announcement sent to ${sent}/${guilds.length} servers.` +
            (missing.length ? `\nNo network channel set (use \`/logging set network\`): ${missing.join(', ')}` : ''),
        ),
      ],
    });
  },
};
