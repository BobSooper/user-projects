const eris = require("eris");
const fs = require("fs");
const path = require("path");

const config = require("./config.json");

const client = new eris(config.token, {
  restMode: true
});
client.commands = new Map;
client.pending = require("./pending.json");
client.accepted = require("./accepted.json");
client.denied = require("./denied.json");
client.timeouts = {};
client.config = config;

fs.readdir(__dirname + "/commands", (err, files) => {
  if(err) throw err;
  for(const file of files.filter(f => f.endsWith(".js"))) {
    const cmd = require(__dirname + "/commands/" + file);
    client.commands.set(cmd.name, cmd);
  }
});

client.on("messageCreate", (msg) => {
  if(!msg.content || !msg.author) return;
  if(!msg.content.startsWith("s!")) return;
  const [cmd, ...args] = msg.content.slice(2).split(/\s/);
  if(!client.commands.has(cmd)) return;
  client.commands.get(cmd).run(client, msg, args);
});

client.on("messageReactionAdd", async(msg, emoji, user) => {
  if(user === client.user.id) return;
  const obj = Object.values(client.pending).find(o => o.message === msg.id);
  if(!obj) return;
  if(emoji.name === "❌") {
    clearTimeout(client.timeouts[obj.user]);
    delete client.timeouts[obj.user];
    client.denied.push(obj.user);
    writeSafe(path.join(__dirname, "./denied.json"), JSON.stringify(client.denied));
    delete client.pending[obj.user];
    writeSafe(path.join(__dirname, "./pending.json"), JSON.stringify(client.pending));
    const user = client.users.get(obj.user) || await client.getRESTUser(obj.user);
    await client.createMessage(msg.channel.id, `Successfully denied **${user.username}#${user.discriminator}**!`);
    try {
      const channel = await client.getDMChannel(obj.user);
      await channel.createMessage("Sorry! You've been denied access into the faction, your application was not good enough :(");
    } catch(err) {} // eslint-disable-line no-empty
  }
  if(emoji.name === "✅") {
    clearTimeout(client.timeouts[obj.user]);
    delete client.timeouts[obj.user];
    const user = client.users.get(obj.user) || await client.getRESTUser(obj.user);
    client.addGuildMemberRole("262669086201217024", obj.user, "510582312816214027");
    client.accepted.push(obj.user);
    delete client.pending[obj.user];
    writeSafe(path.join(__dirname, "./pending.json"), JSON.stringify(client.pending));
    writeSafe(path.join(__dirname, "./accepted.json"), JSON.stringify(client.accepted));
    try {
      const channel = await client.getDMChannel(obj.user);
      await channel.createMessage("Congrats! You've been accepted into the faction. Welcome!");
      await client.createMessage(msg.channel.id, `Successfully accepted ${user.username}#${user.discriminator}`);
    } catch(err) {
      await client.createMessage(msg.channel.id, `Failed to DM **${user.username}#${user.discriminator}**. Please tell them they have been accepted.`);
    }
  }
});

client.once("ready", () => {
  console.log("READY");
  // Continue timeout
  for(const obj of Object.values(client.pending)) {
    if(Date.now() - obj.timestamp >= 86400000) {
      client.getDMChannel(obj.user).then(ch => ch.createMessage("You have been auto-denied due to inactivity from our officers. Feel free to reapply."));
      delete client.pending[obj.user];
    }
    client.timeouts[obj.user] = setTimeout(() => {
      delete client.timeouts[obj.user];
      client.getDMChannel(obj.user).then(ch => ch.createMessage("You have been auto-denied due to inactivity from our officers. Feel free to reapply."));
      delete client.pending[obj.user];
      writeSafe(path.join(__dirname, "./pending.json"), JSON.stringify(client.pending));
    }, obj.timestamp - Date.now() + 86400000);
  }
  writeSafe(path.join(__dirname, "./pending.json"), JSON.stringify(client.pending));
  // No event for invite updates so scheduled update every 5 minutes
  setInterval(async() => {
    const invites = await client.getGuildInvites("262669086201217024");
    client.invites = invites.map(i => i.code);
  }, 300000);
});

client.on("error", console.error);

client.connect();

function writeSafe(path, val) {
  return fs.writeFileSync(path, val);
}

exports.writeSafe = writeSafe;