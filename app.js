const STORE="happy-party-solo-v4";
const GAME_SCHEMA_VERSION=5;
const VALID_GENDERS=new Set(["male","female"]);
const VALID_RESULTS=new Set(Object.keys(ENDINGS));
const KNOWN_AVATARS=new Set(Object.values(AVATAR_SHEETS).reduce((all,sheets)=>all.concat(sheets),[]));
const PASSIVE_ACTIONS={chatOverload:{short:"聊天後壓抑失控",score:0,risk:0}};
let game;
let interactionLocked=false;
let storageNoticeShown=false;
const $=id=>document.getElementById(id);
const pick=items=>items[Math.floor(Math.random()*items.length)];
const sample=(items,count)=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy.slice(0,count)};
const clamp=value=>Math.max(0,Math.min(100,value));
const safeInteger=(value,min,max,fallback)=>{const number=Number(value);return Number.isInteger(number)&&number>=min&&number<=max?number:fallback};
const safePercent=(value,fallback=0)=>{const number=Number(value);return Number.isFinite(number)?clamp(number):fallback};
const isSpriteCoordinate=value=>Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=4;
const isKnownAvatar=value=>typeof value==="string"&&KNOWN_AVATARS.has(value);
const safeText=(value,maxLength=220)=>typeof value==="string"?value.slice(0,maxLength):"";
const escapeHTML=value=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[character]);
const genderLabel=gender=>gender==="female"?"女":"男";

document.addEventListener("DOMContentLoaded",()=>{
  $("toast").setAttribute("role","status");
  $("toast").setAttribute("aria-live","polite");
  $("warning").setAttribute("role","status");
  $("warning").setAttribute("aria-live","polite");
  $("consent-checkbox").onchange=event=>{$("start-btn").disabled=!event.target.checked};
  $("start-btn").onclick=start;
  $("chat-btn").onclick=chat;
  $("test-btn").onclick=test;
  $("hospital-btn").onclick=hospital;
  $("next-btn").onclick=next;
  $("restart-btn").onclick=start;
  game=loadGame();
  configureResumeButton();
});

