const { Events } = require('discord.js');
const { logFields } = require('../util');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (message.partial || !message.guild || message.author.bot) return;
    await logFields(
      message.guild,
      'messages',
      'Message deleted',
      [
        ['Author', `${message.author.tag} (${message.author.id})`],
        ['Channel', `<#${message.channelId}>`],
        ['Content', message.content || '*No text content*', false],
        ...(message.attachments.size
          ? [['Attachments', message.attachments.map((a) => a.name).join(', '), false]]
          : []),
      ],
      'error',
    );
  },
};
