const $=id=>document.getElementById(id);
function getKey(){let k=sessionStorage.getItem("hs_key");if(!k){k=crypto.randomUUID();sessionStorage.setItem("hs_key",k);}return k;}
async function create(){
 const name=$("hostName").value.trim()||"Host";
 $("message").textContent="Creating room…";
 try{
  const r=await fetch("/api/create",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
  const d=await r.json();if(!d.code)throw new Error(d.message||"Room creation failed");
  sessionStorage.setItem("hs_name",name);sessionStorage.setItem("hs_room",d.code);
  sessionStorage.setItem("hs_hostToken",d.hostToken);getKey();
  location.href="/host.html?room="+d.code;
 }catch(e){$("message").textContent=e.message;}
}
function join(){
 const name=$("playerName").value.trim()||"Player",code=$("roomCode").value.trim().toUpperCase();
 if(!/^[A-Z0-9]{6}$/.test(code)){$("message").textContent="Enter a valid six-character room code.";return;}
 sessionStorage.setItem("hs_name",name);sessionStorage.setItem("hs_room",code);sessionStorage.removeItem("hs_hostToken");getKey();
 location.href="/player.html?room="+code;
}
$("create").onclick=create;$("join").onclick=join;
