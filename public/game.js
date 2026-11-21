const $=id=>document.getElementById(id);
const room=(new URLSearchParams(location.search).get("room")||sessionStorage.getItem("hs_room")||"").toUpperCase();
const name=sessionStorage.getItem("hs_name")||"Player";
const key=sessionStorage.getItem("hs_key")||crypto.randomUUID();
sessionStorage.setItem("hs_key",key);
const hostPage=location.pathname==="/host.html";
const hostToken=sessionStorage.getItem("hs_hostToken")||"";
let myRole=hostPage?"host":"waiting", state=null, socket=null;
function text(id,value){const e=$(id);if(e)e.textContent=value;}
function log(message,kind="info"){
 const feed=$("feed");if(!feed)return;
 const row=document.createElement("div");row.className="event "+kind;
 const time=document.createElement("time");time.textContent=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
 const msg=document.createElement("span");msg.textContent=message;row.append(time,msg);feed.prepend(row);
 while(feed.children.length>35)feed.lastChild.remove();
}
function sendCommand(cmd){if(socket&&socket.connected)socket.emit("command",cmd);else log("Not connected to the server.","error");}
function drawPlayers(s){
 for(const id of ["players","playersLive"]){
  const ul=$(id);if(!ul)continue;ul.innerHTML="";
  s.players.forEach(p=>{
   if(id==="playersLive"&&p.role==="host")return;
   const li=document.createElement("li");li.className="player-row";
   const box=document.createElement("div");box.className="player-main";
   const b=document.createElement("b");b.textContent=p.name;
   const small=document.createElement("small");small.textContent=(s.phase==="lobby"&&p.role!=="host"?"WAITING":p.role.toUpperCase())+" · "+(p.connected?"ONLINE":"OFFLINE")+(p.caught?" · CAUGHT":"");
   box.append(b,small);li.append(box);
   if(hostPage&&s.phase!=="lobby"&&p.role==="hider"&&!p.caught){
    const btn=document.createElement("button");btn.className="mini danger";btn.textContent="CAUGHT";btn.onclick=()=>sendCommand("/caught "+p.name);li.append(btn);
   }
   ul.append(li);
  });
 }
}
function draw(s){
 state=s;text("roomCode",room);text("phase",s.phase.toUpperCase());text("playerCount",s.players.length+" PLAYERS");
 text("round",s.round);text("timer",fmt(s.timerSeconds));text("phaseNotice",s.phase.toUpperCase());
 text("rules",s.rules);text("safeZone",s.safeZone);text("boundary",s.boundary);
 const lobby=$("lobbyPanel"),live=$("livePanel");
 if(lobby&&live){lobby.hidden=s.phase!=="lobby";live.hidden=s.phase==="lobby";}
 drawPlayers(s);
 const link=location.origin+"/ChairmanJoinCloudflare.html?room="+room;text("joinLink",link);
}
function fmt(n){n=Math.max(0,Number(n)||0);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
function redirectRole(role){
 myRole=role;
 if(role==="hider"&&!location.pathname.endsWith("hider.html"))location.replace("/hider.html?room="+room);
 if(role==="seeker"&&!location.pathname.endsWith("seeker.html"))location.replace("/seeker.html?room="+room);
}
function connect(){
 if(!room){text("connection","NO ROOM CODE");return;}
 socket=io();
 socket.on("connect",()=>{
  text("connection","CONNECTED");
  socket.emit("joinRoom",{room,name,key,hostToken},result=>{
   if(!result||!result.ok){text("connection","JOIN FAILED");log(result?.message||"Could not join room.","error");return;}
   myRole=result.self.role;draw(result.state);
   if(!hostPage&&result.state.phase!=="lobby"&&(myRole==="hider"||myRole==="seeker"))redirectRole(myRole);
   if(hostPage&&myRole!=="host"){text("connection","HOST AUTH FAILED");log("This browser does not have the host token. Create the room again from the home page.","error");}
  });
 });
 socket.on("disconnect",()=>text("connection","DISCONNECTED — RECONNECTING"));
 socket.on("connect_error",e=>{text("connection","SERVER ERROR");log(e.message,"error");});
 socket.on("welcome",d=>{myRole=d.self.role;draw(d.state);});
 socket.on("state",s=>{
  draw(s);
  if(!hostPage){
   const me=s.players.find(p=>p.key===key);
   if(s.phase==="lobby"&&(location.pathname.endsWith("hider.html")||location.pathname.endsWith("seeker.html"))){location.replace("/player.html?room="+room);return;}
   if(me&&(me.role==="hider"||me.role==="seeker"))redirectRole(me.role);
  }
 });
 socket.on("role",d=>redirectRole(d.role));
 socket.on("event",d=>log(d.message,d.kind));
 socket.on("notice",d=>{text("feedback",d.message);log(d.message,d.level);});
 socket.on("command-help",list=>{text("commandList",list.join("  "));});
 socket.on("kicked",()=>{alert("The host removed you from the room.");location.href="/";});
}
document.querySelectorAll("[data-command]").forEach(b=>b.onclick=()=>sendCommand(b.dataset.command));
document.querySelectorAll("[data-ability]").forEach(b=>b.onclick=()=>{socket.emit("ability",b.dataset.ability);log("You activated "+b.dataset.ability,"ability");});
if($("commandForm"))$("commandForm").onsubmit=e=>{e.preventDefault();const v=$("commandInput").value.trim();if(v){sendCommand(v);log("> "+v,"command");$("commandInput").value="";}};
if($("copy"))$("copy").onclick=async()=>{const link=location.origin+"/ChairmanJoinCloudflare.html?room="+room;try{await navigator.clipboard.writeText(link);text("copy","COPIED!");}catch{log("Copy blocked by browser. Copy the join link manually.");}};
if($("checkin"))$("checkin").onclick=()=>socket.emit("checkin");
connect();
