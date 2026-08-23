const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const ROOT=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(ROOT,file),"utf8");

function loadRuntime({withApp=false}={}){
  const context=vm.createContext({
    console,
    Math,
    setTimeout,
    clearTimeout,
    requestAnimationFrame:callback=>callback(),
    globalThis:null
  });
  context.globalThis=context;
  context.window=context;
  context.document={addEventListener(){},getElementById(){return null},querySelectorAll(){return[]}};
  const data=read("data.js")+"\nglobalThis.__DATA={GAME_CONFIG,ACTIONS,ENDINGS,STATUS_TAGS,VIBE_TAGS,BOUNDARY_TAGS,FLIRT_LINES,AVATAR_SHEETS,PARTY_PEOPLE};";
  vm.runInContext(data,context,{filename:"data.js"});
  vm.runInContext(read("engine.js"),context,{filename:"engine.js"});
  if(withApp)vm.runInContext(read("app.js"),context,{filename:"app.js"});
  return context;
}

function lcg(seed=1){
  let state=seed>>>0;
  return()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
}

function fixed(value){return()=>value;}

test("production loads only the clean runtime",()=>{
  const html=read("index.html");
  assert.match(html,/data\.js\?v=clean2/);
  assert.match(html,/engine\.js\?v=clean2/);
  assert.match(html,/app\.js\?v=clean2/);
  for(const removed of ["chaos.js","conversation.js","stories.js","extra-stories.js","polish.css","mobile.css","conversations.css"]){
    assert.doesNotMatch(html,new RegExp(removed.replace(".","\\.")));
  }
  assert.doesNotMatch(html,/consent-checkbox|生存分|突發事件|解鎖故事|聊天歷史/);
});

test("the library keeps 100 men, 100 women, and 200 unique portraits",()=>{
  const {__DATA}=loadRuntime();
  const people=Array.from(__DATA.PARTY_PEOPLE);
  assert.equal(people.length,200);
  assert.equal(people.filter(person=>person.gender==="male").length,100);
  assert.equal(people.filter(person=>person.gender==="female").length,100);
  assert.equal(new Set(people.map(person=>person.id)).size,200);
  assert.equal(new Set(people.map(person=>`${person.gender}|${person.image}|${person.x}|${person.y}`)).size,200);
  assert.ok(people.every(person=>person.name&&person.image&&person.x>=0&&person.x<=4&&person.y>=0&&person.y<=4));
});

test("every generated table has three or four short tags and exactly one hidden clue",()=>{
  const runtime=loadRuntime();
  const {SoloEngine,__DATA}=runtime;
  const random=lcg(91);
  for(const profile of Array.from(__DATA.PARTY_PEOPLE)){
    const partner=SoloEngine.buildPartner(profile,1,random);
    assert.ok(partner.tags.length===3||partner.tags.length===4);
    assert.equal(partner.tags.filter(tag=>!tag.revealed).length,1);
    assert.ok(partner.tags.every(tag=>Array.from(tag.label).length<=14));
    assert.ok(partner.tags.filter(tag=>!tag.revealed).every(tag=>tag.riskDelta!==0));
    assert.ok(partner.tags.filter(tag=>tag.constraint).every(tag=>tag.revealed));
  }
});

test("tag weights really determine the hidden partner-risk value",()=>{
  const {SoloEngine,__DATA}=loadRuntime();
  const random=lcg(7);
  for(let index=0;index<1000;index++){
    const profile=__DATA.PARTY_PEOPLE[index%200];
    const partner=SoloEngine.buildPartner(profile,index+1,random);
    const sum=partner.tags.reduce((total,tag)=>total+(Number(tag.riskDelta)||0),0);
    const expected=Math.max(__DATA.GAME_CONFIG.minPartnerRisk,Math.min(__DATA.GAME_CONFIG.maxPartnerRisk,__DATA.GAME_CONFIG.basePartnerRisk+sum));
    assert.ok(Math.abs(partner.partnerRisk-expected)<1e-12);
  }
});

