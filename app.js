const STORE="happy-party-solo-clean-v1";
const VALID_RESULTS=new Set(Object.keys(ENDINGS));
const VALID_GENDERS=new Set(["male","female"]);
const TAG_CATALOG=new Map([...STATUS_TAGS,...VIBE_TAGS,...BOUNDARY_TAGS].map(tag=>[tag.id,tag]));
const KNOWN_AVATARS=new Set(Object.values(AVATAR_SHEETS).flat());
const AVATAR_CLASS_BY_PATH=new Map(Object.entries(AVATAR_SHEETS).flatMap(([gender,paths])=>paths.map((path,index)=>[path,`sheet-${gender}-${index+1}`])));
let game=null;
let interactionLocked=false;
let storageWarningShown=false;

const $=id=>document.getElementById(id);
const clamp=value=>Math.max(0,Math.min(100,Number(value)||0));
const safeText=(value,length=120)=>typeof value==="string"?value.slice(0,length):"";
const escapeHTML=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]);
const findProfile=id=>PARTY_PEOPLE.find(person=>person.id===id)||null;
const genderLabel=gender=>gender==="female"?"女":"男";
const signed=value=>`${value>=0?"+":""}${value}`;

document.addEventListener("DOMContentLoaded",()=>{
  $("start-btn").onclick=startNewGame;
  $("new-game-btn").onclick=prepareNewGame;
  $("probe-btn").onclick=probe;
  $("test-btn").onclick=testPartner;
  $("hospital-btn").onclick=visitHospital;
  $("continue-btn").onclick=continueGame;
  $("restart-btn").onclick=restartSameSetup;
  if(!globalThis.SoloEngine){
    $("load-error").classList.remove("hidden");
    $("start-btn").textContent="重新整理";
    $("start-btn").onclick=()=>window.location.reload();
    return;
  }
  game=loadGame();
  configureIntro();
});

function startNewGame(){
  if(interactionLocked)return;
  game=SoloEngine.createGame($("player-gender").value,$("partner-gender").value);
  SoloEngine.drawPartner(game);
  saveGame();
  hideFeedback();
  renderRound();
}

function restartSameSetup(){
  if(interactionLocked)return;
  const playerGender=game?.playerGender||"female";
  const partnerGender=game?.partnerGender||"male";
  clearGame();
  game=SoloEngine.createGame(playerGender,partnerGender);
  SoloEngine.drawPartner(game);
  saveGame();
  renderRound();
}

function prepareNewGame(){
  if(interactionLocked)return;
  if(game&&typeof window.confirm==="function"&&!window.confirm("放棄目前進度，開新局？"))return;
  clearGame();
  game=null;
  $("player-gender").disabled=false;
  $("partner-gender").disabled=false;
  $("resume-note").classList.add("hidden");
  $("new-game-btn").classList.add("hidden");
  $("start-btn").textContent="開始";
  $("start-btn").onclick=startNewGame;
  hideFeedback();
  showScreen("intro-screen");
}

function configureIntro(){
  if(!game)return;
  $("player-gender").value=game.playerGender;
  $("partner-gender").value=game.partnerGender;
  $("player-gender").disabled=true;
  $("partner-gender").disabled=true;
  $("resume-note").textContent=game.result?"上一局已完成。":"進度已保存。";
  $("resume-note").classList.remove("hidden");
  $("new-game-btn").classList.remove("hidden");
  $("start-btn").textContent=game.result?"查看復盤":"繼續";
  $("start-btn").onclick=resumeGame;
}

function resumeGame(){
  if(!game)return;
  if(game.result)return renderFinale();
  if(game.phase==="feedback"){
    renderStats();
    if(game.currentPartner){
      renderTools();
      renderPartner();
      renderActions();
    }
    showScreen("round-screen");
    showFeedback();
    return;
  }
  renderRound();
}

function renderRound(){
  if(!game)return showScreen("intro-screen");
  if(game.result)return renderFinale();
  if(game.phase==="feedback")return resumeGame();
  if(!game.currentPartner)SoloEngine.drawPartner(game);
  saveGame();
  $("round-title").textContent=`第 ${game.turn} 晚`;
  renderStats();
  renderTools();
  renderPartner();
  renderActions();
  showScreen("round-screen");
  unlockSoon();
}

