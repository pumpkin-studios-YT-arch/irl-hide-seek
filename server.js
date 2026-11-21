const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, service: "irl-hide-seek" }));

function makeCode() {
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), b => alphabet[b % alphabet.length]).join("");
  } while (rooms.has(code));
  return code;
}
function token() { return crypto.randomBytes(18).toString("hex"); }
function publicPlayer(p) {
  return { key:p.key, name:p.name, role:p.role, caught:p.caught, connected:p.connected };
}
function publicState(room) {
  return {
    phase:room.phase, round:room.round, timerSeconds:room.timerSeconds,
    players:[...room.players.values()].map(publicPlayer),
    rules:room.rules, safeZone:room.safeZone, boundary:room.boundary,
    locked:room.locked, seekers:room.seekers
  };
}
function broadcastState(code) {
  const room = rooms.get(code);
  if (room) io.to(code).emit("state", publicState(room));
}
function notice(socket, message, level="info") {
  socket.emit("notice", { message, level });
}
function findPlayer(room, text) {
  const q = String(text || "").toLowerCase();
  return [...room.players.values()].find(p => p.name.toLowerCase() === q || p.key === text);
}
function startMatch(room, code, overrideSeekers) {
  if (!["lobby","ended"].includes(room.phase)) return {ok:false,message:"The match is already running."};
  const players = [...room.players.values()].filter(p => p.role !== "host" && p.connected);
  if (players.length < 2) return {ok:false,message:"At least two connected non-host players are required."};
  const count = Math.max(1, Math.min(players.length - 1, Number(overrideSeekers || room.seekers || 1)));
  for (const p of players) { p.role = "hider"; p.caught = false; }
  const shuffled = [...players];
  for (let i=shuffled.length-1;i>0;i--) {
    const j = crypto.randomInt(i+1);
    [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  for (let i=0;i<count;i++) shuffled[i].role="seeker";
  room.phase = "seeking";
  room.startedAt = Date.now();
  for (const p of players) io.to(p.socketId).emit("role", { role:p.role, room:code });
  io.to(code).emit("event", {kind:"start",message:`Round ${room.round} started. ${count} Seeker(s) selected.`});
  broadcastState(code);
  return {ok:true,message:`Match started. ${count} Seeker(s) randomly assigned.`};
}
const commandList = [
  "/help","/status","/players","/start [seekers]","/pause","/resume","/end","/newround",
  "/setseekers number","/timer seconds","/broadcast message","/caught player","/uncaught player",
  "/revive player","/kick player","/rename old new","/rules","/setrules text",
  "/safezone text","/boundary text","/checkin","/emergency","/lockroom","/unlockroom",
  "/shuffle","/ability message","/reset"
];

function runCommand(code, host, raw) {
  const room=rooms.get(code);
  if(!room) return {ok:false,message:"Room no longer exists."};
  const bits=String(raw||"").trim().replace(/^\//,"").split(/\s+/);
  const cmd=(bits.shift()||"").toLowerCase();
  const arg=bits.join(" ");
  const announce=message=>io.to(code).emit("event",{kind:"admin",message});
  const fail=message=>({ok:false,message});
  const ok=message=>({ok:true,message});
  if(cmd==="help") { io.to(host.socketId).emit("command-help",commandList); return ok("Command list sent."); }
  if(cmd==="status") return ok(`Round ${room.round} · ${room.phase} · ${room.players.size} players · ${room.timerSeconds}s configured.`);
  if(cmd==="players") return ok([...room.players.values()].map(p=>`${p.name} (${p.role}${p.caught?", caught":""}${p.connected?", online":", offline"})`).join(" | "));
  if(cmd==="start") return startMatch(room,code,bits[0]);
  if(cmd==="pause") {
    if(!["seeking","hiding"].includes(room.phase))return fail("There is no active match to pause.");
    room.phase="paused";announce("HOST PAUSED THE GAME. Stop moving and wait for instructions.");broadcastState(code);return ok("Match paused.");
  }
  if(cmd==="resume") {
    if(room.phase!=="paused")return fail("The match is not paused.");
    room.phase="seeking";announce("The host resumed the match.");broadcastState(code);return ok("Match resumed.");
  }
  if(cmd==="end") {room.phase="ended";announce("The host ended the match.");broadcastState(code);return ok("Match ended.");}
  if(cmd==="newround"||cmd==="reset") {
    room.phase="lobby";room.round=cmd==="reset"?1:room.round+1;
    for(const p of room.players.values())if(p.role!=="host"){p.role="waiting";p.caught=false;}
    announce(cmd==="reset"?"Room reset to lobby.":`Round ${room.round} lobby is open.`);
    broadcastState(code);return ok("Lobby is ready. Players will wait until you start.");
  }
  if(cmd==="setseekers") {room.seekers=Math.max(1,Math.min(10,Number(bits[0])||1));return ok(`Default Seeker count set to ${room.seekers}.`);}
  if(cmd==="timer"||cmd==="settime") {room.timerSeconds=Math.max(30,Math.min(7200,Number(bits[0])||300));broadcastState(code);return ok(`Timer display set to ${room.timerSeconds} seconds.`);}
  if(cmd==="broadcast") {if(!arg)return fail("Usage: /broadcast your message");announce(`HOST ANNOUNCEMENT: ${arg}`);return ok("Announcement sent.");}
  if(["caught","uncaught","revive"].includes(cmd)) {
    const p=findPlayer(room,arg);if(!p)return fail("Player not found. Try /players.");
    if(p.role!=="hider")return fail("That player is not a Hider.");
    p.caught=cmd==="caught";announce(`${p.name} ${p.caught?"was marked caught":"was returned to the game"}.`);broadcastState(code);return ok("Player status updated.");
  }
  if(cmd==="kick") {
    const p=findPlayer(room,arg);if(!p||p.role==="host")return fail("Player not found or cannot kick host.");
    io.to(p.socketId).emit("kicked");io.sockets.sockets.get(p.socketId)?.disconnect(true);
    room.players.delete(p.key);announce(`${p.name} was removed from the room.`);broadcastState(code);return ok("Player removed.");
  }
  if(cmd==="rename") {
    const oldName=bits.shift();const newName=bits.join(" ").slice(0,24);const p=findPlayer(room,oldName);
    if(!p||!newName)return fail("Usage: /rename oldname newname");
    const before=p.name;p.name=newName;announce(`${before} is now ${newName}.`);broadcastState(code);return ok("Player renamed.");
  }
  if(cmd==="rules")return ok(room.rules);
  if(cmd==="setrules"){if(!arg)return fail("Usage: /setrules text");room.rules=arg;announce("Host updated the rules.");broadcastState(code);return ok("Rules updated.");}
  if(cmd==="safezone"){if(!arg)return ok(room.safeZone);room.safeZone=arg;announce("Host updated the safe zone.");broadcastState(code);return ok("Safe zone updated.");}
  if(cmd==="boundary"){if(!arg)return ok(room.boundary);room.boundary=arg;announce("Host updated the play boundary.");broadcastState(code);return ok("Boundary updated.");}
  if(cmd==="checkin"){announce("SAFETY CHECK-IN: Everyone, confirm you are safe.");return ok("Check-in request sent.");}
  if(cmd==="emergency"){room.phase="paused";announce("EMERGENCY STOP — STOP PLAYING NOW AND RETURN TO THE AGREED SAFE POINT.");broadcastState(code);return ok("Emergency stop sent to everyone.");}
  if(cmd==="lockroom"){room.locked=true;broadcastState(code);return ok("Room locked.");}
  if(cmd==="unlockroom"){room.locked=false;broadcastState(code);return ok("Room unlocked.");}
  if(cmd==="shuffle")return fail("Use /newround, then /start to randomise roles.");
  if(cmd==="ability"){announce(`HOST NOTICE: ${arg||"Ability update"}`);return ok("Ability notice sent.");}
  return fail("Unknown command. Use /help.");
}

app.post("/api/create", express.json(), (_req,res)=>{
  const code=makeCode(), hostToken=token();
  const room={
    code,hostToken,hostKey:null,players:new Map(),phase:"lobby",round:1,
    timerSeconds:300,seekers:1,locked:false,
    rules:"Stay inside the agreed play area. No roads, private property, or unsafe hiding places.",
    safeZone:"Use the safe point agreed by the group before starting.",
    boundary:"Use only the boundaries agreed by the group before starting."
  };
  rooms.set(code,room);
  res.json({code,hostToken});
});

io.on("connection", socket=>{
  socket.on("joinRoom",(data={},callback=()=>{})=>{
    const code=String(data.room||"").toUpperCase();
    const room=rooms.get(code);
    if(!room)return callback({ok:false,message:"Room not found. Ask the host to create a new room."});
    const key=String(data.key||"");
    const name=String(data.name||"Player").trim().slice(0,24)||"Player";
    const isHost=data.hostToken && data.hostToken===room.hostToken;
    if(!key)return callback({ok:false,message:"Missing player session key."});
    if(room.locked && !isHost && !room.players.has(key))return callback({ok:false,message:"This room is locked."});
    if(!room.players.has(key) && room.players.size>=40)return callback({ok:false,message:"Room is full (40 players maximum)."});
    let p=room.players.get(key);
    if(!p){
      if(isHost){
        if(room.hostKey && room.hostKey!==key)return callback({ok:false,message:"Host is already connected."});
        room.hostKey=key;
        p={key,name,role:"host",caught:false,connected:true};
      }else{
        p={key,name,role:room.phase==="lobby"?"waiting":"spectator",caught:false,connected:true};
      }
      room.players.set(key,p);
    }else{
      p.name=name;p.connected=true;
      if(isHost){p.role="host";room.hostKey=key;}
    }
    p.socketId=socket.id;
    socket.data={room:code,key};
    socket.join(code);
    callback({ok:true,self:publicPlayer(p),state:publicState(room)});
    socket.emit("welcome",{self:publicPlayer(p),state:publicState(room)});
    broadcastState(code);
  });

  socket.on("command",raw=>{
    const {room:code,key}=socket.data||{};
    const room=rooms.get(code);const p=room&&room.players.get(key);
    if(!room||!p||p.role!=="host"||room.hostKey!==key){socket.emit("notice",{level:"error",message:"Host permissions required."});return;}
    const result=runCommand(code,p,String(raw||""));
    socket.emit("notice",{level:result.ok?"success":"error",message:result.message});
  });

  socket.on("ability",ability=>{
    const {room:code,key}=socket.data||{};const room=rooms.get(code);const p=room&&room.players.get(key);
    if(!room||!p||!["hider","seeker"].includes(p.role)||!["seeking","hiding"].includes(room.phase))return;
    const allowed=p.role==="hider"?["Smoke Bomb","Decoy","Second Wind","Silent Mode"]:["Radar Pulse","Area Scan","Sprint","Flashlight"];
    if(!allowed.includes(ability))return;
    io.to(code).emit("event",{kind:"ability",message:`${p.name} (${p.role}) activated ${ability}.`});
  });

  socket.on("caught",targetKey=>{
    const {room:code,key}=socket.data||{};const room=rooms.get(code);const p=room&&room.players.get(key);
    if(!room||!p||!["host","seeker"].includes(p.role))return;
    const target=room.players.get(String(targetKey));
    if(!target||target.role!=="hider"||target.caught)return;
    target.caught=true;io.to(code).emit("event",{kind:"caught",message:`${target.name} was marked caught.`});broadcastState(code);
  });

  socket.on("checkin",()=>{
    const {room:code,key}=socket.data||{};const room=rooms.get(code);const p=room&&room.players.get(key);
    if(room&&p)io.to(code).emit("event",{kind:"checkin",message:`${p.name} checked in as safe.`});
  });

  socket.on("disconnect",()=>{
    const {room:code,key}=socket.data||{};const room=rooms.get(code);const p=room&&room.players.get(key);
    if(room&&p&&p.socketId===socket.id){p.connected=false;delete p.socketId;broadcastState(code);}
  });
});

server.listen(PORT,()=>console.log(`IRL Hide & Seek server listening on port ${PORT}`));