function createGame(){return{schemaVersion:GAME_SCHEMA_VERSION,phase:"round",round:0,score:0,anxiety:0,heat:50,testkits:1,hospitals:1,infected:false,playerGender:$("player-gender").value,partnerGender:$("partner-gender").value,partner:null,log:[],ended:false,result:null}}
function loadGame(){
  for(const key of ["localStorage","sessionStorage"]){
    try{const raw=window[key].getItem(STORE),restored=raw?normalizeGame(JSON.parse(raw)):null;if(restored)return restored}catch{}
  }
  return null;
}
function normalizeGame(raw){
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const restored=createGame();
  restored.round=safeInteger(raw.round,0,GAME_CONFIG.roundCount,0);
  restored.score=safeInteger(raw.score,-999,999,0);
  restored.anxiety=safePercent(raw.anxiety,0);
  restored.heat=safePercent(raw.heat,50);
  restored.testkits=safeInteger(raw.testkits,0,1,1);
  restored.hospitals=safeInteger(raw.hospitals,0,1,1);
  restored.infected=Boolean(raw.infected);
  restored.playerGender=VALID_GENDERS.has(raw.playerGender)?raw.playerGender:"female";
  restored.partnerGender=VALID_GENDERS.has(raw.partnerGender)?raw.partnerGender:"male";
  restored.log=Array.isArray(raw.log)?raw.log.map(normalizeRecord).filter(Boolean).slice(0,GAME_CONFIG.roundCount):[];
  restored.result=VALID_RESULTS.has(raw.result)?raw.result:null;
  restored.ended=Boolean(raw.ended)||Boolean(restored.result);
  restored.phase=raw.phase==="summary"?"summary":"round";
  if(!restored.ended&&restored.phase==="round"&&restored.round<GAME_CONFIG.roundCount)restored.partner=normalizePartner(raw.partner,restored.round+1);
  if(restored.ended||restored.round>=GAME_CONFIG.roundCount)restored.phase="finale";
  return restored;
}
function normalizePartner(raw,expectedRound){
  const profile=findPartyProfile(raw);
  if(!profile||safeInteger(raw?.round,1,GAME_CONFIG.roundCount,0)!==expectedRound)return null;
  const tagTexts=Array.isArray(raw.tags)?raw.tags.map(tag=>safeText(tag?.text,80)).filter(text=>TAG_POOL.some(tag=>tag.text===text)).slice(0,3):[];
  return{profileId:profile.id,avatar:profile.image,x:profile.x,y:profile.y,name:profile.name,gender:profile.gender,flirt:FLIRT_LINES.includes(raw.flirt)?raw.flirt:FLIRT_LINES[0],tags:tagTexts.length===3?tagTexts.map(text=>({text})):TAG_POOL.slice(0,3),infected:profile.infected,chat:Boolean(raw.chat),tested:Boolean(raw.tested),round:expectedRound};
}
function normalizeRecord(raw){
  if(!raw||typeof raw!=="object")return null;
  const round=safeInteger(raw.round,1,GAME_CONFIG.roundCount,0);
  if(!round)return null;
  const profile=findPartyProfile(raw),event=normalizeChaosEvent(raw.event),skipReason=normalizeChaosEvent(raw.skipReason);
  return{kind:raw.kind==="skipped"?"skipped":"encounter",round,name:profile?.name||safeText(raw.name,80)||(raw.kind==="skipped"?"突發快轉":"未記錄對象"),avatar:profile?.image||(isKnownAvatar(raw.avatar)?raw.avatar:""),gender:profile?.gender||(VALID_GENDERS.has(raw.gender)?raw.gender:null),x:profile?.x??(isSpriteCoordinate(raw.x)?Number(raw.x):0),y:profile?.y??(isSpriteCoordinate(raw.y)?Number(raw.y):0),profileId:profile?.id||null,action:safeText(raw.action,110)||(raw.kind==="skipped"?"突發事件略過一晚":"未記錄行動"),heat:safePercent(raw.heat,0),anxiety:safePercent(raw.anxiety,0),risk:safePercent(raw.risk,0),transmission:Boolean(raw.transmission),partnerInfected:profile?.infected??Boolean(raw.partnerInfected),event,skipReason};
}
function normalizeChaosEvent(raw){
  const title=safeText(raw?.title,90),event=CHAOS_EVENTS.find(candidate=>candidate.title===title);
  return event?{...event,appliedSkip:Boolean(raw?.appliedSkip)}:null;
}
function configureResumeButton(){
  if(!game)return;
  const startButton=$("start-btn");
  $("consent-checkbox").checked=true;
  startButton.disabled=false;
  if(game.ended||game.round>=GAME_CONFIG.roundCount){startButton.textContent="查看上一趟復盤";startButton.onclick=finale;return}
  startButton.textContent=game.phase==="summary"?"繼續下一晚":"繼續上一晚";
  startButton.onclick=renderRound;
}
function start(){
  if(interactionLocked)return;
  interactionLocked=true;
  game=createGame();
  save();
  renderRound();
}
function save(){
  if(!game)return false;
  game.schemaVersion=GAME_SCHEMA_VERSION;
  const snapshot=JSON.stringify(game);
  for(const key of ["localStorage","sessionStorage"]){
    try{
      window[key].setItem(STORE,snapshot);
      if(key==="sessionStorage"&&!storageNoticeShown&&$("toast")){storageNoticeShown=true;toast("已改用這個分頁暫存進度；關閉分頁後本局會清除。")}
      return true;
    }catch{}
  }
  if(!storageNoticeShown&&$("toast")){storageNoticeShown=true;toast("這台裝置暫時無法儲存進度；本局仍可繼續玩。")}
  return false;
}
function show(id){
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.add("hidden"));
  const screen=$(id);
  screen.classList.remove("hidden");
  document.body.classList.toggle("gameplay-active",id!=="intro-screen");
  window.scrollTo({top:0,behavior:"auto"});
  const heading=screen.querySelector?.("h2");
  if(heading){heading.tabIndex=-1;try{heading.focus({preventScroll:true})}catch{heading.focus()}}
}
function lastEncounterProfileId(){for(let index=game.log.length-1;index>=0;index--){if(game.log[index].profileId)return game.log[index].profileId}return null}
function partner(){
  const pool=PARTY_PEOPLE.filter(person=>person.gender===game.partnerGender),lastProfileId=lastEncounterProfileId(),candidates=pool.filter(person=>person.id!==lastProfileId),person=pick(candidates.length?candidates:pool);
  return{
    profileId:person.id,avatar:person.image,x:person.x,y:person.y,name:person.name,gender:person.gender,
    flirt:pick(FLIRT_LINES),tags:sample(TAG_POOL,3),infected:person.infected,chat:false,tested:false,round:game.round+1
  };
}
function avatarMarkup(person,className=""){
  const avatar=[person?.avatar,person?.image].find(isKnownAvatar);
  if(!avatar)return"";
  const x=isSpriteCoordinate(person.x)?Number(person.x):0,y=isSpriteCoordinate(person.y)?Number(person.y):0;
  return "<span class=\"avatar-sprite "+className+"\" aria-hidden=\"true\" style=\"--sheet:url('"+avatar+"');--x:"+x+";--y:"+y+"\"></span>";
}

