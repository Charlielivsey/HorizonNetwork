const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } = require('discord.js');
const { embed, modLog, hierarchyError } = require('../util');

const DURATIONS = [
  ['60 seconds', 60],
  ['5 minutes', 300],
  ['10 minutes', 600],
  ['1 hour', 3600],
  ['1 day', 86400],
  ['1 week', 604800],
  ['Remove timeout', 0],
];

module.exports = {
  category: 'Moderation',
  permission: PermissionFlagsBits.ModerateMembers,
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout (mute) a member, or remove a timeout')
    .setContexts(InteractionContextType.Guild)
    .addUserOption((o) => o.setName('user').setDescription('Member to timeout').setRequired(true))
    .addIntegerOption((o) =>
      o
        .setName('duration')
        .setDescription('How long')
        .setRequired(true)
        .addChoices(...DURATIONS.map(([name, value]) => ({ name, value }))),
    )
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setMaxLength(400)),

  async execute(interaction) {
    const member = interaction.options.getMember('user');
    const seconds = interaction.options.getInteger('duration');
    const reason = interaction.options.getString('reason') ?? 'No reason given';

    if (!member) {
      return interaction.reply({ embeds: [embed('error', 'That user is not in this server.')], flags: MessageFlags.Ephemeral });
    }
    const err = hierarchyError(interaction, member);
    if (err) return interaction.reply({ embeds: [embed('error', err)], flags: MessageFlags.Ephemeral });
    if (!member.moderatable) {
      return interaction.reply({
        embeds: [embed('error', 'I cannot timeout that member. Check my role is above theirs.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    await member.timeout(seconds ? seconds * 1000 : null, `${interaction.user.tag}: ${reason}`);
    const label = DURATIONS.find(([, v]) => v === seconds)[0];
    const text = seconds
      ? `**${member.user.tag}** was timed out for ${label}.\nReason: ${reason}`
      : `Timeout removed for **${member.user.tag}**.`;

    await interaction.reply({ embeds: [embed('success', text)] });
    await modLog(interaction.guild, seconds ? 'Member timed out' : 'Timeout removed', [
      ['User', `${member.user.tag} (${member.id})`],
      ['Moderator', interaction.user.tag],
      ['Duration', label],
      ['Reason', reason],
    ]);
  },
};