test("character identity no longer fixes the health bottom card",()=>{
  const {SoloEngine,__DATA}=loadRuntime();
  const profile=__DATA.PARTY_PEOPLE[0];
  const outcomes=new Set();
  for(let seed=1;seed<=120;seed++)outcomes.add(SoloEngine.buildPartner(profile,1,lcg(seed)).infected);
  assert.deepEqual([...outcomes].sort(),[false,true]);
});

test("the first hundred draws of one gender do not repeat a character",()=>{
  const {SoloEngine}=loadRuntime();
  const game=SoloEngine.createGame("female","male");
  const random=lcg(16);
  const ids=[];
  for(let turn=1;turn<=100;turn++){
    const partner=SoloEngine.drawPartner(game,random);
    ids.push(partner.profileId);
    game.history.push({profileId:partner.profileId});
    game.currentPartner=null;
  }
  assert.equal(new Set(ids).size,100);
});

test("probing costs one night and three heat, reveals one clue, and cannot repeat",()=>{
  const {SoloEngine}=loadRuntime();
  const game=SoloEngine.createGame();
  SoloEngine.drawPartner(game,lcg(5));
  const id=game.currentPartner.profileId;
  assert.equal(SoloEngine.hiddenTags(game.currentPartner).length,1);
  const first=SoloEngine.probe(game);
  assert.equal(first.ok,true);
  assert.equal(game.heat,53);
  assert.equal(game.turn,2);
  assert.equal(game.currentPartner.profileId,id);
  assert.equal(SoloEngine.hiddenTags(game.currentPartner).length,0);
  SoloEngine.continueAfterFeedback(game);
  const snapshot=JSON.stringify(game);
  assert.equal(SoloEngine.probe(game).ok,false);
  assert.equal(JSON.stringify(game),snapshot);
});

test("the single test kit reveals only the current partner and spends no night",()=>{
  const {SoloEngine}=loadRuntime();
  const game=SoloEngine.createGame();
  SoloEngine.drawPartner(game,lcg(8));
  game.currentPartner.infected=true;
  const beforeTurn=game.turn;
  const result=SoloEngine.testPartner(game);
  assert.equal(result.ok,true);
  assert.equal(result.infected,true);
  assert.equal(game.turn,beforeTurn);
  assert.equal(game.testkits,0);
  assert.equal(game.infected,false);
  assert.ok(game.currentPartner.tags.every(tag=>tag.revealed));
  assert.equal(game.history.length,1);
  assert.equal(game.history[0].type,"test");
  assert.equal(game.history[0].checkResult,"positive");
  assert.equal(game.history[0].partner.profileId,game.currentPartner.profileId);
  assert.equal(SoloEngine.testPartner(game).ok,false);
});

test("the partner test reveals the bottom card without rewriting available actions",()=>{
  const {SoloEngine}=loadRuntime();
  const game=SoloEngine.createGame();
  SoloEngine.drawPartner(game,lcg(20));
  game.currentPartner.infected=true;
  game.currentPartner.tags=game.currentPartner.tags.filter(tag=>!tag.constraint);
  while(game.currentPartner.tags.length<3)game.currentPartner.tags.push({id:"after_work",label:"剛下班",tone:"neutral",riskDelta:0,constraint:null,revealed:true});
  SoloEngine.testPartner(game);
  const locks=SoloEngine.getActionLocks(game.currentPartner);
  assert.equal(Object.keys(locks).length,0);
  assert.equal(locks.refuse,undefined);
  const available=Array.from(SoloEngine.ACTION_KEYS).find(key=>!locks[key]);
  assert.equal(SoloEngine.takeAction(game,available,fixed(0)).ok,true);
});

