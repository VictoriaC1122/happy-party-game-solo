const STORE="happy-party-solo-v4";
let game;
const $=id=>document.getElementById(id);
const pick=items=>items[Math.floor(Math.random()*items.length)];
const sample=(items,count)=>{const copy=[...items];for(let i=copy.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[copy[i],copy[j]]=[copy[j],copy[i]]}return copy.slice(0,count)};
const clamp=value=>Math.max(0,Math.min(100,value));

document.addEventListener("DOMContentLoaded",()=>{
  $("consent-checkbox").onchange=event=>{$("start-btn").disabled=!event.target.checked};
  $("start-btn").onclick=start;$("chat-btn").onclick=chat;$("test-btn").onclick=test;$("hospital-btn").onclick=hospital;$("next-btn").onclick=next;$("restart-btn").onclick=start;
  try{game=JSON.parse(localStorage.getItem(STORE))}catch{}
  if(game?.ended){$("consent-checkbox").checked=true;$("start-btn").disabled=false;$("start-btn").textContent="查看上一趟復盤";$("start-btn").onclick=finale}
  else if(game&&game.round<GAME_CONFIG.roundCount){$("consent-checkbox").checked=true;$("start-btn").disabled=false;$("start-btn").textContent="繼續上一桌";$("start-btn").onclick=renderRound}
});

function start(){game={round:0,score:0,anxiety:0,heat:50,testkits:1,hospitals:1,infected:false,playerGender:$("player-gender").value,partnerGender:$("partner-gender").value,log:[]};save();renderRound()}
function save(){localStorage.setItem(STORE,JSON.stringify(game))}
function show(id){document.querySelectorAll(".screen").forEach(screen=>screen.classList.add("hidden"));$(id).classList.remove("hidden");document.body.classList.toggle("gameplay-active",id==="round-screen"||id==="summary-screen");window.scrollTo({top:0,behavior:"auto"})}
function partner(){
  const pool=PARTY_PEOPLE.filter(person=>person.gender===(game.partnerGender||"male")),person=pick(pool);
  return{
    profileId:person.id,avatar:person.image,x:person.x,y:person.y,name:person.name,gender:person.gender,
    flirt:pick(FLIRT_LINES),tags:sample(TAG_POOL,3),infected:person.infected,storyTitle:person.title,
    story:person.story,healthStory:person.healthStory,infectionSource:person.infectionSource,chat:false,tested:false
  };
}
function avatarMarkup(person,className=""){const label=person.gender==="male"?"動漫男性角色":"動漫女性角色";return "<span class=\"avatar-sprite "+className+"\" role=\"img\" aria-label=\""+label+"\" style=\"--sheet:url('"+person.avatar+"');--x:"+person.x+";--y:"+person.y+"\"></span>"}

function renderRound(){
  if(game.ended||game.round>=GAME_CONFIG.roundCount)return finale();
  game.partner=partner();
  $("round-title").textContent="第 "+(game.round+1)+" 晚 / "+GAME_CONFIG.roundCount;
  $("partner-avatar").innerHTML=game.anxiety>=80?"？":avatarMarkup(game.partner);
  $("partner-name").textContent=game.anxiety>=80?"看不清楚":game.partner.name;
  $("partner-flirt").textContent=game.anxiety>=80?"「壓力讓所有資訊都糊成一團。」":"「"+game.partner.flirt+"」";
  renderStats();renderTags();
  $("chat-btn").disabled=game.anxiety>=80||game.partner.chat;
  $("test-btn").disabled=game.testkits<1||game.anxiety>=80||game.partner.tested;
  $("hospital-btn").disabled=game.hospitals<1;
  renderActions();show("round-screen");
}
function renderStats(){
  $("dissatisfaction-value").textContent=game.heat+"%";$("dissatisfaction-bar").style.width=game.heat+"%";
  $("anxiety-value").textContent=game.anxiety+"%";$("anxiety-bar").style.width=game.anxiety+"%";
  $("score-value").textContent=game.score;$("testkit-value").textContent="試紙 "+game.testkits+" · 醫院 "+game.hospitals;
  $("warning").textContent=game.anxiety>=80?"心理壓力很高：人物與線索開始模糊。壓力到 100% 會直接結束。":"高風險後不會立刻知道是否感染；只有醫院檢查或第 10 晚才會揭曉。";
  $("warning").classList.toggle("hidden",game.anxiety<60);
}
function renderTags(){
  if(game.anxiety>=80){$("partner-tags").innerHTML="<span class=\"tag hidden-tag\">線索被心理壓力遮住</span>";return}
  const visibleCount=game.partner.chat?3:2;
  let tags=game.partner.tags.map((tag,index)=>index<visibleCount?"<span class=\"tag safe\">"+tag.text+"</span>":"<span class=\"tag hidden-tag\">再聊聊也許能知道更多</span>").join("");
  if(game.partner.tested)tags+=game.partner.infected?"<span class=\"tag risk\">🧪 試紙異常：今晚先停下</span>":"<span class=\"tag safe\">🧪 試紙未見異常</span>";
  $("partner-tags").innerHTML=tags;
}
function renderActions(){
  $("action-buttons").innerHTML=Object.entries(ACTIONS).filter(([key])=>key!=="hospital").map(([key,action])=>"<button class=\"action-btn "+(key.includes("raw")?"raw":"")+"\" data-action=\""+key+"\"><strong>"+action.label+"</strong><small>"+action.copy+"</small></button>").join("");
  document.querySelectorAll("[data-action]").forEach(button=>button.onclick=()=>resolve(button.dataset.action));
}

