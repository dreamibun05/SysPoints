console.log("BOT FILE STARTED");

require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");

const DATA_FILE = process.env.DATA_FILE || "./data.json";

const path = require("path");

const dataDir = path.dirname(DATA_FILE);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const pendingPurge = {};

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// syspoints @ dreamibun05
// beta build 0.2.3
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

  for (const chore of Object.values(userData.chores)) {
    chore.systemId = userData.systemId;
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

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function findMember(userData, input) {
  const search = normalize(input);
  if (!search) return null;

  const entries = Object.entries(userData.members).sort((a, b) =>
  a[1].name.localeCompare(b[1].name)
);

  let exact = entries.find(([id]) => normalize(id) === search);
  if (exact) return { id: exact[0], member: exact[1] };

  exact = entries.find(([, member]) => normalize(member.name) === search);
  if (exact) return { id: exact[0], member: exact[1] };

  const partial = entries.filter(([, member]) =>
    normalize(member.name).includes(search)
  );

  if (partial.length === 1) {
    return { id: partial[0][0], member: partial[0][1] };
  }

  return null;
}

function findMembers(userData, input) {
  const search = normalize(input);
  if (!search) return [];

  return Object.entries(userData.members).filter(([id, member]) => {
    return normalize(id) === search || normalize(member.name).includes(search);
  });
}

function findChore(userData, input) {
  const search = normalize(input);
  if (!search) return null;

  const entry = Object.entries(userData.chores).find(
    ([id]) => normalize(id) === search
  );

  if (!entry) return null;

  return { id: entry[0], chore: entry[1] };
}

function memberListText(userData) {
  const entries = Object.entries(userData.members);

  if (entries.length === 0) return "No members yet.";

  return entries
    .map(([id, member]) => `[\`${id}\`] ${member.name} — ${member.points} points`)
    .join("\n");
}

function choreListText(userData) {
  const entries = Object.entries(userData.chores);

  if (entries.length === 0) return "No chores yet.";

  return entries
    .map(([id, chore]) => `[\`${id}\`] ${chore.name} — ${chore.points} points`)
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

      return `${medal} **${member.name}** — ${member.points} points\nID: \`${id}\``;
    })
    .join("\n");
}

