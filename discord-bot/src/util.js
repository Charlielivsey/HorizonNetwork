const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const store = require('./store');

const COLORS = { info: 0x5865f2, success: 0x57f287, warn: 0xfee75c, error: 0xed4245 };

function embed(type, description, title) {
  const e = new EmbedBuilder().setColor(COLORS[type]);
  if (description) e.setDescription(description);
  if (title) e.setTitle(title);
  return e;
}

function truncate(text, max = 1024) {
  const s = String(text ?? '');
  return s.length > max ? `${s.slice(0, max - 3)}...` : s || '​';
}

function replyError(interaction, text) {
  const payload = { embeds: [embed('error', text)], flags: MessageFlags.Ephemeral };
  return interaction.deferred || interaction.replied ? interaction.followUp(payload) : interaction.reply(payload);
}

async function sendLog(guild, type, logEmbed, files) {
  const channelId = store.getGuild(guild.id).logs[type];
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [logEmbed.setTimestamp()], files }).catch(() => {});
}

function logFields(guild, type, title, fields, color = 'warn') {
  const e = new EmbedBuilder()
    .setColor(COLORS[color])
    .setTitle(title)
    .addFields(fields.map(([name, value, inline = true]) => ({ name, value: truncate(value), inline })));
  return sendLog(guild, type, e);
}

function modLog(guild, title, fields) {
  return logFields(guild, 'moderation', title, fields);
}

// Returns an error string if the invoker can't act on the target member, otherwise null.
function hierarchyError(interaction, target) {
  if (!target) return null;
  if (target.id === interaction.user.id) return 'You cannot do that to yourself.';
  if (target.id === interaction.client.user.id) return 'I cannot do that to myself.';
  if (target.id === interaction.guild.ownerId) return 'You cannot do that to the server owner.';
  const invoker = interaction.member;
  if (
    interaction.guild.ownerId !== invoker.id &&
    target.roles.highest.position >= invoker.roles.highest.position
  ) {
    return 'That member has an equal or higher role than you.';
  }
  return null;
}

// Returns an error string if the role can't be given out by this invoker/bot, otherwise null.
function roleAssignError(interaction, role) {
  const { guild, member } = interaction;
  if (role.managed || role.id === guild.id) return 'That role is managed by Discord or an integration and cannot be assigned.';
  if (role.position >= guild.members.me.roles.highest.position) {
    return 'That role is above my highest role. Move my role higher in Server Settings > Roles.';
  }
  if (guild.ownerId !== member.id && role.position >= member.roles.highest.position) {
    return 'That role is equal to or above your highest role.';
  }
  return null;
}

const DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
];

function isDangerousRole(role) {
  return DANGEROUS_PERMISSIONS.some((p) => role.permissions.has(p));
}

function fillPlaceholders(text, { user, guild, memberCount }) {
  return text
    .replaceAll('{user}', `<@${user.id}>`)
    .replaceAll('{username}', user.username)
    .replaceAll('{server}', guild.name)
    .replaceAll('{count}', String(memberCount ?? guild.memberCount));
}

module.exports = {
  COLORS,
  embed,
  truncate,
  replyError,
  sendLog,
  logFields,
  modLog,
  hierarchyError,
  roleAssignError,
  isDangerousRole,
  fillPlaceholders,
};