function renderStats(){
  $("heat-value").textContent=`${game.heat}%`;
  $("heat-meter").value=game.heat;
  $("heat-meter").textContent=`${game.heat}%`;
  $("heat-meter").setAttribute("aria-valuenow",String(game.heat));
  $("anxiety-value").textContent=`${game.anxiety}%`;
  $("anxiety-meter").value=game.anxiety;
  $("anxiety-meter").textContent=`${game.anxiety}%`;
  $("anxiety-meter").setAttribute("aria-valuenow",String(game.anxiety));
  $("panic-note").classList.toggle("hidden",game.anxiety<80);
}

function renderTools(){
  const partner=game.currentPartner;
  $("test-count").textContent=`x${game.testkits}`;
  $("test-btn").disabled=!partner||game.testkits<1||partner.tested;
  $("hospital-btn").disabled=false;
}

function renderPartner(){
  const partner=game.currentPartner;
  if(!partner)return;
  $("partner-avatar").innerHTML=avatarMarkup(partner);
  $("partner-name").textContent=partner.name;
  $("partner-flirt").textContent=`「${partner.flirt}」`;
  $("partner-tags").innerHTML=partner.tags.map((tag,index)=>renderTag(tag,index)).join("");
  const hidden=SoloEngine.hiddenTags(partner);
  if(partner.tested){
    $("probe-result").textContent=partner.infected?"試紙：異常":"試紙：未見異常";
  }else if(partner.probed){
    $("probe-result").textContent="隱藏標籤已翻開。";
  }else{
    $("probe-result").textContent=hidden.length?"還有一個標籤沒翻開。":"標籤已全部翻開。";
  }
  $("probe-btn").disabled=partner.probed||partner.tested||hidden.length===0;
  const probePressure=SoloEngine.pressureDelta(game.anxiety,0);
  $("probe-btn").textContent=$("probe-btn").disabled?"💬 已經問完":`💬 刺探 · 壓抑 +3${probePressure?` · 壓力 ${signed(probePressure)}`:""}`;
}

function renderTag(tag,index){
  if(!tag.revealed)return'<span class="tag tag-hidden">❓ 隱藏標籤</span>';
  if(game.anxiety>=80&&tag.tone!=="boundary"&&index%2===1)return'<span class="tag tag-fog" aria-label="模糊標籤">██████</span>';
  const className=tag.tone==="risk"?"tag-risk":tag.tone==="safe"?"tag-safe":tag.tone==="boundary"?"tag-boundary":"";
  return`<span class="tag ${className}">${escapeHTML(tag.label)}</span>`;
}

function renderActions(){
  const locks=SoloEngine.getActionLocks(game.currentPartner);
  $("action-buttons").innerHTML=Object.entries(ACTIONS).map(([key,action])=>{
    const lock=locks[key];
    const classes=["action-btn",key.includes("raw")?"raw":"",key==="refuse"?"refuse":""].filter(Boolean).join(" ");
    const pressure=SoloEngine.pressureDelta(game.anxiety,action.anxiety);
    const cost=`壓抑 ${signed(action.heat)}${pressure?` · 壓力 ${signed(pressure)}`:""}`;
    return`<button type="button" class="${classes}" data-action="${key}"${lock?' aria-disabled="true"':''}><strong>${escapeHTML(action.label)}</strong><small>${escapeHTML(lock||cost)}</small></button>`;
  }).join("");
  document.querySelectorAll("[data-action]").forEach(button=>{
    button.onclick=()=>takeAction(button.dataset.action);
  });
}

function probe(){
  if(!lockInteraction())return;
  const result=SoloEngine.probe(game);
  if(!result.ok){unlockSoon();return;}
  saveGame();
  if(result.result)return renderFinale();
  renderStats();
  renderPartner();
  renderActions();
  showFeedback();
}

