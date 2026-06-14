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

function getUserData(data, discordUserId) {
  if (!data.users[discordUserId]) {
    data.users[discordUserId] = {
      members: {},
    };
  }

  return data.users[discordUserId];
}

// =====================
// HELPERS
// =====================
function generateId(length = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";

  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }

  return id;
}

function displayName(message) {
  return message.member?.displayName || message.author.username;
}

function memberListText(userData) {
  const entries = Object.entries(userData.members);

  if (entries.length === 0) {
    return "No members yet.";
  }

  return entries
    .map(([id, member]) => `[${id}] ${member.name} — ${member.points} points`)
    .join("\n");
}

function leaderboardText(userData) {
  const entries = Object.entries(userData.members);

  if (entries.length === 0) {
    return "No members yet.";
  }

  return entries
    .sort((a, b) => b[1].points - a[1].points)
    .map(([id, member], index) => {
      const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
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
  if (content === "sp_help") {
    return message.channel.send(
      "**SysPoints Commands:**\n" +
        "`sp_addmember <name>`\n" +
        "`sp_members`\n" +
        "`sp_addpoints <member ID> <amount>`\n" +
        "`sp_removepoints <member ID> <amount>`\n" +
        "`sp_setpoints <member ID> <amount>`\n" +
        "`sp_checkpoints <member ID>`\n" +
        "`sp_leaderboard`\n" +
        "`sp_deletemember <member ID>`\n" +
        "`sp_purge`\n"
    );
  }

  // ADD MEMBER
  if (content.startsWith("sp_addmember ")) {
    const name = content.split(" ").slice(1).join(" ");

    if (!name) {
      return message.channel.send("Usage: `sp_addmember <name>`");
    }

    let id;
    do {
      id = generateId();
    } while (userData.members[id]);

    userData.members[id] = {
      name,
      points: 0,
    };

    saveData(data);

    return message.channel.send(
      `Added member to ${username}'s system:\n[ID: ${id}] ${name} — 0 points`
    );
  }

  // MEMBERS
  if (content === "sp_members") {
    return message.channel.send(
      `**${username}'s members:**\n${memberListText(userData)}`
    );
  }

  // LEADERBOARD
  if (content === "sp_leaderboard") {
    return message.channel.send(
      `**${username}'s system leaderboard:**\n${leaderboardText(userData)}`
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

    if (!userData.members[id]) {
      return message.channel.send("Member not found.");
    }

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

    if (!userData.members[id]) {
      return message.channel.send("Member not found.");
    }

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

    if (!userData.members[id]) {
      return message.channel.send("Member not found.");
    }

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

    if (!userData.members[id]) {
      return message.channel.send("Member not found.");
    }

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

    if (!userData.members[id]) {
      return message.channel.send("Member not found.");
    }

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
      members: {},
    };

    pendingPurge[message.author.id] = false;
    saveData(data);

    return message.channel.send(`${username}'s system data has been wiped.`);
  }
});

client.login(process.env.DISCORD_TOKEN);