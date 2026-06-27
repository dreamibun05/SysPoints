console.log("BOT FILE STARTED");

require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");

const DATA_FILE = "./data.json";
const pendingPurge = {};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =====================
// DATA
// =====================
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {} }, null, 2));
  }

  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function generateId(length = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";

  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }

  return id;
}

function generateSystemId(data) {
  let id;

  do {
    id = `SYS-${generateId(6)}`;
  } while (
    Object.values(data.users).some((user) => user.systemId === id)
  );

  return id;
}

function getUserData(data, discordUserId) {
  if (!data.users[discordUserId]) {
    data.users[discordUserId] = {
      systemId: null,
      systemName: null,
      members: {},
    };
  }

  const userData = data.users[discordUserId];

  // migration for older data
  if (!userData.members) userData.members = {};
  if (!("systemId" in userData)) userData.systemId = null;
  if (!("systemName" in userData)) userData.systemName = null;

  return userData;
}

function ensureSystem(data, userData) {
  if (!userData.systemId) {
    userData.systemId = generateSystemId(data);
  }

  for (const member of Object.values(userData.members)) {
    member.systemId = userData.systemId;
  }
}

// =====================
// HELPERS
// =====================
function displayName(message) {
  return message.member?.displayName || message.author.username;
}

function systemDisplayName(userData, fallbackName) {
  return userData.systemName || `${fallbackName}'s system`;
}

function memberListText(userData) {
  const entries = Object.entries(userData.members);

  if (entries.length === 0) return "No members yet.";

  return entries
    .map(([id, member]) => `[${id}] ${member.name} — ${member.points} points`)
    .join("\n");
}

function leaderboardText(userData) {
  const entries = Object.entries(userData.members);

  if (entries.length === 0) return "No members yet.";

  return entries
    .sort((a, b) => b[1].points - a[1].points)
    .map(([id, member], index) => {
      const medal =
        index === 0 ? "🥇" :
        index === 1 ? "🥈" :
        index === 2 ? "🥉" :
        `${index + 1}.`;

      return `${medal} [${id}] ${member.name} — ${member.points} points`;
    })
    .join("\n");
}

