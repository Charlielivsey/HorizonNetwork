const { Events } = require('discord.js');
const { logFields } = require('../util');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (oldMember.partial) return;
    const user = `${newMember.user.tag} (${newMember.id})`;

    if (oldMember.nickname !== newMember.nickname) {
      await logFields(newMember.guild, 'members', 'Nickname changed', [
        ['User', user],
        ['Before', oldMember.nickname ?? 'None'],
        ['After', newMember.nickname ?? 'None'],
      ]);
    }

    const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
    const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
    if (added.size || removed.size) {
      await logFields(newMember.guild, 'members', 'Roles updated', [
        ['User', user, false],
        ...(added.size ? [['Added', added.map((r) => `<@&${r.id}>`).join(' ')]] : []),
        ...(removed.size ? [['Removed', removed.map((r) => `<@&${r.id}>`).join(' ')]] : []),
      ]);
    }
  },
};