function levenshtein(a, b) {
  a = normalize(a);
  b = normalize(b);

  const matrix = Array.from({ length: b.length + 1 }, () => []);

  for (let i = 0; i <= b.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function findMemberLookup(userData, input) {
  const search = normalize(input);
  if (!search) return null;

  const entries = Object.entries(userData.members);

  // exact ID
  const exactId = entries.find(([id]) => normalize(id) === search);
  if (exactId) return { id: exactId[0], member: exactId[1] };

  // exact name
  const exactName = entries.find(([, member]) => normalize(member.name) === search);
  if (exactName) return { id: exactName[0], member: exactName[1] };

  // partial name
  const partial = entries.filter(([, member]) =>
    normalize(member.name).includes(search)
  );

  if (partial.length === 1) {
    return { id: partial[0][0], member: partial[0][1] };
  }

  if (partial.length > 1) {
    return {
      multiple: partial.map(([id, member]) => ({
        id,
        name: member.name,
        points: member.points,
      })),
    };
  }

  // fuzzy name / fuzzy word
  let best = null;
  let bestScore = Infinity;

  for (const [id, member] of entries) {
    const name = normalize(member.name);
    const fullNameScore = levenshtein(search, name);

    const wordScores = name
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => levenshtein(search, word));

    const score = Math.min(fullNameScore, ...wordScores);

    if (score < bestScore) {
      bestScore = score;
      best = { id, member };
    }
  }

  if (best && bestScore <= 2) {
    return { suggestion: best };
  }

  return null;
}

function memberLookupResponse(message, found, userData, username) {
  if (!found) {
    return message.channel.send("Member not found.");
  }

  if (found.multiple) {
    return message.channel.send(
      "Multiple members match:\n" +
        found.multiple
          .map((m) => `[\`${m.id}\`] ${m.name} — ${m.points} points`)
          .join("\n")
    );
  }

  if (found.suggestion) {
    return message.channel.send(
      `Member not found. Did you mean **${found.suggestion.member.name}**?\n` +
        `ID: \`${found.suggestion.id}\`\n` +
        `Try: \`sp_member ${found.suggestion.id}\``
    );
  }

  return message.channel.send(
    `## ${found.member.name}\n\n` +
      `**ID:** \`${found.id}\`\n` +
      `**Points:** ${found.member.points}\n` +
      `**System:** ${systemDisplayName(userData, username)}`
  );
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

  if (!content.startsWith("sp_")) return;

  const args = content.split(/\s+/);
  const command = normalize(args[0]);

  // HELP
  if (command === "sp_help" || command === "sp_commands") {
    return message.channel.send(
      "## SysPoints Commands:\n" +
        "**System management**\n" +
        "`sp_createsystem <system name>`\n" +
        "`sp_system`\n" +
        "`sp_systemrename <new name>`\n" +
        "`sp_addmember <name>`\n" +
        "`sp_bulkadd <name1>, <name2>, <name3>`\n" +
        "`sp_members`\n" +
        "`sp_rename <member ID or name> <new name>`\n" +
        "`sp_find <member ID or name>`\n" +
        "`sp_id <member name>`\n" +
        "`sp_memberinfo <member ID or name>`\n" +
        "**Points management**\n" +
        "`sp_addpoints <member ID or name> <amount>`\n" +
        "`sp_removepoints <member ID or name> <amount>`\n" +
        "`sp_setpoints <member ID or name> <amount>`\n" +
        "`sp_resetpoints <member ID or name>`\n" +
        "`sp_checkpoints <member ID or name>`\n" +
        "`sp_givepoints @user <member ID or name> <amount>`\n" +
        "`sp_leaderboard`\n" +
        "`sp_recent`\n" +
        "**Chores**\n" +
        "`sp_chore add <points> <chore>`\n" +
        "`sp_chore list`\n" +
        "`sp_chore finish <chore ID> <member ID or name>`\n" +
        "`sp_chore rename <chore ID> <new name>`\n" +
        "`sp_chore editpoints <chore ID> <points>`\n" +
        "`sp_chore delete <chore ID>`\n" +
        "***Danger zone!***\n" +
        "`sp_deletemember <member ID or name>`\n" +
        "`sp_removemember <member ID or name>`\n" +
        "`sp_purge`\n" +
        "*Note! Commands are not case-sensitive.*"
    );
  }

  // CREATE SYSTEM
  if (command === "sp_createsystem") {
    const systemName = args.slice(1).join(" ");

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
  if (command === "sp_system") {
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
  if (command === "sp_systemrename") {
    const name = args.slice(1).join(" ");

    if (!name) {
      return message.channel.send("Usage: `sp_systemrename <new name>`");
    }

    ensureSystem(data, userData);
    userData.systemName = name;

    saveData(data);

    return message.channel.send(`System renamed to **${name}**.`);
  }

  // ADD MEMBER
  if (command === "sp_addmember") {
    const name = args.slice(1).join(" ");

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
      `Added member to **${systemDisplayName(userData, username)}**:\n` +
        `**${name}** — 0 points\nID: \`${id}\``
    );
  }

  // BULK ADD MEMBERS
  if (command === "sp_bulkadd") {
    ensureSystem(data, userData);

    const names = content
      .substring(args[0].length)
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

      added.push(`• **${name}**\n  ID: \`${id}\``);
    }

    saveData(data);

    return message.channel.send(
      `Added **${added.length}** members:\n\n${added.join("\n")}`
    );
  }

  // MEMBERS
  if (
    command === "sp_members" ||
    command === "sp_memberlist" ||
    command === "sp_listmembers"
  ) {
    return message.channel.send(
      `**${systemDisplayName(userData, username)} members:**\n${memberListText(
        userData
      )}`
    );
  }

  // RENAME MEMBER
  if (command === "sp_rename") {
    const target = args[1];
    const newName = args.slice(2).join(" ");

    if (!target || !newName) {
      return message.channel.send(
        "Usage: `sp_rename <member ID or name> <new name>`"
      );
    }

    const found = findMember(userData, target);

    if (!found) {
      return message.channel.send("Member not found.");
    }

    const oldName = found.member.name;
    found.member.name = newName;

    saveData(data);

    return message.channel.send(
      `Renamed **${oldName}** to **${newName}**.\nID: \`${found.id}\``
    );
  }

  // MEMBER ID LOOKUP
  if (command === "sp_id") {
    const search = args.slice(1).join(" ");

    if (!search) {
      return message.channel.send("Usage: `sp_id <member name>`");
    }

    const results = findMembers(userData, search);

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
  if (command === "sp_find") {
    const search = args.slice(1).join(" ");

    if (!search) {
      return message.channel.send("Usage: `sp_find <member ID or name>`");
    }

    const results = findMembers(userData, search);

    if (results.length === 0) {
      return message.channel.send("No matching members.");
    }

    return message.channel.send(
      results
        .map(
          ([id, member]) =>
            `• **${member.name}** — ${member.points} points\n  ID: \`${id}\``
        )
        .join("\n")
    );
  }

  // MEMBER INFO
  if (command === "sp_member" || command === "sp_memberinfo") {
    const target = args.slice(1).join(" ");

    if (!target) {
      return message.channel.send("Usage: `sp_member <member ID or name>`");
    }

    const found = findMemberLookup(userData, target);
    return memberLookupResponse(message, found, userData, username);
  }

  // LEADERBOARD
  if (command === "sp_leaderboard") {
    return message.channel.send(
      `**${systemDisplayName(userData, username)} leaderboard:**\n${leaderboardText(
        userData
      )}`
    );
  }

  // RECENT POINT HISTORY
  if (command === "sp_recent" || command === "sp_history") {
    return message.channel.send(
      `**Recent point history for ${systemDisplayName(
        userData,
        username
      )}:**\n${recentHistoryText(userData)}`
    );
  }

  // GIVE POINTS TO ANOTHER SYSTEM'S MEMBER
  if (command === "sp_givepoints") {
    const targetUser = message.mentions.users.first();
    const amount = Number(args[3]);
    const targetMember = args[2];

    if (!targetUser || !targetMember || isNaN(amount)) {
      return message.channel.send(
        "Usage: `sp_givepoints @user <member ID or name> <amount>`"
      );
    }

    if (amount <= 0) {
      return message.channel.send("You can only give a positive amount of points.");
    }

    const targetUserData = getUserData(data, targetUser.id);
    ensureSystem(data, targetUserData);

    const found = findMember(targetUserData, targetMember);

    if (!found) {
      return message.channel.send("That user's member was not found.");
    }

    found.member.points += amount;

    addHistory(targetUserData, {
      memberId: found.id,
      memberName: found.member.name,
      change: amount,
      reason: `gifted by ${username}`,
    });

    saveData(data);

    return message.channel.send(
      `${username} gave **${amount} points** to **${found.member.name}** from **${systemDisplayName(
        targetUserData,
        targetUser.username
      )}**.\n` +
        `ID: \`${found.id}\`\n` +
        `${found.member.name} now has **${found.member.points} points**.`
    );
  }

  // ADD POINTS
  if (command === "sp_addpoints") {
    const target = args[1];
    const amount = Number(args[2]);

    if (!target || isNaN(amount)) {
      return message.channel.send(
        "Usage: `sp_addpoints <member ID or name> <amount>`"
      );
    }

    const found = findMember(userData, target);

    if (!found) {
      return message.channel.send("Member not found.");
    }

    found.member.points += amount;

    addHistory(userData, {
      memberId: found.id,
      memberName: found.member.name,
      change: amount,
      reason: `added by ${username}`,
    });

    saveData(data);

    return message.channel.send(
      `${username}'s **${found.member.name}** now has **${found.member.points} points**.\nID: \`${found.id}\``
    );
  }

  // REMOVE POINTS
  if (command === "sp_removepoints") {
    const target = args[1];
    const amount = Number(args[2]);

    if (!target || isNaN(amount)) {
      return message.channel.send(
        "Usage: `sp_removepoints <member ID or name> <amount>`"
      );
    }

    const found = findMember(userData, target);

    if (!found) {
      return message.channel.send("Member not found.");
    }

    found.member.points -= amount;

    addHistory(userData, {
      memberId: found.id,
      memberName: found.member.name,
      change: -amount,
      reason: `removed by ${username}`,
    });

    saveData(data);

    return message.channel.send(
      `${username}'s **${found.member.name}** now has **${found.member.points} points**.\nID: \`${found.id}\``
    );
  }

  // SET POINTS
  if (command === "sp_setpoints") {
    const target = args[1];
    const amount = Number(args[2]);

    if (!target || isNaN(amount)) {
      return message.channel.send(
        "Usage: `sp_setpoints <member ID or name> <amount>`"
      );
    }

    const found = findMember(userData, target);

    if (!found) {
      return message.channel.send("Member not found.");
    }

    const oldPoints = found.member.points;
    found.member.points = amount;

    addHistory(userData, {
      memberId: found.id,
      memberName: found.member.name,
      change: amount - oldPoints,
      reason: `set by ${username}`,
    });

    saveData(data);

    return message.channel.send(
      `${username}'s **${found.member.name}** now has **${amount} points**.\nID: \`${found.id}\``
    );
  }

  // RESET POINTS
  if (command === "sp_resetpoints") {
    const target = args.slice(1).join(" ");

    if (!target) {
      return message.channel.send(
        "Usage: `sp_resetpoints <member ID or name>`"
      );
    }

    const found = findMember(userData, target);

    if (!found) {
      return message.channel.send("Member not found.");
    }

    const oldPoints = found.member.points;
    found.member.points = 0;

    addHistory(userData, {
      memberId: found.id,
      memberName: found.member.name,
      change: -oldPoints,
      reason: `reset by ${username}`,
    });

    saveData(data);

    return message.channel.send(
      `**${found.member.name}**'s points have been reset.\nID: \`${found.id}\``
    );
  }

  // CHECK POINTS
  if (command === "sp_checkpoints") {
    const target = args.slice(1).join(" ");

    if (!target) {
      return message.channel.send(
        "Usage: `sp_checkpoints <member ID or name>`"
      );
    }

    const found = findMember(userData, target);

    if (!found) {
      return message.channel.send("Member not found.");
    }

    return message.channel.send(
      `${username}'s **${found.member.name}** has **${found.member.points} points**.\nID: \`${found.id}\``
    );
  }

  // =====================
  // CHORES
  // =====================

  if (command === "sp_chore") {
    const subcommand = normalize(args[1]);

    // ADD CHORE
    if (subcommand === "add") {
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
        `Added chore:\n**${name}** — ${points} points\nID: \`${id}\``
      );
    }

    // LIST CHORES
    if (subcommand === "list") {
      return message.channel.send(
        `**${systemDisplayName(userData, username)} chores:**\n${choreListText(
          userData
        )}`
      );
    }

    // FINISH CHORE
    if (subcommand === "finish") {
      const choreIdInput = args[2];
      const memberInput = args.slice(3).join(" ");

      if (!choreIdInput || !memberInput) {
        return message.channel.send(
          "Usage: `sp_chore finish <chore ID> <member ID or name>`"
        );
      }

      const foundChore = findChore(userData, choreIdInput);

      if (!foundChore) {
        return message.channel.send("Chore not found.");
      }

      const foundMember = findMember(userData, memberInput);

      if (!foundMember) {
        return message.channel.send("Member not found.");
      }

      foundMember.member.points += foundChore.chore.points;

      addHistory(userData, {
        memberId: foundMember.id,
        memberName: foundMember.member.name,
        change: foundChore.chore.points,
        reason: `completed chore: ${foundChore.chore.name}`,
      });

      saveData(data);

      return message.channel.send(
        `**${foundMember.member.name}** completed **${foundChore.chore.name}**!\n` +
          `+${foundChore.chore.points} SysPoints\n\n` +
          `${foundMember.member.name} now has **${foundMember.member.points} points**.\n` +
          `Member ID: \`${foundMember.id}\`\n` +
          `Chore ID: \`${foundChore.id}\``
      );
    }

    // RENAME CHORE
    if (subcommand === "rename") {
      const choreIdInput = args[2];
      const name = args.slice(3).join(" ");

      if (!choreIdInput || !name) {
        return message.channel.send(
          "Usage: `sp_chore rename <chore ID> <new name>`"
        );
      }

      const foundChore = findChore(userData, choreIdInput);

      if (!foundChore) {
        return message.channel.send("Chore not found.");
      }

      const oldName = foundChore.chore.name;
      foundChore.chore.name = name;

      saveData(data);

      return message.channel.send(
        `Renamed **${oldName}** to **${name}**.\nID: \`${foundChore.id}\``
      );
    }

    // EDIT CHORE POINTS
    if (subcommand === "editpoints") {
      const choreIdInput = args[2];
      const points = Number(args[3]);

      if (!choreIdInput || isNaN(points)) {
        return message.channel.send(
          "Usage: `sp_chore editpoints <chore ID> <points>`"
        );
      }

      const foundChore = findChore(userData, choreIdInput);

      if (!foundChore) {
        return message.channel.send("Chore not found.");
      }

      foundChore.chore.points = points;

      saveData(data);

      return message.channel.send(
        `**${foundChore.chore.name}** is now worth **${points}** points.\nID: \`${foundChore.id}\``
      );
    }

    // DELETE CHORE
    if (subcommand === "delete") {
      const choreIdInput = args[2];

      if (!choreIdInput) {
        return message.channel.send("Usage: `sp_chore delete <chore ID>`");
      }

      const foundChore = findChore(userData, choreIdInput);

      if (!foundChore) {
        return message.channel.send("Chore not found.");
      }

      const deletedName = foundChore.chore.name;

      delete userData.chores[foundChore.id];

      saveData(data);

      return message.channel.send(
        `Deleted chore **${deletedName}**.\nID: \`${foundChore.id}\``
      );
    }
  }

  // DELETE MEMBER
  if (command === "sp_deletemember" || command === "sp_removemember") {
    const target = args.slice(1).join(" ");

    if (!target) {
      return message.channel.send(
        "Usage: `sp_deletemember <member ID or name>`"
      );
    }

    const found = findMember(userData, target);

    if (!found) {
      return message.channel.send("Member not found.");
    }

    const deletedName = found.member.name;
    delete userData.members[found.id];

    saveData(data);

    return message.channel.send(
      `Deleted **${deletedName}** from ${username}'s system.\nID: \`${found.id}\``
    );
  }

  // PURGE
  if (command === "sp_purge") {
    pendingPurge[message.author.id] = true;

    return message.channel.send(
      `Are you sure you want to wipe ${username}'s system data?\nType \`sp_confirm purge\` to proceed.`
    );
  }

  // CONFIRM PURGE
  if (command === "sp_confirm" && normalize(args[1]) === "purge") {
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