function renderRound(){
  if(!game)return show("intro-screen");
  if(game.ended||game.round>=GAME_CONFIG.roundCount)return finale();
  const expectedRound=game.round+1;
  if(!game.partner||game.partner.round!==expectedRound)game.partner=partner();
  game.phase="round";
  save();
  $("round-title").textContent="第 "+expectedRound+" 晚 / "+GAME_CONFIG.roundCount;
  $("partner-avatar").innerHTML=game.anxiety>=80?"？":avatarMarkup(game.partner);
  $("partner-name").textContent=game.anxiety>=80?"看不清楚":game.partner.name;
  $("partner-flirt").textContent=game.anxiety>=80?"「壓力讓所有資訊都糊成一團。」":"「"+game.partner.flirt+"」";
  renderStats();renderTags();
  renderRoundControls();show("round-screen");unlockInteraction();
}
function renderRoundControls(){
  $("chat-btn").disabled=game.anxiety>=80||game.partner.chat;
  $("test-btn").disabled=game.testkits<1||game.anxiety>=80||game.partner.tested;
  $("hospital-btn").disabled=game.hospitals<1;
  renderActions();
}
function renderStats(){
  $("dissatisfaction-value").textContent=game.heat+"%";$("dissatisfaction-bar").style.width=game.heat+"%";
  const dissatisfactionMeter=$("dissatisfaction-bar").parentElement;
  dissatisfactionMeter.setAttribute("role","progressbar");dissatisfactionMeter.setAttribute("aria-label","欲求不滿值");dissatisfactionMeter.setAttribute("aria-valuemin","0");dissatisfactionMeter.setAttribute("aria-valuemax","100");dissatisfactionMeter.setAttribute("aria-valuenow",game.heat);
  $("anxiety-value").textContent=game.anxiety+"%";$("anxiety-bar").style.width=game.anxiety+"%";
  const anxietyMeter=$("anxiety-bar").parentElement;
  anxietyMeter.setAttribute("role","progressbar");anxietyMeter.setAttribute("aria-label","心理壓力");anxietyMeter.setAttribute("aria-valuemin","0");anxietyMeter.setAttribute("aria-valuemax","100");anxietyMeter.setAttribute("aria-valuenow",game.anxiety);
  $("score-value").textContent=game.score;$("testkit-value").textContent="試紙 "+game.testkits+" · 醫院 "+game.hospitals;
  $("warning").textContent=game.anxiety>=80?"心理壓力很高：人物與線索開始模糊。壓力到 100% 會直接結束。":"高風險後不會立刻知道是否感染；只有醫院檢查或第 10 晚才會揭曉。";
  $("warning").classList.toggle("hidden",game.anxiety<60);
}
function renderTags(){
  if(game.anxiety>=80){$("partner-tags").innerHTML="<span class=\"tag hidden-tag\">線索被心理壓力遮住</span>";return}
  const visibleCount=game.partner.chat?3:2;
  let tags=game.partner.tags.map((tag,index)=>index<visibleCount?"<span class=\"tag safe\">"+escapeHTML(tag.text)+"</span>":"<span class=\"tag hidden-tag\">再聊聊也許能知道更多</span>").join("");
  if(game.partner.tested)tags+=game.partner.infected?"<span class=\"tag risk\">🧪 試紙異常：今晚先停下</span>":"<span class=\"tag safe\">🧪 試紙未見異常</span>";
  $("partner-tags").innerHTML=tags;
}
function renderActions(){
  $("action-buttons").innerHTML=Object.entries(ACTIONS).filter(([key])=>key!=="hospital").map(([key,action])=>"<button class=\"action-btn "+(key.includes("raw")?"raw":"")+"\" data-action=\""+key+"\"><strong>"+escapeHTML(action.label)+"</strong><small>"+escapeHTML(action.copy)+"</small></button>").join("");
  document.querySelectorAll("[data-action]").forEach(button=>button.onclick=()=>resolve(button.dataset.action));
}