// =====================
// READY
// =====================
client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// =====================
// COMMANDS
// =====================
client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  const data = loadData();
  const userData = getUserData(data, message.author.id);
  const username = displayName(message);
  const content = message.content.trim();

  // HELP
  if (content === "sp_help" || content === "sp_commands") {
    return message.channel.send(
      "**SysPoints Commands:**\n" +
      + "*System management*" +
        "`sp_createsystem <system name>`\n" +
        "`sp_system`\n" +
        "`sp_addmember <name>`\n" +
        "`sp_members`\n" +
        "*Points management*" +
        "`sp_addpoints <member ID> <amount>`\n" +
        "`sp_removepoints <member ID> <amount>`\n" +
        "`sp_setpoints <member ID> <amount>`\n" +
        "`sp_checkpoints <member ID>`\n" +
        "`sp_givepoints @user <member ID> <amount>`\n" +
        "`sp_leaderboard`\n" +
        "*Danger zone!*" +
        "`sp_deletemember <member ID>`\n" +
        "`sp_purge`\n"
    );
  }

  // CREATE / RENAME SYSTEM
  if (content.startsWith("sp_createsystem ")) {
    const systemName = content.split(" ").slice(1).join(" ");

    if (!systemName) {
      return message.channel.send("Usage: `sp_createsystem <system name>`");
    }

    ensureSystem(data, userData);
    userData.systemName = systemName;

    saveData(data);

    return message.channel.send(
      `Created system profile:\n**${systemName}**\nSystem ID: \`${userData.systemId}\``
    );
  }

  // VIEW SYSTEM
  if (content === "sp_system") {
    ensureSystem(data, userData);
    saveData(data);

    return message.channel.send(
      `**${systemDisplayName(userData, username)}**\n` +
      `System ID: \`${userData.systemId}\`\n` +
      `Members: ${Object.keys(userData.members).length}`
    );
  }

  // ADD MEMBER
  if (content.startsWith("sp_addmember ")) {
    const name = content.split(" ").slice(1).join(" ");

    if (!name) {
      return message.channel.send("Usage: `sp_addmember <name>`");
    }

    ensureSystem(data, userData);

    let id;
    do {
      id = generateId();
    } while (userData.members[id]);

    userData.members[id] = {
      name,
      points: 0,
      systemId: userData.systemId,
    };

    saveData(data);

    return message.channel.send(
      `Added member to **${systemDisplayName(userData, username)}**:\n[ID: ${id}] ${name} — 0 points`
    );
  }

  // MEMBERS
  if (content === "sp_members") {
    return message.channel.send(
      `**${systemDisplayName(userData, username)} members:**\n${memberListText(userData)}`
    );
  }

  // LEADERBOARD
  if (content === "sp_leaderboard") {
    return message.channel.send(
      `**${systemDisplayName(userData, username)} leaderboard:**\n${leaderboardText(userData)}`
    );
  }

  // GIVE POINTS TO ANOTHER SYSTEM'S MEMBER
  if (content.startsWith("sp_givepoints ")) {
    const args = content.split(" ");
    const targetUser = message.mentions.users.first();
    const id = args[2];
    const amount = Number(args[3]);

    if (!targetUser || !id || isNaN(amount)) {
      return message.channel.send("Usage: `sp_givepoints @user <member ID> <amount>`");
    }

    if (amount <= 0) {
      return message.channel.send("You can only give a positive amount of points.");
    }

    const targetUserData = getUserData(data, targetUser.id);
    ensureSystem(data, targetUserData);

    if (!targetUserData.members[id]) {
      return message.channel.send("That user's member was not found.");
    }

    targetUserData.members[id].points += amount;
    saveData(data);

    return message.channel.send(
      `${username} gave **${amount} points** to ${targetUserData.members[id].name} from **${systemDisplayName(targetUserData, targetUser.username)}**.\n` +
      `${targetUserData.members[id].name} now has **${targetUserData.members[id].points} points**.`
    );
  }

  // ADD POINTS
  if (content.startsWith("sp_addpoints ")) {
    const args = content.split(" ");
    const id = args[1];
    const amount = Number(args[2]);

    if (!id || isNaN(amount)) {
      return message.channel.send("Usage: `sp_addpoints <member ID> <amount>`");
    }

    if (!userData.members[id]) return message.channel.send("Member not found.");

    userData.members[id].points += amount;
    saveData(data);

    return message.channel.send(
      `${username}'s ${userData.members[id].name} now has ${userData.members[id].points} points.`
    );
  }

  // REMOVE POINTS
  if (content.startsWith("sp_removepoints ")) {
    const args = content.split(" ");
    const id = args[1];
    const amount = Number(args[2]);

    if (!id || isNaN(amount)) {
      return message.channel.send("Usage: `sp_removepoints <member ID> <amount>`");
    }

    if (!userData.members[id]) return message.channel.send("Member not found.");

    userData.members[id].points -= amount;
    saveData(data);

    return message.channel.send(
      `${username}'s ${userData.members[id].name} now has ${userData.members[id].points} points.`
    );
  }

  // SET POINTS
  if (content.startsWith("sp_setpoints ")) {
    const args = content.split(" ");
    const id = args[1];
    const amount = Number(args[2]);

    if (!id || isNaN(amount)) {
      return message.channel.send("Usage: `sp_setpoints <member ID> <amount>`");
    }

    if (!userData.members[id]) return message.channel.send("Member not found.");

    userData.members[id].points = amount;
    saveData(data);

    return message.channel.send(
      `${username}'s ${userData.members[id].name} now has ${amount} points.`
    );
  }

  // CHECK POINTS
  if (content.startsWith("sp_checkpoints ")) {
    const args = content.split(" ");
    const id = args[1];

    if (!id) {
      return message.channel.send("Usage: `sp_checkpoints <member ID>`");
    }

    if (!userData.members[id]) return message.channel.send("Member not found.");

    return message.channel.send(
      `${username}'s ${userData.members[id].name} has ${userData.members[id].points} points.`
    );
  }

  // DELETE MEMBER
  if (content.startsWith("sp_deletemember ")) {
    const args = content.split(" ");
    const id = args[1];

    if (!id) {
      return message.channel.send("Usage: `sp_deletemember <member ID>`");
    }

    if (!userData.members[id]) return message.channel.send("Member not found.");

    const deletedName = userData.members[id].name;
    delete userData.members[id];

    saveData(data);

    return message.channel.send(`Deleted ${deletedName} from ${username}'s system.`);
  }

  // PURGE
  if (content === "sp_purge") {
    pendingPurge[message.author.id] = true;

    return message.channel.send(
      `Are you sure you want to wipe ${username}'s system data?\nType \`sp_confirm purge\` to proceed.`
    );
  }

  // CONFIRM PURGE
  if (content === "sp_confirm purge") {
    if (!pendingPurge[message.author.id]) {
      return message.channel.send("No purge is pending.");
    }

    data.users[message.author.id] = {
      systemId: null,
      systemName: null,
      members: {},
    };

    pendingPurge[message.author.id] = false;
    saveData(data);

    return message.channel.send(`${username}'s system data has been wiped.`);
  }
});

client.login(process.env.DISCORD_TOKEN);