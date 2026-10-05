require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN is not set. Add it to the .env file next to package.json.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel],
});

client.commands = new Collection();
client.components = new Collection();
client.owners = new Set(
  (process.env.BOT_OWNER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
);

const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  client.commands.set(command.data.name, command);
  for (const [prefix, handler] of Object.entries(command.components ?? {})) {
    client.components.set(prefix, handler);
  }
}

const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsDir, file));
  const handler = (...args) =>
    Promise.resolve()
      .then(() => event.execute(...args, client))
      .catch((err) => console.error(`[event:${event.name}]`, err));
  client[event.once ? 'once' : 'on'](event.name, handler);
}

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  if (err.code === 'DisallowedIntents' || /disallowed intents/i.test(err.message)) {
    console.error(
      'Login failed: privileged intents are not enabled.\n' +
        'Go to https://discord.com/developers/applications > your bot > Bot, and enable\n' +
        '"SERVER MEMBERS INTENT" and "MESSAGE CONTENT INTENT", then restart the bot.',
    );
  } else {
    console.error(`Login failed (${err.code ?? 'unknown'}): ${err.message}. Check DISCORD_TOKEN in .env is correct.`);
  }
  process.exit(1);
});