function beginRoundInteraction(){
  if(interactionLocked||!game||game.ended||game.phase!=="round"||!game.partner)return false;
  interactionLocked=true;
  document.querySelectorAll("#round-screen button").forEach(button=>button.disabled=true);
  return true;
}
function beginSummaryInteraction(){
  if(interactionLocked||!game||game.ended||game.phase!=="summary")return false;
  interactionLocked=true;
  $("next-btn").disabled=true;
  return true;
}
function unlockInteraction(){
  const release=()=>{interactionLocked=false};
  if(typeof window.requestAnimationFrame==="function")window.requestAnimationFrame(release);
  else setTimeout(release,0);
}
function chat(){
  if(!beginRoundInteraction())return;
  const currentPartner=game.partner;
  currentPartner.chat=true;
  game.heat=clamp(game.heat+GAME_CONFIG.chatHeat);
  if(game.heat>=100){const entry=record(PASSIVE_ACTIONS.chatOverload,currentPartner.name,currentPartner,false);resolveTerminalState(entry,currentPartner);return}
  save();renderStats();renderTags();renderRoundControls();toast("多知道了一點，但壓抑值也往上走。");unlockInteraction();
}
function test(){
  if(!beginRoundInteraction())return;
  game.testkits--;game.partner.tested=true;
  save();renderStats();renderTags();renderRoundControls();toast(game.partner.infected?"試紙亮起異常；這是提醒你停下、換人。":"試紙未見異常，但它不是無敵護身符。");unlockInteraction();
}

