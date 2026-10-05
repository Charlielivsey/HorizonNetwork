const { Events } = require('discord.js');
const { logFields } = require('../util');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (oldMessage.partial || !newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    await logFields(newMessage.guild, 'messages', 'Message edited', [
      ['Author', `${newMessage.author.tag} (${newMessage.author.id})`],
      ['Channel', `<#${newMessage.channelId}> · [Jump](${newMessage.url})`],
      ['Before', oldMessage.content || '*Empty*', false],
      ['After', newMessage.content || '*Empty*', false],
    ]);
  },
};