test("revealed boundaries are real constraints and use no lecture copy",()=>{
  const {SoloEngine,__DATA}=loadRuntime();
  const partner=SoloEngine.buildPartner(__DATA.PARTY_PEOPLE[0],1,lcg(31));
  partner.tested=false;
  partner.tags=[
    {id:"condom_only",label:"只接受有戴套",tone:"boundary",riskDelta:0,constraint:"condom_only",revealed:true},
    {id:"after_work",label:"剛下班",tone:"neutral",riskDelta:0,constraint:null,revealed:true},
    {id:"status_uncertain",label:"近期狀態：說不準",tone:"risk",riskDelta:.25,constraint:null,revealed:false}
  ];
  const locks=SoloEngine.getActionLocks(partner);
  assert.equal(locks.oral_raw,"對方拒絕");
  assert.equal(locks.sex_raw,"對方拒絕");
  assert.equal(locks.oral_condom,undefined);
  assert.equal(locks.sex_condom,undefined);
});

test("infection remains delayed after an action and hospital is the early reveal",()=>{
  const {SoloEngine}=loadRuntime();
  const game=SoloEngine.createGame();
  SoloEngine.drawPartner(game,lcg(45));
  game.currentPartner.infected=true;
  game.currentPartner.tested=false;
  game.currentPartner.tags=game.currentPartner.tags.filter(tag=>!tag.constraint);
  while(game.currentPartner.tags.length<3)game.currentPartner.tags.push({id:"after_work",label:"剛下班",tone:"neutral",riskDelta:0,constraint:null,revealed:true});
  const action=SoloEngine.takeAction(game,"sex_raw",fixed(0));
  assert.equal(action.ok,true);
  assert.equal(game.infected,true);
  assert.equal(game.result,null);
  assert.doesNotMatch(game.feedback.body,/感染|陽性|陰性|確診|觸發/);
  SoloEngine.continueAfterFeedback(game);
  SoloEngine.drawPartner(game,lcg(46));
  const hospital=SoloEngine.hospital(game);
  assert.equal(hospital.result,"hospital_positive");
  assert.equal(game.result,"hospital_positive");
});

test("solo transmission tuning keeps the original action ladder without the original harshness",()=>{
  const {__DATA}=loadRuntime();
  assert.equal(__DATA.GAME_CONFIG.transmissionScale,.5);
  assert.deepEqual(Object.values(__DATA.ACTIONS).map(action=>action.risk),[1,8,30,70,0]);
});

test("hospital can be used repeatedly, clears pressure, and adds ten heat",()=>{
  const {SoloEngine}=loadRuntime();
  const game=SoloEngine.createGame();
  SoloEngine.drawPartner(game,lcg(2));
  game.currentPartner.infected=false;
  game.anxiety=67;
  const first=SoloEngine.hospital(game);
  assert.equal(first.ok,true);
  assert.equal(first.result,null);
  assert.equal(game.heat,60);
  assert.equal(game.anxiety,0);
  assert.equal(game.turn,2);
  SoloEngine.continueAfterFeedback(game);
  const second=SoloEngine.hospital(game);
  assert.equal(second.ok,true);
  assert.equal(game.heat,70);
  assert.equal(game.turn,3);
});

test("hospital records its own result and reveals infection before a simultaneous heat limit",()=>{
  const {SoloEngine}=loadRuntime();
  const game=SoloEngine.createGame();
  SoloEngine.drawPartner(game,lcg(3));
  game.infected=true;
  game.heat=90;
  const result=SoloEngine.hospital(game);
  assert.equal(result.result,"hospital_positive");
  assert.equal(result.entry.checkResult,"positive");
});

test("pressure surcharge is part of the displayed-cost source of truth",()=>{
  const {SoloEngine}=loadRuntime();
  assert.equal(SoloEngine.pressureDelta(0,2),2);
  assert.equal(SoloEngine.pressureDelta(19,2),4);
  assert.equal(SoloEngine.pressureDelta(21,0),2);
  assert.equal(SoloEngine.pressureDelta(98,30),2);
  assert.match(read("app.js"),/SoloEngine\.pressureDelta\(game\.anxiety,action\.anxiety\)/);
  assert.match(read("app.js"),/SoloEngine\.pressureDelta\(game\.anxiety,0\)/);
});