function testPartner(){
  if(!lockInteraction())return;
  const result=SoloEngine.testPartner(game);
  if(!result.ok){unlockSoon();return;}
  saveGame();
  renderTools();
  renderPartner();
  renderActions();
  toast(result.infected?"試紙：異常":"試紙：未見異常");
  unlockSoon();
}

function visitHospital(){
  if(!lockInteraction())return;
  const result=SoloEngine.hospital(game);
  saveGame();
  if(result.result)return renderFinale();
  renderStats();
  showFeedback();
}

function takeAction(key){
  if(!lockInteraction())return;
  const result=SoloEngine.takeAction(game,key);
  if(!result.ok){
    toast(result.reason||"這個選項目前不能用");
    unlockSoon();
    return;
  }
  saveGame();
  if(result.result)return renderFinale();
  renderStats();
  showFeedback();
}

function showFeedback(){
  const feedback=game.feedback;
  if(!feedback)return;
  const last=game.history[game.history.length-1];
  $("feedback-turn").textContent=String(last?.turn||Math.max(1,game.turn-1));
  $("feedback-title").textContent=feedback.title;
  $("feedback-body").textContent=feedback.body;
  $("feedback-delta").textContent=feedback.delta;
  $("feedback-overlay").classList.remove("hidden");
  $("main-content").inert=true;
  document.body.classList.add("modal-open");
  $("continue-btn").focus();
  unlockSoon();
}

function continueGame(){
  if(!lockInteraction())return;
  if(!SoloEngine.continueAfterFeedback(game)){unlockSoon();return;}
  hideFeedback();
  if(!game.currentPartner)SoloEngine.drawPartner(game);
  saveGame();
  renderRound();
}

function hideFeedback(){
  $("feedback-overlay")?.classList.add("hidden");
  if($("main-content"))$("main-content").inert=false;
  document.body.classList.remove("modal-open");
}

function renderFinale(){
  if(!game?.result)return;
  hideFeedback();
  const ending=ENDINGS[game.result];
  $("finale-status").textContent=ending.label;
  $("finale-heading").textContent=ending.title;
  $("finale-body").textContent=ending.body;
  $("finale-image").src=ending.image;
  $("finale-image").srcset=ending.imageSrcSet;
  $("finale-image").sizes="(max-width: 620px) calc(100vw - 52px), 900px";
  $("finale-image").alt=ending.title;
  const nightCount=game.history.filter(item=>item.type!=="test").length;
  const partnerTurns=new Set(game.history.map(item=>item.profileId).filter(Boolean)).size;
  const probeCount=game.history.filter(item=>item.type==="probe").length;
  const hospitalCount=game.history.filter(item=>item.type==="hospital").length;
  const testCount=game.history.filter(item=>item.type==="test").length;
  $("replay-overview").innerHTML=[
    `經過 ${nightCount} 晚`,
    `遇見 ${partnerTurns} 人`,
    `刺探 ${probeCount} 次`,
    `醫院 ${hospitalCount} 次`,
    `試紙 ${testCount?`${testCount} 次`:"未使用"}`,
    `${genderLabel(game.playerGender)} · 遇見${genderLabel(game.partnerGender)}`
  ].map(text=>`<span>${escapeHTML(text)}</span>`).join("");
  $("replay-list").innerHTML=game.history.map(renderReplayItem).join("");
  saveGame();
  showScreen("awards-screen");
  unlockSoon();
}

