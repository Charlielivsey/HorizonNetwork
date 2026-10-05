const { Events, time } = require('discord.js');
const memberCounter = require('../memberCounter');
const { logFields } = require('../util');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    memberCounter.markDirty(member.guild.id);
    await logFields(
      member.guild,
      'members',
      'Member left',
      [
        ['User', `${member.user.tag} (${member.id})`],
        ['Joined', member.joinedAt ? time(member.joinedAt, 'R') : 'Unknown'],
        ['Member count', member.guild.memberCount],
      ],
      'error',
    );
  },
};
