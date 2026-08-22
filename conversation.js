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
    "他把杯墊轉了半圈，說這件事得從頭講起。",
    "他先確認你有空聽完，才把那段往事搬上桌。",
    "他笑了一下，說這不是破冰題，是今晚最想找人解的謎。",
    "他把手機扣在桌上，決定先不讓通知打斷這段故事。",
    "他用很認真的語氣開場，卻在最後自己先笑出來。",
    "他說可以先交換一件小尷尬，氣氛會比較公平。",
    "他把問題寫在餐巾紙上，推過來等你決定要不要接。",
    "他說散場前想把這件事講完整，現在剛好有人願意聽。"
  ];

  const BOUNDARIES=[
    {label:"🧭 他先談好保護",state:"只接受有保護的互動",constraint:"condom_only",dialogue:"「如果真的要更靠近，保護和界線要先講好；不舒服就停，沒有例外。」"},
    {label:"🧭 他說今晚不想口腔親密",state:"口腔相關選項不適用",constraint:"no_oral",dialogue:"「我今晚不想有口腔相關的親密互動，這不是討價還價；我們可以換別的節奏，或就先聊天。」"},
    {label:"🧭 他說今晚不想插入式互動",state:"插入式選項不適用",constraint:"no_sex",dialogue:"「我今天不想把互動走到插入式那一步。能被好好聽見，比把進度趕完重要。」"},
    {label:"🧭 他把今晚停在聊天",state:"今晚只適合聊天",constraint:"no_intimacy",dialogue:"「我想留下來聊天，但不想發展成親密互動。你可以說不，也可以陪我把這段話講完。」"},
    {label:"🧭 他說慢一點",state:"沒有額外限制",constraint:null,dialogue:"「我不喜歡把第一次對話當成待辦清單。慢一點也沒關係，先確認彼此都自在。」"},
    {label:"🧭 他把拒絕說得很清楚",state:"沒有額外限制",constraint:null,dialogue:"「不管聊到哪裡，任何人改變心意都算數。我也希望你會直接說。」"},
    {label:"🧭 他先問你的界線",state:"沒有額外限制",constraint:null,dialogue:"「你比較在意什麼？我不想靠猜，也不想替你做決定。」"},
    {label:"🧭 他不想被催",state:"沒有額外限制",constraint:null,dialogue:"「我可以有好奇，但不想被推著走。今晚能好好離開，也是一種好結局。」"},
    {label:"🧭 他把選擇留在桌上",state:"沒有額外限制",constraint:null,dialogue:"「我們不用現在就決定所有事。先聊，想停就停，這樣比較像兩個人在做選擇。」"}
  ];

  const HEALTH_TALKS=[
    {label:"🫧 他不拿外表猜健康",dialogue:"「健康不是看起來像不像就能判斷的。我比較相信溝通、檢測和不確定時先停下來。」"},
    {label:"🫧 他把檢測當成照顧",dialogue:"「我不覺得問健康資訊很掃興；能問清楚，反而比較能自在地待在同一張桌上。」"},
    {label:"🫧 他承認不知道就會停",dialogue:"「有些事不是靠運氣猜答案。不確定的時候，我寧願先停下來、找正確的資訊。」"},
    {label:"🫧 他說保護不是扣分",dialogue:"「我不把保護當成破壞氣氛；能把彼此照顧好，才有資格說這晚玩得漂亮。」"},
    {label:"🫧 他會把界線說出口",dialogue:"「我不想用暗示讓人猜。需要什麼、不想要什麼，我希望都能直接講。」"},
    {label:"🫧 他把同意放在前面",dialogue:"「就算剛剛聊得很合，也不代表後面每一步都自動同意。每次都還是要問。」"},
    {label:"🫧 他說結果不是評價",dialogue:"「遇到健康疑慮時，重要的是照護和下一步，不是用一個結果替誰貼標籤。」"},
    {label:"🫧 他提醒別把焦慮當證據",dialogue:"「焦慮很會把空白補成最糟的答案。真有疑慮，就找可信任的專業資訊。」"},
    {label:"🫧 他說可以先離開",dialogue:"「任何時候覺得不對勁都可以走；不需要把拒絕包裝成藉口。」"}
  ];

  function buildClues(person){
    const seed=seedFor(person),subject=subjectFor(person),title=String(person?.title||"還沒說完的故事"),story=String(person?.story||subject+"暫時把故事留在心裡。"),opener=speakAs(choose(OPENERS,seed),person),boundary=choose(BOUNDARIES,seed,2),health=choose(HEALTH_TALKS,seed,5);
    return[
      {id:"opening",kind:"opening",label:"🎟️ 開場："+title,state:"第一印象",dialogue:"「我這段叫《"+title+"》。」"+opener,revealed:true},
      {id:"story",kind:"story",label:"📖 "+subject+"把故事講完整",state:"人物故事",dialogue:story,revealed:false},
      {id:"boundary",kind:"boundary",label:speakAs(boundary.label,person),state:boundary.state,dialogue:speakAs(boundary.dialogue,person),constraint:boundary.constraint,revealed:false},
      {id:"care",kind:"care",label:speakAs(health.label,person),state:"健康溝通",dialogue:speakAs(health.dialogue,person),revealed:false}
    ];
  }

  function restoreClues(person,rawClues,legacyChat,tested){
    const revealedIds=new Set(Array.isArray(rawClues)?rawClues.filter(clue=>clue?.revealed).map(clue=>clue.id):[]);
    return buildClues(person).map((clue,index)=>({...clue,revealed:clue.revealed||Boolean(tested)||revealedIds.has(clue.id)||(Boolean(legacyChat)&&index===1)}));
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
    if(health.tested&&health.abnormal)lock(ACTION_KEYS,"試紙顯示異常：今晚先停下，請選擇換一個或去驗一下。");
    if(constraints.has("no_intimacy"))lock(ACTION_KEYS,"已知界線：今晚只想聊天，請尊重並選擇離開。");
    if(constraints.has("condom_only"))lock(["oral_raw","sex_raw"],"已知界線：只接受有保護的互動。");
    if(constraints.has("no_oral"))lock(["oral_condom","oral_raw"],"已知界線：今晚不想口腔親密。");
    if(constraints.has("no_sex"))lock(["sex_condom","sex_raw"],"已知界線：今晚不想插入式互動。");
    return locks;
  }

  root.ConversationEngine={buildClues,restoreClues,revealNextClue,revealAllClues,getActionLocks};
})(globalThis);
