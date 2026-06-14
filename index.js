console.log("BOT FILE STARTED");

require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");

let pendingPurge = {};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const DATA_FILE = "./data.json";

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

function generateId(length = 5) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";

  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }

  return id;
}

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  const data = loadData();
  const userData = getUserData(data, message.author.id);

  if (message.content.startsWith("!addmember ")) {
    const name = message.content.split(" ").slice(1).join(" ");

    if (!name) {
      return message.reply("Usage: `!addmember <name>`");
    }

    let id;
    do {
      id = generateId();
    } while (userData.members[id]);

    userData.members[id] = {
      name: name,
      points: 0,
    };

    saveData(data);

    return message.reply(`Added member:\n[ID: ${id}] ${name} — 0 points`);
  }

  if (message.content === "!members") {
    const entries = Object.entries(userData.members);

    if (entries.length === 0) {
      return message.reply("You don't have any members yet.");
    }

    const table = entries
      .map(([id, member]) => `[${id}] ${member.name} — ${member.points} points`)
      .join("\n");

    return message.reply("**Your Member List:**\n" + table);
  }

  if (message.content.startsWith("!addpoints ")) {
    const args = message.content.split(" ");
    const id = args[1];
    const amount = Number(args[2]);

    if (!id || isNaN(amount)) {
      return message.reply("Usage: `!addpoints <member ID> <amount>`");
    }

    if (!userData.members[id]) {
      return message.reply("Member not found.");
    }

    userData.members[id].points += amount;
    saveData(data);

    return message.reply(
      `✅ Added ${amount} points to ${userData.members[id].name}. They now have ${userData.members[id].points} points.`
    );
  }

  if (message.content.startsWith("!removepoints ")) {
    const args = message.content.split(" ");
    const id = args[1];
    const amount = Number(args[2]);

    if (!id || isNaN(amount)) {
      return message.reply("Usage: `!removepoints <member ID> <amount>`");
    }

    if (!userData.members[id]) {
      return message.reply("Member not found.");
    }

    userData.members[id].points -= amount;
    saveData(data);

    return message.reply(
      `✅ Removed ${amount} points from ${userData.members[id].name}. They now have ${userData.members[id].points} points.`
    );
  }

  if (message.content.startsWith("!setpoints ")) {
    const args = message.content.split(" ");
    const id = args[1];
    const amount = Number(args[2]);

    if (!id || isNaN(amount)) {
      return message.reply("Usage: `!setpoints <member ID> <amount>`");
    }

    if (!userData.members[id]) {
      return message.reply("Member not found.");
    }

    userData.members[id].points = amount;
    saveData(data);

    return message.reply(
      `✅ Set ${userData.members[id].name}'s points to ${amount}.`
    );
  }

  if (message.content.startsWith("!checkpoints ")) {
    const args = message.content.split(" ");
    const id = args[1];

    if (!id) {
      return message.reply("Usage: `!checkpoints <member ID>`");
    }

    if (!userData.members[id]) {
      return message.reply("Member not found.");
    }

    return message.reply(
      `${userData.members[id].name} has ${userData.members[id].points} points.`
    );
  }

  if (message.content.startsWith("!deletemember ")) {
    const args = message.content.split(" ");
    const id = args[1];

    if (!id) {
      return message.reply("Usage: `!deletemember <member ID>`");
    }

    if (!userData.members[id]) {
      return message.reply("Member not found.");
    }

    const deletedName = userData.members[id].name;
    delete userData.members[id];

    saveData(data);

    return message.reply(`Deleted member: ${deletedName}`);
  }

  if (message.content === "!purge") {
    pendingPurge[message.author.id] = true;

    return message.reply(
      "Are you sure you want to wipe YOUR system data?\nType `!confirm purge` to proceed."
    );
  }

  if (message.content === "!confirm purge") {
    if (!pendingPurge[message.author.id]) {
      return message.reply("No purge is pending.");
    }

    data.users[message.author.id] = {
      members: {},
    };

    pendingPurge[message.author.id] = false;
    saveData(data);

    return message.reply("Your system data has been wiped.");
  }

  if (message.content === "!sp_help") {
    return message.reply(
      "**SysPoints Commands:**\n" +
        "`!addmember <name>`\n" +
        "`!members`\n" +
        "`!addpoints <member ID> <amount>`\n" +
        "`!removepoints <member ID> <amount>`\n" +
        "`!setpoints <member ID> <amount>`\n" +
        "`!checkpoints <member ID>`\n" +
        "`!deletemember <member ID>`\n" +
        "`!purge`\n"
    );
  }
});

console.log("Token exists:", !!process.env.DISCORD_TOKEN);
console.log("Length:", process.env.DISCORD_TOKEN?.length);

client.login(process.env.DISCORD_TOKEN);