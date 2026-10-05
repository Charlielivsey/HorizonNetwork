const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const store = require('./store');

// Commands that cannot be disabled, so server admins can always undo their own changes.
const PROTECTED_COMMANDS = new Set(['commands', 'permissions', 'help', 'setup']);

function isOwner(client, userId) {
  return client.owners.has(userId);
}

function isNetworkStaff(client, userId) {
  return isOwner(client, userId) || store.getNetwork().staff.includes(userId);
}

function hasPermission(interaction, permission) {
  return Boolean(
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      interaction.memberPermissions?.has(permission),
  );
}

function permissionName(permission) {
  return new PermissionsBitField(permission).toArray()[0].replace(/([a-z])([A-Z])/g, '$1 $2');
}

// Returns null when allowed, otherwise the reason the command is denied.
function checkAccess(interaction, command) {
  const { client, user } = interaction;
  const name = command.data.name;

  if (command.access === 'owner' && !isOwner(client, user.id)) {
    return 'This command is restricted to the bot owner.';
  }
  if (command.access === 'network' && !isNetworkStaff(client, user.id)) {
    return 'This command is restricted to network staff.';
  }
  if (!interaction.inGuild()) return null;

  const config = store.getGuild(interaction.guildId);
  if (config.disabledCommands.includes(name) && !PROTECTED_COMMANDS.has(name)) {
    return 'This command has been disabled on this server.';
  }

  if (command.adminOnly) {
    return hasPermission(interaction, PermissionFlagsBits.Administrator)
      ? null
      : 'Only server administrators can use this command.';
  }
  if (interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) return null;

  const allowedRoles = config.commandRoles[name];
  if (allowedRoles?.length) {
    return allowedRoles.some((id) => interaction.member.roles.cache.has(id))
      ? null
      : 'You do not have a role that is allowed to use this command.';
  }
  if (command.permission && !interaction.memberPermissions.has(command.permission)) {
    return `You need the **${permissionName(command.permission)}** permission to use this command.`;
  }
  return null;
}

module.exports = { PROTECTED_COMMANDS, isOwner, isNetworkStaff, hasPermission, permissionName, checkAccess };