test("the engine has no round cap and only the five original-style endings",()=>{
  const {SoloEngine,__DATA}=loadRuntime();
  assert.equal(__DATA.GAME_CONFIG.roundCount,undefined);
  assert.deepEqual(Object.keys(__DATA.ENDINGS).sort(),["anxiety","final_positive","hospital_positive","urge","victory"]);
  const game=SoloEngine.createGame();
  game.turn=41;
  SoloEngine.drawPartner(game,lcg(60));
  game.currentPartner.infected=false;
  game.currentPartner.tags=game.currentPartner.tags.filter(tag=>!tag.constraint);
  const result=SoloEngine.takeAction(game,"oral_condom",fixed(.99));
  assert.equal(result.ok,true);
  assert.equal(game.turn,42);
  assert.equal(game.result,null);
});

test("heat zero resolves only at the final flip and pressure 100 wins priority",()=>{
  const {SoloEngine}=loadRuntime();
  const healthy=SoloEngine.createGame();
  SoloEngine.drawPartner(healthy,lcg(71));
  healthy.currentPartner.infected=false;
  healthy.currentPartner.tags=healthy.currentPartner.tags.filter(tag=>!tag.constraint);
  healthy.heat=14;
  assert.equal(SoloEngine.takeAction(healthy,"sex_raw",fixed(.99)).result,"victory");

  const infected=SoloEngine.createGame();
  SoloEngine.drawPartner(infected,lcg(72));
  infected.currentPartner.infected=true;
  infected.currentPartner.tags=infected.currentPartner.tags.filter(tag=>!tag.constraint);
  infected.heat=14;
  assert.equal(SoloEngine.takeAction(infected,"sex_raw",fixed(0)).result,"final_positive");

  const anxious=SoloEngine.createGame();
  SoloEngine.drawPartner(anxious,lcg(73));
  anxious.currentPartner.infected=false;
  anxious.currentPartner.tags=anxious.currentPartner.tags.filter(tag=>!tag.constraint);
  anxious.heat=14;
  anxious.anxiety=68;
  assert.equal(SoloEngine.takeAction(anxious,"sex_raw",fixed(.99)).result,"anxiety");
});

test("heat 100 ends without fabricating an extra action",()=>{
  const {SoloEngine}=loadRuntime();
  const game=SoloEngine.createGame();
  SoloEngine.drawPartner(game,lcg(80));
  game.heat=92;
  const result=SoloEngine.takeAction(game,"refuse",fixed(0));
  assert.equal(result.result,"urge");
  assert.equal(result.entry.actionLabel,"換一個");
  assert.equal(result.entry.transmission,false);
  assert.equal(game.history.length,1);
});

test("visible production copy contains rules and results, not safety-education language",()=>{
  const visible=[read("index.html"),read("data.js"),read("app.js"),read("engine.js")].join("\n");
  for(const phrase of ["健康教育","安全衛教","現實互動","以本人同意","保護為前提","重要提醒","作品立場","合規聲明","醫療協助","照護與支持","價值判斷","請諮詢","務必","記得保護"]){
    assert.doesNotMatch(visible,new RegExp(phrase));
  }
  for(const stereotype of ["剛結束一段關係","剛從上一攤過來","不想談最近狀態","近期沒有其他對象","成人虛構單機遊戲","原版核心"]){
    assert.doesNotMatch(visible,new RegExp(stereotype));
  }
});