function renderReplayItem(item){
  if(item.type==="hospital"){
    const positive=item.checkResult==="positive";
    return`<article class="replay-item"><span class="replay-icon" aria-hidden="true">🏥</span><div><strong>第 ${item.turn} 晚 · 去醫院</strong><p class="${positive?"truth-risk":"truth-safe"}">結果：${positive?"感染":"未見感染"} · 壓抑 ${item.heat}% · 壓力 ${item.anxiety}%</p></div></article>`;
  }
  const partner=item.partner;
  if(!partner)return"";
  if(item.type==="test"){
    const positive=item.checkResult==="positive";
    return`<article class="replay-item">${avatarMarkup(partner,"replay-avatar")}<div><strong>第 ${item.turn} 晚 · ${escapeHTML(partner.name)} · 對方試紙</strong><p class="${positive?"truth-risk":"truth-safe"}">結果：${positive?"異常":"未見異常"} · 不經過一晚</p></div></article>`;
  }
  const truth=partner.infected?"底牌：感染":"底牌：未見感染";
  const triggered=item.transmission?" · 這一晚觸發":"";
  const tags=partner.tags.map(tag=>`<span>${escapeHTML(tag.label)}</span>`).join("");
  return`<article class="replay-item">${avatarMarkup(partner,"replay-avatar")}<div><strong>第 ${item.turn} 晚 · ${escapeHTML(partner.name)} · ${escapeHTML(item.actionLabel)}</strong><p>壓抑 ${item.heat}% · 壓力 ${item.anxiety}%</p><p class="${partner.infected?"truth-risk":"truth-safe"}">${truth}${triggered}</p><div class="replay-tags">${tags}</div></div></article>`;
}

function avatarMarkup(person,className=""){
  if(!person||!KNOWN_AVATARS.has(person.avatar))return'<span class="replay-icon" aria-hidden="true">👤</span>';
  const x=Number.isInteger(Number(person.x))&&Number(person.x)>=0&&Number(person.x)<=4?Number(person.x):0;
  const y=Number.isInteger(Number(person.y))&&Number(person.y)>=0&&Number(person.y)<=4?Number(person.y):0;
  const sheetClass=AVATAR_CLASS_BY_PATH.get(person.avatar);
  return`<span class="avatar-sprite ${sheetClass} sprite-x-${x} sprite-y-${y} ${className}" aria-hidden="true"></span>`;
}

function showScreen(id){
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.add("hidden"));
  const target=$(id);
  target.classList.remove("hidden");
  document.body.classList.toggle("gameplay-active",id!=="intro-screen");
  window.scrollTo({top:0,behavior:"auto"});
  const heading=target.querySelector("h2");
  if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
}

function lockInteraction(){
  if(interactionLocked||!game||game.result)return false;
  interactionLocked=true;
  return true;
}

function unlockSoon(){
  const release=()=>{interactionLocked=false};
  if(typeof window.requestAnimationFrame==="function")window.requestAnimationFrame(release);
  else setTimeout(release,0);
}

function toast(message){
  $("toast").textContent=message;
  $("toast").classList.remove("hidden");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>$("toast").classList.add("hidden"),2200);
}

function saveGame(){
  if(!game)return;
  const payload=JSON.stringify({savedAt:Date.now(),game});
  const local=accessStorage("localStorage");
  if(writeStorage(local,payload)){
    const session=accessStorage("sessionStorage");
    try{session?.removeItem(STORE);}catch{}
    return;
  }
  if(writeStorage(accessStorage("sessionStorage"),payload))return;
  if(!storageWarningShown){
    storageWarningShown=true;
    toast("這個瀏覽器無法保存進度");
  }
}

function loadGame(){
  const candidates=[];
  for(const name of ["localStorage","sessionStorage"]){
    const storage=accessStorage(name);
    if(!storage)continue;
    try{
      const raw=storage.getItem(STORE);
      if(!raw)continue;
      const parsed=JSON.parse(raw);
      const wrapped=parsed&&typeof parsed==="object"&&parsed.game?parsed:null;
      const normalized=normalizeGame(wrapped?wrapped.game:parsed);
      if(normalized){candidates.push({game:normalized,savedAt:Number(wrapped?.savedAt)||0});continue;}
      storage.removeItem(STORE);
    }catch{
      try{storage.removeItem(STORE);}catch{}
    }
  }
  candidates.sort((a,b)=>b.savedAt-a.savedAt);
  return candidates[0]?.game||null;
}

function clearGame(){
  for(const name of ["localStorage","sessionStorage"]){
    const storage=accessStorage(name);
    try{storage.removeItem(STORE);}catch{}
  }
}

function accessStorage(name){
  try{return window[name]||null;}catch{return null;}
}

