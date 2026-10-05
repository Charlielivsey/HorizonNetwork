const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  MessageFlags,
  time,
} = require('discord.js');
const store = require('../store');
const { embed, modLog, hierarchyError } = require('../util');

module.exports = {
  category: 'Moderation',
  permission: PermissionFlagsBits.ModerateMembers,
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Manage member warnings')
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Warn a member')
        .addUserOption((o) => o.setName('user').setDescription('Member to warn').setRequired(true))
        .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(400)),
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription("Show a member's warnings")
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('clear')
        .setDescription("Clear all of a member's warnings")
        .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');
    const guildId = interaction.guild.id;

    if (sub === 'add') {
      const err = hierarchyError(interaction, interaction.options.getMember('user'));
      if (err) return interaction.reply({ embeds: [embed('error', err)], flags: MessageFlags.Ephemeral });

      const reason = interaction.options.getString('reason');
      const config = store.updateGuild(guildId, (c) => {
        c.warnings[user.id] ??= [];
        c.warnings[user.id].push({ reason, moderatorId: interaction.user.id, at: Date.now() });
      });
      const count = config.warnings[user.id].length;

      await user.send(`You were warned in **${interaction.guild.name}**: ${reason}`).catch(() => {});
      await interaction.reply({
        embeds: [embed('warn', `**${user.tag}** has been warned (${count} total).\nReason: ${reason}`)],
      });
      return modLog(interaction.guild, 'Member warned', [
        ['User', `${user.tag} (${user.id})`],
        ['Moderator', interaction.user.tag],
        ['Total warnings', count],
        ['Reason', reason],
      ]);
    }

    if (sub === 'list') {
      const warnings = store.getGuild(guildId).warnings[user.id] ?? [];
      if (!warnings.length) {
        return interaction.reply({ embeds: [embed('info', `**${user.tag}** has no warnings.`)], flags: MessageFlags.Ephemeral });
      }
      const lines = warnings
        .slice(-15)
        .map((w, i) => `**${i + 1}.** ${w.reason} — <@${w.moderatorId}> ${time(new Date(w.at), 'R')}`);
      return interaction.reply({
        embeds: [embed('info', lines.join('\n'), `Warnings for ${user.tag} (${warnings.length})`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    store.updateGuild(guildId, (c) => {
      delete c.warnings[user.id];
    });
    await interaction.reply({ embeds: [embed('success', `Cleared all warnings for **${user.tag}**.`)] });
    return modLog(interaction.guild, 'Warnings cleared', [
      ['User', `${user.tag} (${user.id})`],
      ['Moderator', interaction.user.tag],
    ]);
  },
};
