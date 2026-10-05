const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  InteractionContextType,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  time,
} = require('discord.js');
const { embed, replyError, roleAssignError, isDangerousRole, hierarchyError, modLog } = require('../util');

const PANEL_ROLE_SLOTS = 10;

async function togglePanelRole(interaction) {
  const roleId = interaction.customId.split(':')[1];
  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) return replyError(interaction, 'That role no longer exists.');
  if (role.managed || isDangerousRole(role) || role.position >= interaction.guild.members.me.roles.highest.position) {
    return replyError(interaction, 'I can no longer assign that role. Please ask a server admin to fix the role panel.');
  }

  const member = interaction.member;
  const has = member.roles.cache.has(role.id);
  if (has) await member.roles.remove(role, 'Role panel');
  else await member.roles.add(role, 'Role panel');
  return interaction.reply({
    embeds: [embed('success', `${has ? 'Removed' : 'Gave you'} the <@&${role.id}> role.`)],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  category: 'Role Management',
  permission: PermissionFlagsBits.ManageRoles,
  components: { rolepanel: togglePanelRole },
  data: (() => {
    const builder = new SlashCommandBuilder()
      .setName('role')
      .setDescription('Manage member roles and self-assign role panels')
      .setContexts(InteractionContextType.Guild)
      .addSubcommand((s) =>
        s
          .setName('add')
          .setDescription('Give a role to a member')
          .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
          .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('remove')
          .setDescription('Remove a role from a member')
          .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
          .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('info')
          .setDescription('Show information about a role')
          .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
      );
    builder.addSubcommand((s) => {
      s.setName('panel')
        .setDescription('Post buttons that let members give themselves roles')
        .addStringOption((o) => o.setName('title').setDescription('Panel title').setRequired(true).setMaxLength(256))
        .addRoleOption((o) => o.setName('role1').setDescription('Role 1').setRequired(true));
      for (let i = 2; i <= PANEL_ROLE_SLOTS; i++) {
        s.addRoleOption((o) => o.setName(`role${i}`).setDescription(`Role ${i}`));
      }
      return s
        .addStringOption((o) => o.setName('description').setDescription('Panel text').setMaxLength(2000))
        .addChannelOption((o) =>
          o.setName('channel').setDescription('Where to post (default: here)').addChannelTypes(ChannelType.GuildText),
        );
    });
    return builder;
  })(),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'info') {
      const role = interaction.options.getRole('role');
      const perms = role.permissions.has(PermissionFlagsBits.Administrator)
        ? 'Administrator'
        : role.permissions.toArray().slice(0, 15).join(', ') || 'None';
      return interaction.reply({
        embeds: [
          embed('info', `<@&${role.id}>`, role.name)
            .setColor(role.color || 0x5865f2)
            .addFields(
              { name: 'ID', value: role.id, inline: true },
              { name: 'Members', value: String(role.members.size), inline: true },
              { name: 'Position', value: String(role.position), inline: true },
              { name: 'Colour', value: role.hexColor, inline: true },
              { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
              { name: 'Created', value: time(role.createdAt, 'R'), inline: true },
              { name: 'Permissions', value: perms },
            ),
        ],
      });
    }

    if (sub === 'panel') {
      const roles = [];
      for (let i = 1; i <= PANEL_ROLE_SLOTS; i++) {
        const role = interaction.options.getRole(`role${i}`);
        if (!role || roles.some((r) => r.id === role.id)) continue;
        const err = roleAssignError(interaction, role);
        if (err) return replyError(interaction, `${role.name}: ${err}`);
        if (isDangerousRole(role)) {
          return replyError(interaction, `${role.name} has moderator/admin permissions and cannot be self-assigned.`);
        }
        roles.push(role);
      }

      const rows = [];
      for (let i = 0; i < roles.length; i += 5) {
        rows.push(
          new ActionRowBuilder().addComponents(
            roles
              .slice(i, i + 5)
              .map((r) => new ButtonBuilder().setCustomId(`rolepanel:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary)),
          ),
        );
      }
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      await channel.send({
        embeds: [
          embed(
            'info',
            interaction.options.getString('description') ?? 'Click a button to get or remove a role.',
            interaction.options.getString('title'),
          ),
        ],
        components: rows,
      });
      return interaction.reply({ embeds: [embed('success', `Role panel posted in <#${channel.id}>.`)], flags: MessageFlags.Ephemeral });
    }

    const member = interaction.options.getMember('user');
    const role = interaction.options.getRole('role');
    if (!member) return replyError(interaction, 'That user is not in this server.');
    const err = roleAssignError(interaction, role) ?? (member.id === interaction.user.id ? null : hierarchyError(interaction, member));
    if (err) return replyError(interaction, err);

    if (sub === 'add') {
      if (member.roles.cache.has(role.id)) return replyError(interaction, `${member.user.tag} already has that role.`);
      await member.roles.add(role, `By ${interaction.user.tag}`);
    } else {
      if (!member.roles.cache.has(role.id)) return replyError(interaction, `${member.user.tag} does not have that role.`);
      await member.roles.remove(role, `By ${interaction.user.tag}`);
    }

    await interaction.reply({
      embeds: [embed('success', `${sub === 'add' ? 'Gave' : 'Removed'} <@&${role.id}> ${sub === 'add' ? 'to' : 'from'} <@${member.id}>.`)],
    });
    return modLog(interaction.guild, sub === 'add' ? 'Role added' : 'Role removed', [
      ['User', `${member.user.tag} (${member.id})`],
      ['Role', role.name],
      ['Moderator', interaction.user.tag],
    ]);
  },
};
