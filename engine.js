(function(root){
  const ACTION_KEYS=["oral_condom","sex_condom","oral_raw","sex_raw"];
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));
  const randomIndex=(length,random)=>Math.min(length-1,Math.floor(clamp(Number(random()),0,.999999)*length));
  const pick=(items,random)=>items[randomIndex(items.length,random)];
  const cloneTag=tag=>({
    id:tag.id,
    label:tag.label,
    tone:tag.tone||"neutral",
    riskDelta:Number(tag.riskDelta)||0,
    constraint:tag.constraint||null,
    revealed:tag.revealed!==false
  });
  const pickUnique=(items,count,random)=>{
    const pool=items.slice();
    const chosen=[];
    while(pool.length&&chosen.length<count){
      const index=randomIndex(pool.length,random);
      chosen.push(pool.splice(index,1)[0]);
    }
    return chosen;
  };

  function createGame(playerGender="female",partnerGender="male"){
    return{
      schemaVersion:1,
      phase:"turn",
      turn:1,
      heat:GAME_CONFIG.startHeat,
      anxiety:GAME_CONFIG.startAnxiety,
      testkits:GAME_CONFIG.testkits,
      infected:false,
      playerGender:playerGender==="male"?"male":"female",
      partnerGender:partnerGender==="female"?"female":"male",
      currentPartner:null,
      history:[],
      feedback:null,
      result:null
    };
  }

  function buildPartner(profile,turn,random=Math.random){
    const tagCount=random()<.5?3:4;
    const statusCount=tagCount===4&&random()<.65?2:1;
    const statusTags=pickUnique(STATUS_TAGS,statusCount,random).map(cloneTag);
    const boundary=random()<.55?cloneTag(pick(BOUNDARY_TAGS,random)):null;
    const tags=statusTags.slice();
    if(boundary)tags.push(boundary);
    const vibeCount=tagCount-tags.length;
    tags.push(...pickUnique(VIBE_TAGS,vibeCount,random).map(cloneTag));
    const hiddenStatus=pick(statusTags,random);
    hiddenStatus.revealed=false;
    const partnerRisk=clamp(
      GAME_CONFIG.basePartnerRisk+statusTags.reduce((total,tag)=>total+tag.riskDelta,0),
      GAME_CONFIG.minPartnerRisk,
      GAME_CONFIG.maxPartnerRisk
    );
    return{
      profileId:profile.id,
      name:profile.name,
      gender:profile.gender,
      avatar:profile.image,
      x:profile.x,
      y:profile.y,
      flirt:pick(FLIRT_LINES,random),
      tags,
      infected:random()<partnerRisk,
      partnerRisk,
      tested:false,
      probed:false,
      turn
    };
  }

  function drawPartner(game,random=Math.random){
    const pool=PARTY_PEOPLE.filter(person=>person.gender===game.partnerGender);
    const seen=new Set(game.history.map(item=>item.profileId).filter(Boolean));
    const available=pool.filter(person=>!seen.has(person.id));
    const profile=pick(available.length?available:pool,random);
    game.currentPartner=buildPartner(profile,game.turn,random);
    return game.currentPartner;
  }

  function hiddenTags(partner){
    return Array.isArray(partner?.tags)?partner.tags.filter(tag=>!tag.revealed):[];
  }

  function getActionLocks(partner){
    const locks={};
    const lock=(keys,reason)=>keys.forEach(key=>{locks[key]=reason});
    if(!partner)return locks;
    const constraints=new Set(partner.tags.filter(tag=>tag.constraint).map(tag=>tag.constraint));
    if(constraints.has("no_intimacy"))lock(ACTION_KEYS,"對方拒絕");
    if(constraints.has("condom_only"))lock(["oral_raw","sex_raw"],"對方拒絕");
    if(constraints.has("no_oral"))lock(["oral_condom","oral_raw"],"對方拒絕");
    if(constraints.has("no_sex"))lock(["sex_condom","sex_raw"],"對方拒絕");
    return locks;
  }

  function snapshotPartner(partner){
    if(!partner)return null;
    return{
      profileId:partner.profileId,
      name:partner.name,
      gender:partner.gender,
      avatar:partner.avatar,
      x:partner.x,
      y:partner.y,
      tags:partner.tags.map(cloneTag),
      infected:Boolean(partner.infected),
      tested:Boolean(partner.tested),
      probed:Boolean(partner.probed)
    };
  }

  function pressureDelta(current,base){
    const before=clamp(current);
    let after=clamp(before+base);
    if(after>20)after=clamp(after+2);
    return after-before;
  }

  function addPressure(game,base){
    const delta=pressureDelta(game.anxiety,base);
    game.anxiety=clamp(game.anxiety+delta);
    return delta;
  }

  function completeTurn(game,entry,keepPartner){
    game.history.push(entry);
    game.turn+=1;
    game.phase="feedback";
    if(!keepPartner)game.currentPartner=null;
  }

  function finishIfNeeded(game){
    if(game.heat>=100)return finish(game,"urge");
    if(game.anxiety>=100)return finish(game,"anxiety");
    if(game.heat<=0)return finish(game,game.infected?"final_positive":"victory");
    return null;
  }

  function finish(game,result){
    game.result=result;
    game.phase="finale";
    game.feedback=null;
    game.currentPartner=null;
    return result;
  }

  function probe(game){
    const partner=game.currentPartner;
    const hidden=hiddenTags(partner);
    if(game.phase!=="turn"||!partner||partner.probed||!hidden.length)return{ok:false};
    const clue=hidden[0];
    clue.revealed=true;
    partner.probed=true;
    const heatBefore=game.heat;
    const anxietyBefore=game.anxiety;
    game.heat=clamp(game.heat+GAME_CONFIG.chatHeat);
    addPressure(game,0);
    const entry={
      type:"probe",
      turn:game.turn,
      profileId:partner.profileId,
      partner:snapshotPartner(partner),
      actionKey:"probe",
      actionLabel:"刺探",
      heat:game.heat,
      anxiety:game.anxiety,
      transmission:false
    };
    completeTurn(game,entry,true);
    game.feedback={title:"情報翻開",body:clue.label,delta:`壓抑 ${signed(game.heat-heatBefore)} · 壓力 ${signed(game.anxiety-anxietyBefore)}`,keepPartner:true};
    const result=finishIfNeeded(game);
    return{ok:true,clue,result,entry};
  }

  function testPartner(game){
    const partner=game.currentPartner;
    if(game.phase!=="turn"||!partner||partner.tested||game.testkits<1)return{ok:false};
    game.testkits-=1;
    partner.tested=true;
    partner.tags.forEach(tag=>{tag.revealed=true});
    const entry={
      type:"test",
      turn:game.turn,
      profileId:partner.profileId,
      partner:snapshotPartner(partner),
      actionKey:"test",
      actionLabel:"對方試紙",
      heat:game.heat,
      anxiety:game.anxiety,
      checkResult:partner.infected?"positive":"negative",
      transmission:false
    };
    game.history.push(entry);
    return{ok:true,infected:partner.infected,entry};
  }

  function hospital(game){
    if(game.phase!=="turn")return{ok:false};
    const heatBefore=game.heat;
    const anxietyBefore=game.anxiety;
    game.heat=clamp(game.heat+GAME_CONFIG.hospitalHeat);
    game.anxiety=0;
    const checkResult=game.infected?"positive":"negative";
    const entry={
      type:"hospital",
      turn:game.turn,
      profileId:null,
      partner:null,
      actionKey:"hospital",
      actionLabel:"去醫院",
      heat:game.heat,
      anxiety:game.anxiety,
      checkResult,
      transmission:false
    };
    completeTurn(game,entry,true);
    if(game.infected){finish(game,"hospital_positive");return{ok:true,result:"hospital_positive",entry};}
    if(game.heat>=100){finish(game,"urge");return{ok:true,result:"urge",entry};}
    game.feedback={title:"醫院檢查",body:"這次沒有翻出感染。",delta:`壓抑 ${signed(game.heat-heatBefore)} · 壓力 ${signed(game.anxiety-anxietyBefore)}`,keepPartner:true};
    return{ok:true,result:null,entry};
  }

  function takeAction(game,key,random=Math.random){
    const partner=game.currentPartner;
    const action=ACTIONS[key];
    if(game.phase!=="turn"||!partner||!action)return{ok:false,reason:"invalid"};
    const lock=getActionLocks(partner)[key];
    if(lock)return{ok:false,reason:lock};
    const heatBefore=game.heat;
    const anxietyBefore=game.anxiety;
    game.heat=clamp(game.heat+action.heat);
    addPressure(game,action.anxiety);
    const transmission=Boolean(key!=="refuse"&&!game.infected&&partner.infected&&random()<(action.risk/100)*GAME_CONFIG.transmissionScale);
    if(transmission)game.infected=true;
    const entry={
      type:"action",
      turn:game.turn,
      profileId:partner.profileId,
      partner:snapshotPartner(partner),
      actionKey:key,
      actionLabel:action.short,
      heat:game.heat,
      anxiety:game.anxiety,
      transmission
    };
    completeTurn(game,entry,false);
    game.feedback={
      title:action.short,
      body:key==="refuse"?"你離開這桌。":"這一晚先記下，答案不會現在公布。",
      delta:`壓抑 ${signed(game.heat-heatBefore)} · 壓力 ${signed(game.anxiety-anxietyBefore)}`,
      keepPartner:false
    };
    const result=finishIfNeeded(game);
    return{ok:true,result,entry};
  }

  function continueAfterFeedback(game){
    if(game.phase!=="feedback")return false;
    game.phase="turn";
    game.feedback=null;
    return true;
  }

  function signed(number){
    return`${number>=0?"+":""}${number}`;
  }

  root.SoloEngine={
    ACTION_KEYS,
    createGame,
    buildPartner,
    drawPartner,
    hiddenTags,
    getActionLocks,
    pressureDelta,
    probe,
    testPartner,
    hospital,
    takeAction,
    continueAfterFeedback,
    finish,
    snapshotPartner
  };
})(globalThis);
