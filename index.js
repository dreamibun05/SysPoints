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

// syspoints @ dreamibun05
// beta build 0.2.0
// last updated fri jun 26th

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
  } while (Object.values(data.users).some((user) => user.systemId === id));

  return id;
}

function getUserData(data, discordUserId) {
  if (!data.users[discordUserId]) {
    data.users[discordUserId] = {
      systemId: null,
      systemName: null,
      members: {},
      chores: {},
      history: [],
    };
  }

  const userData = data.users[discordUserId];

  // migration for older data
  if (!userData.members) userData.members = {};
  if (!userData.chores) userData.chores = {};
  if (!userData.history) userData.history = [];
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

function choreListText(userData) {
  const entries = Object.entries(userData.chores);

  if (entries.length === 0) return "No chores yet.";

  return entries
    .map(([id, chore]) => `[${id}] ${chore.name} — ${chore.points} points`)
    .join("\n");
}

function addHistory(userData, entry) {
  userData.history.unshift({
    ...entry,
    date: new Date().toISOString(),
  });

  userData.history = userData.history.slice(0, 25);
}

function recentHistoryText(userData) {
  if (!userData.history || userData.history.length === 0) {
    return "No recent point history yet.";
  }

  return userData.history
    .slice(0, 10)
    .map((entry) => {
      return `• **${entry.memberName}** ${
        entry.change > 0 ? "gained" : "lost"
      } **${Math.abs(entry.change)}** points — ${entry.reason}`;
    })
    .join("\n");
}

function leaderboardText(userData) {
  const entries = Object.entries(userData.members);

  if (entries.length === 0) return "No members yet.";

  return entries
    .sort((a, b) => b[1].points - a[1].points)
    .map(([id, member], index) => {
      const medal =
        index === 0
          ? "🥇"
          : index === 1
          ? "🥈"
          : index === 2
          ? "🥉"
          : `${index + 1}.`;

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
      "## SysPoints Commands:\n" +
        "**System management**\n" +
        "`sp_createsystem <system name>`\n" +
        "`sp_system`\n" +
        "`sp_systemrename <new name>`\n" +
        "`sp_addmember <name>`\n" +
        "`sp_bulkadd <name1>, <name2>, <name3>`\n" +
        "`sp_members`\n" +
        "`sp_rename <member ID> <new name>`\n" +
        "`sp_find <name>`\n" +
        "`sp_id <member name>`\n" +
        "`sp_memberinfo <member ID>`\n" +
        "**Points management**\n" +
        "`sp_addpoints <member ID> <amount>`\n" +
        "`sp_removepoints <member ID> <amount>`\n" +
        "`sp_setpoints <member ID> <amount>`\n" +
        "`sp_resetpoints <member ID>`\n" +
        "`sp_checkpoints <member ID>`\n" +
        "`sp_givepoints @user <member ID> <amount>`\n" +
        "`sp_leaderboard`\n" +
        "`sp_recent`\n" +
        "**Chores**\n" +
        "`sp_chore add <points> <chore>`\n" +
        "`sp_chore list`\n" +
        "`sp_chore finish <chore ID> <member ID>`\n" +
        "`sp_chore rename <chore ID> <new name>`\n" +
        "`sp_chore editpoints <chore ID> <points>`\n" +
        "`sp_chore delete <chore ID>`\n" +
        "***Danger zone!***\n" +
        "`sp_deletemember <member ID>`\n" +
        "`sp_purge`\n" +
        "*Note! Both sp_help and sp_commands work to access this menu at any time!*"
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
        `Members: ${Object.keys(userData.members).length}\n` +
        `Chores: ${Object.keys(userData.chores).length}`
    );
  }

  // RENAME SYSTEM
  if (content.startsWith("sp_systemrename ")) {
    const name = content.substring("sp_systemrename ".length).trim();

    if (!name) {
      return message.channel.send("Usage: `sp_systemrename <new name>`");
    }

    ensureSystem(data, userData);
    userData.systemName = name;

    saveData(data);

    return message.channel.send(`System renamed to **${name}**.`);
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
      `Added member to **${systemDisplayName(
        userData,
        username
      )}**:\n[ID: ${id}] ${name} — 0 points`
    );
  }

  // BULK ADD MEMBERS
  if (content.startsWith("sp_bulkadd ")) {
    ensureSystem(data, userData);

    const names = content
      .substring("sp_bulkadd ".length)
      .split(/[,;]/)
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    if (names.length === 0) {
      return message.channel.send("Usage: `sp_bulkadd Alice, Bob, Charlie`");
    }

    const added = [];

    for (const name of names) {
      let id;

      do {
        id = generateId();
      } while (userData.members[id]);

      userData.members[id] = {
        name,
        points: 0,
        systemId: userData.systemId,
      };

      added.push(`[${id}] ${name}`);
    }

    saveData(data);

    return message.channel.send(
      `Added **${added.length}** members:\n\n${added.join("\n")}`
    );
  }

  // MEMBERS
  if (content === "sp_members") {
    return message.channel.send(
      `**${systemDisplayName(userData, username)} members:**\n${memberListText(
        userData
      )}`
    );
  }

  // RENAME MEMBER
  if (content.startsWith("sp_rename ")) {
    const args = content.split(" ");
    const id = args[1];
    const newName = args.slice(2).join(" ");

    if (!id || !newName) {
      return message.channel.send("Usage: `sp_rename <member ID> <new name>`");
    }

    if (!userData.members[id]) {
      return message.channel.send("Member not found.");
    }

    const oldName = userData.members[id].name;
    userData.members[id].name = newName;

    saveData(data);

    return message.channel.send(`Renamed **${oldName}** to **${newName}**.`);
  }

  // MEMBER ID LOOKUP
  if (content.startsWith("sp_id ")) {
    const search = content.substring("sp_id ".length).trim().toLowerCase();

    if (!search) {
      return message.channel.send("Usage: `sp_id <member name>`");
    }

    const results = Object.entries(userData.members).filter(([, member]) =>
      member.name.toLowerCase().includes(search)
    );

    if (results.length === 0) {
      return message.channel.send("No matching members.");
    }

    return message.channel.send(
      results
        .map(
          ([id, member]) =>
            `**${member.name}**\nID: \`${id}\`\nPoints: ${member.points}`
        )
        .join("\n\n")
    );
  }

  // FIND MEMBER
  if (content.startsWith("sp_find ")) {
    const search = content.substring("sp_find ".length).trim().toLowerCase();

    if (!search) {
      return message.channel.send("Usage: `sp_find <name>`");
    }

    const results = Object.entries(userData.members).filter(([, member]) =>
      member.name.toLowerCase().includes(search)
    );

    if (results.length === 0) {
      return message.channel.send("No matching members.");
    }

    return message.channel.send(
      results
        .map(([id, member]) => `[${id}] ${member.name} — ${member.points} points`)
        .join("\n")
    );
  }

  // MEMBER INFO
  if (content.startsWith("sp_memberinfo ")) {
    const id = content.split(" ")[1];

    if (!id) {
      return message.channel.send("Usage: `sp_memberinfo <member ID>`");
    }

    if (!userData.members[id]) {
      return message.channel.send("Member not found.");
    }

    const member = userData.members[id];

    return message.channel.send(
      `## ${member.name}\n\n` +
        `**ID:** ${id}\n` +
        `**Points:** ${member.points}\n` +
        `**System:** ${systemDisplayName(userData, username)}`
    );
  }

  // LEADERBOARD
  if (content === "sp_leaderboard") {
    return message.channel.send(
      `**${systemDisplayName(userData, username)} leaderboard:**\n${leaderboardText(
        userData
      )}`
    );
  }

  // RECENT POINT HISTORY
  if (content === "sp_recent") {
    return message.channel.send(
      `**Recent point history for ${systemDisplayName(
        userData,
        username
      )}:**\n${recentHistoryText(userData)}`
    );
  }

  // GIVE POINTS TO ANOTHER SYSTEM'S MEMBER
  if (content.startsWith("sp_givepoints ")) {
    const args = content.split(" ");
    const targetUser = message.mentions.users.first();
    const id = args[2];
    const amount = Number(args[3]);

    if (!targetUser || !id || isNaN(amount)) {
      return message.channel.send(
        "Usage: `sp_givepoints @user <member ID> <amount>`"
      );
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

    addHistory(targetUserData, {
      memberId: id,
      memberName: targetUserData.members[id].name,
      change: amount,
      reason: `gifted by ${username}`,
    });

    saveData(data);

    return message.channel.send(
      `${username} gave **${amount} points** to ${
        targetUserData.members[id].name
      } from **${systemDisplayName(targetUserData, targetUser.username)}**.\n` +
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

    if (!userData.members[id]) {
      return message.channel.send("Member not found.");
    }

    userData.members[id].points += amount;

    addHistory(userData, {
      memberId: id,
      memberName: userData.members[id].name,
      change: amount,
      reason: `added by ${username}`,
    });

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
      return message.channel.send(
        "Usage: `sp_removepoints <member ID> <amount>`"
      );
    }

    if (!userData.members[id]) {
      return message.channel.send("Member not found.");
    }

    userData.members[id].points -= amount;

    addHistory(userData, {
      memberId: id,
      memberName: userData.members[id].name,
      change: -amount,
      reason: `removed by ${username}`,
    });

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

    const oldPoints = userData.members[id].points;
    userData.members[id].points = amount;

    addHistory(userData, {
      memberId: id,
      memberName: userData.members[id].name,
      change: amount - oldPoints,
      reason: `set by ${username}`,
    });

    saveData(data);

    return message.channel.send(
      `${username}'s ${userData.members[id].name} now has ${amount} points.`
    );
  }

  // RESET POINTS
  if (content.startsWith("sp_resetpoints ")) {
    const id = content.split(" ")[1];

    if (!id) {
      return message.channel.send("Usage: `sp_resetpoints <member ID>`");
    }

    if (!userData.members[id]) {
      return message.channel.send("Member not found.");
    }

    const oldPoints = userData.members[id].points;
    userData.members[id].points = 0;

    addHistory(userData, {
      memberId: id,
      memberName: userData.members[id].name,
      change: -oldPoints,
      reason: `reset by ${username}`,
    });

    saveData(data);

    return message.channel.send(
      `${userData.members[id].name}'s points have been reset.`
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

  // =====================
  // CHORES
  // =====================

  // ADD CHORE
  if (content.startsWith("sp_chore add ")) {
    const args = content.split(" ");
    const points = Number(args[2]);
    const name = args.slice(3).join(" ");

    if (isNaN(points) || points <= 0 || !name) {
      return message.channel.send("Usage: `sp_chore add <points> <chore>`");
    }

    ensureSystem(data, userData);

    let id;
    do {
      id = generateId(4);
    } while (userData.chores[id]);

    userData.chores[id] = {
      name,
      points,
      systemId: userData.systemId,
    };

    saveData(data);

    return message.channel.send(
      `Added chore:\n[${id}] ${name} — ${points} points`
    );
  }

  // LIST CHORES
  if (content === "sp_chore list") {
    return message.channel.send(
      `**${systemDisplayName(userData, username)} chores:**\n${choreListText(
        userData
      )}`
    );
  }

  // FINISH CHORE
  if (content.startsWith("sp_chore finish ")) {
    const args = content.split(" ");

    const choreId = args[2];
    const memberId = args[3];

    if (!choreId || !memberId) {
      return message.channel.send(
        "Usage: `sp_chore finish <chore ID> <member ID>`"
      );
    }

    if (!userData.chores[choreId]) {
      return message.channel.send("Chore not found.");
    }

    if (!userData.members[memberId]) {
      return message.channel.send("Member not found.");
    }

    const chore = userData.chores[choreId];
    const member = userData.members[memberId];

    member.points += chore.points;

    addHistory(userData, {
      memberId,
      memberName: member.name,
      change: chore.points,
      reason: `completed chore: ${chore.name}`,
    });

    saveData(data);

    return message.channel.send(
      `${member.name} completed **${chore.name}**!\n+${chore.points} SysPoints\n\n${member.name} now has ${member.points} points.`
    );
  }

  // RENAME CHORE
  if (content.startsWith("sp_chore rename ")) {
    const args = content.split(" ");
    const id = args[2];
    const name = args.slice(3).join(" ");

    if (!id || !name) {
      return message.channel.send(
        "Usage: `sp_chore rename <chore ID> <new name>`"
      );
    }

    if (!userData.chores[id]) {
      return message.channel.send("Chore not found.");
    }

    const oldName = userData.chores[id].name;
    userData.chores[id].name = name;

    saveData(data);

    return message.channel.send(`Renamed **${oldName}** to **${name}**.`);
  }

  // EDIT CHORE POINTS
  if (content.startsWith("sp_chore editpoints ")) {
    const args = content.split(" ");

    const id = args[2];
    const points = Number(args[3]);

    if (!id || isNaN(points)) {
      return message.channel.send(
        "Usage: `sp_chore editpoints <chore ID> <points>`"
      );
    }

    if (!userData.chores[id]) {
      return message.channel.send("Chore not found.");
    }

    userData.chores[id].points = points;

    saveData(data);

    return message.channel.send(
      `${userData.chores[id].name} is now worth **${points}** points.`
    );
  }

  // DELETE CHORE
  if (content.startsWith("sp_chore delete ")) {
    const args = content.split(" ");

    const choreId = args[2];

    if (!choreId) {
      return message.channel.send("Usage: `sp_chore delete <chore ID>`");
    }

    if (!userData.chores[choreId]) {
      return message.channel.send("Chore not found.");
    }

    const deletedName = userData.chores[choreId].name;

    delete userData.chores[choreId];

    saveData(data);

    return message.channel.send(`Deleted chore **${deletedName}**.`);
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
      systemId: null,
      systemName: null,
      members: {},
      chores: {},
      history: [],
    };

    pendingPurge[message.author.id] = false;
    saveData(data);

    return message.channel.send(`${username}'s system data has been wiped.`);
  }
});

client.login(process.env.DISCORD_TOKEN);

// ramiel was fucking here bitch!!! yea!!!