function writeStorage(storage,payload){
  if(!storage)return false;
  try{storage.setItem(STORE,payload);return true;}catch{return false;}
}

function normalizeGame(raw){
  if(!raw||raw.schemaVersion!==1||!VALID_GENDERS.has(raw.playerGender)||!VALID_GENDERS.has(raw.partnerGender))return null;
  const restored=SoloEngine.createGame(raw.playerGender,raw.partnerGender);
  restored.turn=Number.isSafeInteger(raw.turn)&&raw.turn>=1?raw.turn:1;
  restored.heat=clamp(raw.heat);
  restored.anxiety=clamp(raw.anxiety);
  restored.testkits=raw.testkits===0?0:1;
  restored.history=Array.isArray(raw.history)?raw.history.slice(-1000).map(normalizeHistoryEntry).filter(Boolean):[];
  restored.infected=raw.infected===true||restored.history.some(item=>item.transmission);
  restored.result=VALID_RESULTS.has(raw.result)?raw.result:null;
  restored.phase=restored.result?"finale":raw.phase==="feedback"?"feedback":"turn";
  restored.feedback=restored.phase==="feedback"?normalizeFeedback(raw.feedback):null;
  restored.currentPartner=restored.result?null:normalizePartner(raw.currentPartner,restored.turn);
  if(restored.phase==="feedback"&&!restored.feedback)restored.phase="turn";
  return restored;
}

function normalizePartner(raw,turn){
  const profile=findProfile(raw?.profileId);
  if(!profile)return null;
  const tags=normalizeTags(raw.tags);
  if(tags.length<3||tags.length>4||tags.filter(tag=>!tag.revealed).length>1)return null;
  return{
    profileId:profile.id,
    name:profile.name,
    gender:profile.gender,
    avatar:profile.image,
    x:profile.x,
    y:profile.y,
    flirt:FLIRT_LINES.includes(raw.flirt)?raw.flirt:FLIRT_LINES[0],
    tags,
    infected:raw.infected===true,
    partnerRisk:Math.max(GAME_CONFIG.minPartnerRisk,Math.min(GAME_CONFIG.maxPartnerRisk,Number(raw.partnerRisk)||GAME_CONFIG.basePartnerRisk)),
    tested:raw.tested===true,
    probed:raw.probed===true,
    turn
  };
}

function normalizeTags(rawTags){
  if(!Array.isArray(rawTags))return[];
  const seen=new Set();
  return rawTags.map(raw=>{
    const canonical=TAG_CATALOG.get(raw?.id);
    if(!canonical||seen.has(canonical.id))return null;
    seen.add(canonical.id);
    return{...canonical,revealed:raw.revealed!==false};
  }).filter(Boolean);
}

function normalizeHistoryEntry(raw){
  if(!raw||!["probe","action","hospital","test"].includes(raw.type))return null;
  const turn=Number(raw.turn);
  if(!Number.isSafeInteger(turn)||turn<1)return null;
  const partner=raw.type==="hospital"?null:normalizePartner(raw.partner,turn);
  if(raw.type!=="hospital"&&!partner)return null;
  const actionKey=safeText(raw.actionKey,30);
  const actionLabel=raw.type==="hospital"?"去醫院":raw.type==="probe"?"刺探":raw.type==="test"?"對方試紙":ACTIONS[actionKey]?.short;
  if(!actionLabel)return null;
  const checkResult=["positive","negative"].includes(raw.checkResult)?raw.checkResult:null;
  return{type:raw.type,turn,profileId:partner?.profileId||null,partner,actionKey,actionLabel,heat:clamp(raw.heat),anxiety:clamp(raw.anxiety),checkResult,transmission:raw.transmission===true};
}

function normalizeFeedback(raw){
  if(!raw||typeof raw!=="object")return null;
  const title=safeText(raw.title,60),body=safeText(raw.body,160),delta=safeText(raw.delta,80);
  if(!title||!body||!delta)return null;
  return{title,body,delta,keepPartner:raw.keepPartner===true};
}

globalThis.SoloApp={normalizeGame,renderReplayItem,avatarMarkup};
