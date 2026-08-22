/*
 * 原創的刺探互動資料。
 * 線索只描述角色自己說出的界線、偏好與故事，不從外表、職業或場景推斷健康狀況。
 */
(function(root){
  const ACTION_KEYS=["oral_condom","sex_condom","oral_raw","sex_raw"];
  const seedFor=person=>{
    const number=Number(String(person?.id||"").split("-").pop());
    return (Number.isInteger(number)?number:1)+(person?.gender==="female"?100:0);
  };
  const choose=(items,seed,offset=0)=>items[(seed+offset)%items.length];
  const subjectFor=person=>person?.gender==="female"?"她":"他";
  const speakAs=(text,person)=>String(text).replace(/他/g,subjectFor(person));

  const OPENERS=[
    "他把杯墊翻到背面：「先說好，這不是自我介紹，是口供。」",
    "他看了一眼出口：「如果等一下有人找我，你就說沒看過這張臉。」",
    "他把手機調成飛航模式：「很好，現在誰都不能阻止我把故事講歪。」",
    "他先笑了三秒：「我知道聽起來像假的，問題是監視器也拍到了。」",
    "他把桌上的糖包排成箭頭：「事情要從一個不該出現的人開始。」",
    "他壓低聲音：「你想聽普通版，還是會害我被朋友封鎖的版本？」",
    "他把號碼牌推過來：「抽到這桌的人，理論上要替我保守一個秘密。」",
    "他往你身後看了一眼：「別回頭。好，現在我們可以聊天了。」",
    "他把飲料移到安全距離：「上次講到這裡，有人把整杯打翻。」",
    "他很認真地說：「我今晚只說真話——但順序不一定是真的。」",
    "他掏出一張皺掉的清單：「上面十件事，我已經做錯九件。」",
    "他敲了兩下桌面：「這是暗號。至於跟誰的暗號，我還在查。」"
  ];

  const BOUNDARIES=[
    {label:"🚧 他把保護措施放上桌",state:"只接受有保護的互動",constraint:"condom_only",dialogue:"「要續攤可以，保護措施先上桌。少一樣，我就把椅子推回去。」"},
    {label:"🚧 他劃掉口腔這一格",state:"口腔相關選項不適用",constraint:"no_oral",dialogue:"「先講，口腔那條線今晚不開放。別問第二次，第二次會更尷尬。」"},
    {label:"🚧 他不走插入式劇情",state:"插入式選項不適用",constraint:"no_sex",dialogue:"「今晚不走插入式。你若想改劇本，那就直接換桌。」"},
    {label:"🚧 他今晚只賣故事",state:"今晚只適合聊天",constraint:"no_intimacy",dialogue:"「我今晚只賣故事，不賣續集。你可以聽完，也可以現在退票。」"},
    {label:"🎛️ 他把節奏調到慢速",state:"今晚照常選擇",constraint:null,dialogue:"「別趕進度。今晚又沒有片尾字幕追著我們跑。」"},
    {label:"🛎️ 他把停損暗號定成『香菜』",state:"今晚照常選擇",constraint:null,dialogue:"「誰喊香菜就立刻停。跟喜不喜歡香菜無關，我只是確定大家都聽得懂。」"},
    {label:"🧾 他要求每一步重新報價",state:"今晚照常選擇",constraint:null,dialogue:"「剛剛答應的只算剛剛。下一步要不要，下一步再問。」"},
    {label:"🚪 他先指給你看出口",state:"今晚照常選擇",constraint:null,dialogue:"「出口在那邊。我先講，是因為等一下任何人想走都不用演戲。」"},
    {label:"🪑 他把選擇留在空椅上",state:"今晚照常選擇",constraint:null,dialogue:"「可以繼續，可以只聊天，也可以讓這張椅子空著。三個都算答案。」"}
  ];

  const HOOK_TAILS=[
    "他說到這裡，把後半句吞了回去。",
    "他把杯子轉半圈：「剩下的等散場。」",
    "他笑了一下，拒絕解釋最可疑的細節。",
    "他指了指出口：「結局不在這桌。」",
    "他停頓兩秒：「下一句要另外收費。」",
    "他把手機扣住：「證物先到這裡。」",
    "他看向舞池：「後半段有人還沒到場。」",
    "他把號碼牌收回口袋：「復盤再揭曉。」"
  ];

  function storyHook(person,seed){
    const story=String(person?.story||"故事說到最可疑的地方，剛好斷線。"),fragment=story.split(/[；。！？]/).find(part=>part.trim())||story,characters=Array.from(fragment.trim()),clipped=characters.length>42,excerpt=clipped?characters.slice(0,42).join("")+"…":fragment.trim();
    return{id:"story",kind:"story",label:"🧩 故事少了一頁",state:"人物伏筆",dialogue:excerpt+(clipped?"":"。")+speakAs(choose(HOOK_TAILS,seed,4),person),revealed:false};
  }

  function buildClues(person){
    const seed=seedFor(person),title=String(person?.title||"還沒說完的故事"),opener=speakAs(choose(OPENERS,seed),person),boundary=choose(BOUNDARIES,seed,2);
    const hidden=boundary.constraint
      ?{id:"boundary",kind:"boundary",label:speakAs(boundary.label,person),state:boundary.state,dialogue:speakAs(boundary.dialogue,person),constraint:boundary.constraint,revealed:false}
      :storyHook(person,seed);
    return[
      {id:"opening",kind:"opening",label:"🎟️ "+title,state:"桌面上已知",dialogue:opener,revealed:true},
      hidden
    ];
  }

  function restoreClues(person,rawClues,legacyChat,tested){
    const revealedIds=new Set(Array.isArray(rawClues)?rawClues.filter(clue=>clue?.revealed).map(clue=>clue.id):[]);
    const hadConversation=Boolean(legacyChat)||(Array.isArray(rawClues)&&rawClues.some(clue=>clue?.revealed&&clue.id!=="opening"));
    return buildClues(person).map((clue,index)=>({...clue,revealed:clue.revealed||Boolean(tested)||revealedIds.has(clue.id)||(hadConversation&&index>0)}));
  }

  function revealNextClue(clues,random=Math.random){
    const hidden=Array.isArray(clues)?clues.filter(clue=>!clue.revealed):[];
    if(!hidden.length)return null;
    const clue=hidden[Math.floor(random()*hidden.length)];
    clue.revealed=true;
    return clue;
  }

  function revealAllClues(clues){
    if(Array.isArray(clues))clues.forEach(clue=>{clue.revealed=true});
    return clues;
  }

  function getActionLocks(clues,health={}){
    const locks={};
    const constraints=new Set((Array.isArray(clues)?clues:[]).filter(clue=>clue.revealed&&clue.constraint).map(clue=>clue.constraint));
    const lock=(keys,reason)=>keys.forEach(key=>{locks[key]=locks[key]||reason});
    if(health.tested&&health.abnormal)lock(ACTION_KEYS,"試紙顯示異常：本桌親密選項已關閉。");
    if(constraints.has("no_intimacy"))lock(ACTION_KEYS,"已知界線：今晚只聊天，其他選項已關閉。");
    if(constraints.has("condom_only"))lock(["oral_raw","sex_raw"],"已知界線：只接受有保護的互動。");
    if(constraints.has("no_oral"))lock(["oral_condom","oral_raw"],"已知界線：今晚不想口腔親密。");
    if(constraints.has("no_sex"))lock(["sex_condom","sex_raw"],"已知界線：今晚不想插入式互動。");
    return locks;
  }

  root.ConversationEngine={buildClues,restoreClues,revealNextClue,revealAllClues,getActionLocks};
})(globalThis);