function hospital(){
  if(!beginRoundInteraction())return;
  game.hospitals--;game.anxiety=0;game.heat=clamp(game.heat+ACTIONS.hospital.heat);
  const entry=record(ACTIONS.hospital,"醫院檢查",null,false);
  if(game.infected)return end("hospital_positive");
  if(resolveTerminalState(entry,null))return;
  showSummary(entry,"檢查結果：目前未檢出異常","心理壓力已清空；代價是壓抑值上升，今晚也就此結束。","去醫院","壓抑值 +20 · 壓力歸零",null);
}
function resolve(key){
  if(!beginRoundInteraction())return;
  const action=ACTIONS[key],currentPartner=game.partner;
  if(!action||!currentPartner){unlockInteraction();return}
  let copy=action.copy,transmission=false;
  if(key==="refuse")copy="你選擇先離開。今晚不必把每個邀請都答應。";
  else if(currentPartner.infected&&Math.random()<action.risk/100){game.infected=true;transmission=true}
  game.heat=clamp(game.heat+action.heat);game.anxiety=clamp(game.anxiety+action.anxiety);
  const entry=record(action,currentPartner.name,currentPartner,transmission);
  if(resolveTerminalState(entry,currentPartner))return;
  const chaos=applyChaos(entry);
  if(resolveTerminalState(entry,currentPartner))return;
  const body=key==="refuse"?copy:(action.risk>=20?"高風險不會立刻揭曉結果。你只能帶著疑慮，繼續把這一晚走完。":copy);
  showSummary(entry,chaos?chaos.title:"這一晚先記下了",body+(chaos?" "+chaos.text:""),action.short,(action.score>=0?"+":"")+action.score+" 生存分 · 壓力 "+(action.anxiety>=0?"+":"")+action.anxiety,chaos);
}
function resolveTerminalState(entry,currentPartner){
  if(game.heat>=100){lossOfControl(entry,currentPartner);return true}
  if(game.anxiety>=100){end("anxiety");return true}
  return false;
}
function record(action,name,currentPartner,transmission){
  game.score+=Number(action.score)||0;
  const entry={kind:"encounter",round:game.round+1,name:currentPartner?.name||name,avatar:currentPartner?.avatar||"",gender:currentPartner?.gender||null,x:currentPartner?.x,y:currentPartner?.y,profileId:currentPartner?.profileId||null,partnerInfected:Boolean(currentPartner?.infected),action:action.short,heat:game.heat,anxiety:game.anxiety,risk:action.risk||0,transmission,event:null,skipReason:null};
  game.log.push(entry);game.round=Math.min(GAME_CONFIG.roundCount,game.round+1);game.partner=null;game.phase="summary";return entry;
}
function applyChaos(entry){
  if(Math.random()>=CHAOS_EVENT_CHANCE)return null;
  const event={...pick(CHAOS_EVENTS),appliedSkip:false},lostTest=Boolean(event.loseTest&&game.testkits>0);
  if(event.loseTest&&!lostTest)delete event.loseTest;
  game.heat=clamp(game.heat+event.heat);game.anxiety=clamp(game.anxiety+event.anxiety);
  if(lostTest)game.testkits=0;
  const skipped=Boolean(event.skip)&&game.round<GAME_CONFIG.roundCount;
  event.appliedSkip=skipped;
  if(skipped){
    game.round++;
    game.log.push({kind:"skipped",round:game.round,name:"突發快轉",avatar:"",gender:null,x:0,y:0,profileId:null,partnerInfected:false,action:"今晚被突發事件略過",heat:game.heat,anxiety:game.anxiety,risk:0,transmission:false,event:null,skipReason:event});
  }
  entry.event=event;entry.heat=game.heat;entry.anxiety=game.anxiety;
  return event;
}
function showSummary(entry,heading,body,scoreTitle,scoreCopy,chaos){
  game.phase="summary";
  $("summary-title").textContent="第 "+entry.round+" 晚翻牌";$("summary-heading").textContent=heading;$("summary-body").textContent=body;$("summary-extra").innerHTML=summaryMeta();
  const chaosCard=chaos?"<div><strong>🎲 "+escapeHTML(chaos.title)+"</strong><span>壓抑 "+(chaos.heat>=0?"+":"")+chaos.heat+" · 壓力 "+(chaos.anxiety>=0?"+":"")+chaos.anxiety+(chaos.appliedSkip?" · 少一晚":"")+(chaos.loseTest?" · 試紙失效":"")+"</span></div>":"";
  $("scoreboard").innerHTML="<div><strong>"+escapeHTML(scoreTitle)+"</strong><span>"+escapeHTML(scoreCopy)+"</span></div>"+chaosCard;
  $("next-btn").textContent=game.round>=GAME_CONFIG.roundCount?"最終結算":"下一晚，走起";$("next-btn").disabled=false;save();show("summary-screen");unlockInteraction();
}
function lossOfControl(entry,currentPartner){
  const forced=currentPartner?pick([ACTIONS.oral_raw,ACTIONS.sex_raw]):null,targetEntry=entry||game.log[game.log.length-1],exposure=Boolean(currentPartner?.infected)&&forced&&Math.random()<forced.risk/100;
  if(exposure)game.infected=true;
  if(forced)game.anxiety=clamp(game.anxiety+forced.anxiety);
  if(targetEntry){targetEntry.action+=forced?" → 失控追加："+forced.short:" → 壓抑失控，今晚提前結束";targetEntry.risk=forced?.risk||0;targetEntry.transmission=targetEntry.transmission||exposure;targetEntry.heat=game.heat;targetEntry.anxiety=game.anxiety}
  end("urge");
}
function summaryMeta(){return"<span>壓抑 "+game.heat+"%</span><span>壓力 "+game.anxiety+"%</span><span>生存分 "+game.score+"</span>"}
function next(){if(!beginSummaryInteraction())return;game.round>=GAME_CONFIG.roundCount?finale():renderRound()}
function end(key){game.ended=true;game.phase="finale";game.result=key;game.partner=null;save();finale()}
function endingKey(){if(VALID_RESULTS.has(game.result))return game.result;if(game.infected)return"final_positive";if(game.heat===0)return"victory";return"unfinished"}
function finale(){
  if(!game)return show("intro-screen");
  const entries=Array.isArray(game.log)?game.log:[],key=endingKey(),ending=ENDINGS[key],exposures=entries.filter(item=>item.transmission),riskCount=entries.filter(item=>item.risk>=20).length,chaosCount=entries.filter(item=>item.event).length;
  const unlockedStories=new Set(entries.map(item=>item.profileId).filter(Boolean)).size;
  $("finale-heading").textContent=ending.title;$("finale-body").textContent=ending.body;$("finale-image").src=ending.image;$("finale-image").alt=ending.title;$("finale-status").textContent=ending.label;
  const delayed=exposures.length?"<span class=\"risk-result\">延遲判決觸發：第 "+exposures.map(item=>item.round).join("、")+" 晚</span>":"<span>延遲判決：未觸發</span>";
  $("replay-overview").innerHTML="<span>結局："+escapeHTML(ending.label)+"</span><span>走過晚數："+game.round+" / "+GAME_CONFIG.roundCount+"</span><span>解鎖故事："+unlockedStories+" 位</span><span>突發事件："+chaosCount+"</span><span>高風險選擇："+riskCount+"</span><span>設定："+genderLabel(game.playerGender)+" · 遇見"+genderLabel(game.partnerGender)+"</span><span>最終壓抑："+game.heat+"%</span><span>最終壓力："+game.anxiety+"%</span>"+delayed;
  $("replay-list").innerHTML=entries.map(renderReplayItem).join("");
  game.ended=true;game.phase="finale";save();show("awards-screen");unlockInteraction();
}
function renderReplayItem(item){
  const profile=findPartyProfile(item),isSkipped=item.kind==="skipped",portrait=isSkipped?"<span class=\"replay-icon\" aria-hidden=\"true\">🎲</span>":avatarMarkup(profile||item,"replay-avatar")||"<span class=\"replay-icon\" aria-hidden=\"true\">🏥</span>",name=profile?.name||safeText(item.name,80)||"未記錄對象",action=safeText(item.action,110)||"未記錄行動",risk=item.risk?" · 風險 "+item.risk+"%":"",chaos=item.event?" · 突發："+escapeHTML(item.event.title)+(item.event.appliedSkip?"（少一晚）":"")+(item.event.loseTest?"（試紙失效）":""):"",skipped=isSkipped&&item.skipReason?" · 突發快轉："+escapeHTML(item.skipReason.title):"",result=item.transmission?" · 最終揭曉：這一晚觸發感染":"",profileInfected=Boolean(profile?.infected??item.partnerInfected),venue=profile?.venueCameo?"<p class=\"story-venue\"><b>城市夜生活彩蛋｜</b>"+escapeHTML(profile.venueCameo)+"</p>":"",healthText=profile?(profileInfected?profile.infectionSource:profile.healthStory):"",health=healthText?"<p class=\"story-health"+(profileInfected?" story-risk":"")+"\"><b>"+(profileInfected?"虛構感染來源｜":"健康背景｜")+"</b>"+escapeHTML(healthText)+"</p>":"",venueDisclaimer=profile?.venueCameo?" 店名僅為虛構故事背景，與真實事件、健康資訊、合作或背書無關。":"",story=profile?.story?"<details class=\"story-unlock\"><summary>🔓 解鎖人物故事 · "+escapeHTML(profile.title)+"</summary><div class=\"story-unlock-body\"><p>"+escapeHTML(profile.story)+"</p>"+venue+health+"<small>所有角色均為虛構成年人；健康資訊僅為遊戲設定，感染不代表任何人的價值或道德。"+venueDisclaimer+"</small></div></details>":"";
  return"<article class=\"replay-item\">"+portrait+"<div><strong>第 "+item.round+" 晚 · "+escapeHTML(name)+" · "+escapeHTML(action)+"</strong><p>壓抑 "+item.heat+"% · 壓力 "+item.anxiety+"%"+risk+chaos+skipped+result+"</p>"+story+"</div></article>";
}
function toast(text){$("toast").textContent=text;$("toast").classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("toast").classList.add("hidden"),3000)}
