const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const GUILDS_FILE = path.join(DATA_DIR, 'guilds.json');
const NETWORK_FILE = path.join(DATA_DIR, 'network.json');

const LOG_TYPES = ['moderation', 'members', 'messages', 'tickets', 'network'];

const GUILD_DEFAULTS = {
  welcomeChannelId: null,
  welcomeMessage: 'Welcome {user} to **{server}**! You are member #{count}.',
  autoRoleId: null,
  logs: Object.fromEntries(LOG_TYPES.map((t) => [t, null])),
  warnings: {},
  disabledCommands: [],
  commandRoles: {},
  customCommands: {},
  tickets: {
    categoryId: null,
    transcriptChannelId: null,
    supportRoleIds: [],
    counter: 0,
    open: {},
  },
  responses: {},
  memberCounter: { channelId: null, template: 'Members: {count}' },
};

const NETWORK_DEFAULTS = { servers: [], staff: [], bans: {} };

function load(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

function write(file, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function withDefaults(defaults, stored = {}) {
  const out = structuredClone(defaults);
  for (const [key, value] of Object.entries(stored)) {
    const isPlainObject = value && typeof value === 'object' && !Array.isArray(value);
    out[key] = isPlainObject && out[key] && !Array.isArray(out[key]) ? { ...out[key], ...value } : value;
  }
  return out;
}

const guilds = load(GUILDS_FILE);
let network = withDefaults(NETWORK_DEFAULTS, load(NETWORK_FILE));

function getGuild(guildId) {
  return withDefaults(GUILD_DEFAULTS, guilds[guildId]);
}

function updateGuild(guildId, mutate) {
  const config = getGuild(guildId);
  mutate(config);
  guilds[guildId] = config;
  write(GUILDS_FILE, guilds);
  return config;
}

function deleteGuild(guildId) {
  if (!guilds[guildId]) return;
  delete guilds[guildId];
  write(GUILDS_FILE, guilds);
}

function allGuildIds() {
  return Object.keys(guilds);
}

function getNetwork() {
  return structuredClone(network);
}

function updateNetwork(mutate) {
  mutate(network);
  write(NETWORK_FILE, network);
  return getNetwork();
}

module.exports = {
  LOG_TYPES,
  getGuild,
  updateGuild,
  deleteGuild,
  allGuildIds,
  getNetwork,
  updateNetwork,
};