function chat(){game.partner.chat=true;game.heat=clamp(game.heat+GAME_CONFIG.chatHeat);renderStats();renderTags();$("chat-btn").disabled=true;toast("多知道了一點，但壓抑值也往上走。")}
function test(){game.testkits--;game.partner.tested=true;renderStats();renderTags();$("test-btn").disabled=true;toast(game.partner.infected?"試紙亮起異常；這是提醒你停下、換人。":"試紙未見異常，但它不是無敵護身符。")}

function hospital(){
  game.hospitals--;game.anxiety=0;game.heat=clamp(game.heat+ACTIONS.hospital.heat);
  const entry=record(ACTIONS.hospital,"醫院檢查",null,false);
  if(game.infected)return end("hospital_positive");
  const chaos=applyChaos(entry);
  if(game.heat>=100)return lossOfControl();
  if(game.anxiety>=100)return end("anxiety");
  save();
  showSummary(entry,"檢查結果：目前未檢出異常","心理壓力已清空；代價是壓抑值上升，今晚也就此結束。"+(chaos?" "+chaos.title+"："+chaos.text:""),"去醫院","壓抑值 +20 · 壓力歸零",chaos);
}
function resolve(key){
  const action=ACTIONS[key],currentPartner=game.partner;
  let copy=action.copy,transmission=false;
  if(key==="refuse")copy="你選擇先離開。今晚不必把每個邀請都答應。";
  else if(currentPartner.infected&&Math.random()<action.risk/100){game.infected=true;transmission=true}
  game.heat=clamp(game.heat+action.heat);game.anxiety=clamp(game.anxiety+action.anxiety);
  const entry=record(action,currentPartner.name,currentPartner,transmission);
  const chaos=applyChaos(entry);
  if(game.heat>=100)return lossOfControl();
  if(game.anxiety>=100)return end("anxiety");
  save();
  const body=key==="refuse"?copy:(action.risk>=20?"高風險不會立刻揭曉結果。你只能帶著疑慮，繼續把這一晚走完。":copy);
  showSummary(entry,chaos?chaos.title:"這一晚先記下了",body+(chaos?" "+chaos.text:""),action.short,(action.score>=0?"+":"")+action.score+" 生存分 · 壓力 "+(action.anxiety>=0?"+":"")+action.anxiety,chaos);
}
function record(action,name,currentPartner,transmission){
  game.score+=action.score;
  const entry={
    round:game.round+1,name,avatar:currentPartner?.avatar,gender:currentPartner?.gender,x:currentPartner?.x,y:currentPartner?.y,
    profileId:currentPartner?.profileId,storyTitle:currentPartner?.storyTitle,story:currentPartner?.story,
    healthStory:currentPartner?.healthStory,infectionSource:currentPartner?.infectionSource,
    partnerInfected:currentPartner?.infected,action:action.short,heat:game.heat,anxiety:game.anxiety,risk:action.risk,transmission
  };
  game.log.push(entry);game.round++;return entry;
}
function applyChaos(entry){
  if(Math.random()>=CHAOS_EVENT_CHANCE)return null;
  const event=pick(CHAOS_EVENTS);
  game.heat=clamp(game.heat+event.heat);game.anxiety=clamp(game.anxiety+event.anxiety);
  if(event.loseTest)game.testkits=0;
  if(event.skip&&game.round<GAME_CONFIG.roundCount)game.round++;
  entry.event=event;entry.heat=game.heat;entry.anxiety=game.anxiety;
  return event;
}
function showSummary(entry,heading,body,scoreTitle,scoreCopy,chaos){
  $("summary-title").textContent="第 "+entry.round+" 晚翻牌";$("summary-heading").textContent=heading;$("summary-body").textContent=body;$("summary-extra").innerHTML=summaryMeta();
  const chaosCard=chaos?"<div><strong>🎲 "+chaos.title+"</strong><span>壓抑 "+(chaos.heat>=0?"+":"")+chaos.heat+" · 壓力 "+(chaos.anxiety>=0?"+":"")+chaos.anxiety+(chaos.skip?" · 少一晚":"")+(chaos.loseTest?" · 試紙失效":"")+"</span></div>":"";
  $("scoreboard").innerHTML="<div><strong>"+scoreTitle+"</strong><span>"+scoreCopy+"</span></div>"+chaosCard;
  $("next-btn").textContent=game.round>=GAME_CONFIG.roundCount?"最終結算":"下一晚，走起";show("summary-screen");
}
function lossOfControl(){
  const forced=pick([ACTIONS.oral_raw,ACTIONS.sex_raw]),entry=game.log.at(-1),exposure=Boolean(game.partner?.infected)&&Math.random()<forced.risk/100;
  if(exposure)game.infected=true;
  game.anxiety=clamp(game.anxiety+forced.anxiety);entry.action+=" → 失控追加："+forced.short;entry.risk=forced.risk;entry.transmission=entry.transmission||exposure;entry.heat=game.heat;entry.anxiety=game.anxiety;end("urge");
}
function summaryMeta(){return"<span>壓抑 "+game.heat+"%</span><span>壓力 "+game.anxiety+"%</span><span>生存分 "+game.score+"</span>"}
function next(){game.round>=GAME_CONFIG.roundCount?finale():renderRound()}
function end(key){game.ended=true;game.result=key;save();finale()}
function endingKey(){if(game.result)return game.result;if(game.infected)return"final_positive";if(game.heat===0)return"victory";return"unfinished"}
function finale(){
  const key=endingKey(),ending=ENDINGS[key],exposures=game.log.filter(item=>item.transmission),riskCount=game.log.filter(item=>item.risk>=20).length,chaosCount=game.log.filter(item=>item.event).length;
  const unlockedStories=new Set(game.log.map(item=>(item.profileId||findPartyProfile(item)?.id)).filter(Boolean)).size;
  $("finale-heading").textContent=ending.title;$("finale-body").textContent=ending.body;$("finale-image").src=ending.image;$("finale-image").alt=ending.title;$("finale-status").textContent=ending.label;
  const delayed=exposures.length?"<span class=\"risk-result\">延遲判決觸發：第 "+exposures.map(item=>item.round).join("、")+" 晚</span>":"<span>延遲判決：未觸發</span>";
  $("replay-overview").innerHTML="<span>結局："+ending.label+"</span><span>走過晚數："+game.round+" / "+GAME_CONFIG.roundCount+"</span><span>解鎖故事："+unlockedStories+" 位</span><span>突發事件："+chaosCount+"</span><span>高風險選擇："+riskCount+"</span><span>最終壓抑："+game.heat+"%</span><span>最終壓力："+game.anxiety+"%</span>"+delayed;
  $("replay-list").innerHTML=game.log.map(item=>{
    const portrait=item.avatar?avatarMarkup(item,"replay-avatar"):"<span class='replay-icon'>🏥</span>";
    const risk=item.risk?" · 風險 "+item.risk+"%":"";
    const chaos=item.event?" · 突發："+item.event.title+(item.event.skip?"（少一晚）":"")+(item.event.loseTest?"（試紙失效）":""):"";
    const result=item.transmission?" · 最終揭曉：這一晚觸發感染":"";
    const profile=item.story?item:findPartyProfile(item),profileInfected=Boolean(profile?.infected??profile?.partnerInfected);
    const story=profile?.story
      ?"<details class=\"story-unlock\"><summary>🔓 解鎖人物故事 · "+(profile.storyTitle||profile.title)+"</summary><div class=\"story-unlock-body\"><p>"+profile.story+"</p><p class=\"story-health"+(profileInfected?" story-risk":"")+"\"><b>"+(profileInfected?"虛構感染來源｜":"健康背景｜")+"</b>"+(profileInfected?profile.infectionSource:profile.healthStory)+"</p><small>所有角色均為虛構成年人；健康資訊僅為遊戲設定，感染不代表任何人的價值或道德。</small></div></details>"
      :"";
    return "<article class=\"replay-item\">"+portrait+"<div><strong>第 "+item.round+" 晚 · "+item.name+" · "+item.action+"</strong><p>壓抑 "+item.heat+"% · 壓力 "+item.anxiety+"%"+risk+chaos+result+"</p>"+story+"</div></article>";
  }).join("");
  game.ended=true;save();show("awards-screen");
}
function toast(text){$("toast").textContent=text;$("toast").classList.remove("hidden");clearTimeout(toast.t);toast.t=setTimeout(()=>$("toast").classList.add("hidden"),3000)}