test("strict CSP keeps sprites and meters free of inline styles",()=>{
  const runtime=loadRuntime({withApp:true});
  const html=read("index.html");
  const styles=read("styles.css");
  assert.match(html,/style-src 'self'/);
  assert.doesNotMatch(html,/unsafe-inline/);
  assert.match(html,/<progress class="meter" id="heat-meter"/);
  const person=runtime.__DATA.PARTY_PEOPLE[0];
  const markup=runtime.SoloApp.avatarMarkup({avatar:person.image,x:person.x,y:person.y});
  assert.doesNotMatch(markup,/style=/);
  assert.match(markup,/sheet-male-1/);
  assert.match(markup,/sprite-x-0/);
  assert.match(markup,/sprite-y-0/);
  assert.match(styles,/\.replay-avatar,.replay-icon\{[^}]*background-color:/);
  assert.doesNotMatch(styles,/\.replay-avatar,.replay-icon\{[^}]*background:/);
  for(const avatar of Object.values(runtime.__DATA.AVATAR_SHEETS).flat())assert.match(styles,new RegExp(avatar.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/^\.\//,"")));
});

test("replay uses the stored tool result instead of guessing from the final ending",()=>{
  const runtime=loadRuntime({withApp:true});
  const hospital=runtime.SoloApp.renderReplayItem({type:"hospital",turn:4,checkResult:"positive",heat:100,anxiety:0});
  assert.match(hospital,/結果：感染/);
  assert.doesNotMatch(hospital,/未見感染/);
  const person=runtime.__DATA.PARTY_PEOPLE[0];
  const partner=runtime.SoloEngine.buildPartner(person,1,lcg(4));
  const testRow=runtime.SoloApp.renderReplayItem({type:"test",turn:1,checkResult:"negative",partner});
  assert.match(testRow,/對方試紙/);
  assert.match(testRow,/結果：未見異常/);
  assert.match(testRow,/不經過一晚/);
});

test("the formal GitHub Pages entry is canonical everywhere",()=>{
  const html=read("index.html");
  assert.match(html,/https:\/\/victoriac1122\.github\.io\/happy-party-game-solo\//);
  assert.doesNotMatch(html,/victoriachengyw\.com/);
  assert.equal(read("robots.txt").trim().endsWith("https://victoriac1122.github.io/happy-party-game-solo/sitemap.xml"),true);
  assert.match(read("sitemap.xml"),/https:\/\/victoriac1122\.github\.io\/happy-party-game-solo\//);
});

test("all ending and avatar assets referenced at runtime exist",()=>{
  const {__DATA}=loadRuntime();
  for(const ending of Object.values(__DATA.ENDINGS)){
    assert.equal(fs.existsSync(path.join(ROOT,ending.image.replace(/^\.\//,""))),true,ending.image);
    for(const candidate of ending.imageSrcSet.split(",")){
      const relative=candidate.trim().split(/\s+/)[0].replace(/^\.\//,"");
      assert.equal(fs.existsSync(path.join(ROOT,relative)),true,relative);
    }
  }
  for(const avatar of Object.values(__DATA.AVATAR_SHEETS).flat()){
    assert.equal(fs.existsSync(path.join(ROOT,avatar.replace(/^\.\//,""))),true,avatar);
  }
});

test("corrupt or legacy saves are rejected instead of migrating removed systems",()=>{
  const runtime=loadRuntime({withApp:true});
  assert.equal(runtime.SoloApp.normalizeGame(null),null);
  assert.equal(runtime.SoloApp.normalizeGame({schemaVersion:7,score:99,log:[{event:{title:"chaos"}}]}),null);
  assert.equal(runtime.SoloApp.normalizeGame({schemaVersion:1,playerGender:"x",partnerGender:"male"}),null);
});

test("a valid long-running save does not reset after night 300",()=>{
  const runtime=loadRuntime({withApp:true});
  const game=runtime.SoloEngine.createGame();
  game.turn=301;
  runtime.SoloEngine.drawPartner(game,lcg(90));
  const restored=runtime.SoloApp.normalizeGame(JSON.parse(JSON.stringify(game)));
  assert.equal(restored.turn,301);
  assert.equal(restored.currentPartner.profileId,game.currentPartner.profileId);
});
