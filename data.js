const GAME_CONFIG={
  startHeat:50,
  startAnxiety:0,
  chatHeat:3,
  hospitalHeat:10,
  testkits:1,
  transmissionScale:.5,
  basePartnerRisk:.28,
  minPartnerRisk:.05,
  maxPartnerRisk:.75
};

const ACTIONS={
  oral_condom:{label:"🍬 戴套口交",short:"戴套口交",heat:2,anxiety:2,risk:1,copy:"壓抑 +2 · 壓力 +2"},
  sex_condom:{label:"🛡️ 戴套性交",short:"戴套性交",heat:-2,anxiety:5,risk:8,copy:"壓抑 -2 · 壓力 +5"},
  oral_raw:{label:"🍭 無套口交",short:"無套口交",heat:-4,anxiety:15,risk:30,copy:"壓抑 -4 · 壓力 +15"},
  sex_raw:{label:"🔥 無套性交",short:"無套性交",heat:-14,anxiety:30,risk:70,copy:"壓抑 -14 · 壓力 +30"},
  refuse:{label:"👋 換一個",short:"換一個",heat:8,anxiety:0,risk:0,copy:"壓抑 +8"}
};

const ENDINGS={
  victory:{label:"過關",title:"天亮以前，你做到了",body:"壓抑歸零，最後翻牌也沒有感染。",image:"./assets/optimized/endings/victory-dawn-v2-640.jpg",imageSrcSet:"./assets/optimized/endings/victory-dawn-v2-640.jpg 640w, ./assets/optimized/endings/victory-dawn-v2-1200.jpg 1200w"},
  urge:{label:"壓抑滿格",title:"壓抑值衝到 100%",body:"數值爆表，本局提前結束。",image:"./assets/optimized/endings/urge-overload-640.jpg",imageSrcSet:"./assets/optimized/endings/urge-overload-640.jpg 640w, ./assets/optimized/endings/urge-overload-1200.jpg 1200w"},
  anxiety:{label:"壓力滿格",title:"心理壓力衝到 100%",body:"眼前只剩雜訊，本局提前結束。",image:"./assets/optimized/endings/anxiety-glitch-v2-640.jpg",imageSrcSet:"./assets/optimized/endings/anxiety-glitch-v2-640.jpg 640w, ./assets/optimized/endings/anxiety-glitch-v2-1200.jpg 1200w"},
  hospital_positive:{label:"醫院翻牌",title:"檢查結果先一步揭曉",body:"醫院翻出感染，本局在這裡結束。",image:"./assets/optimized/endings/hospital-positive-640.jpg",imageSrcSet:"./assets/optimized/endings/hospital-positive-640.jpg 640w, ./assets/optimized/endings/hospital-positive-1200.jpg 1200w"},
  final_positive:{label:"延遲判決",title:"壓抑歸零，答案才追上來",body:"最後結算翻出感染。先前的行動沒有即時公布結果。",image:"./assets/optimized/endings/final-positive-640.jpg",imageSrcSet:"./assets/optimized/endings/final-positive-640.jpg 640w, ./assets/optimized/endings/final-positive-1200.jpg 1200w"}
};

const STATUS_TAGS=[
  {id:"status_uncertain",label:"底牌訊號：偏高",tone:"risk",riskDelta:.25},
  {id:"test_pending",label:"本局狀態：未確認",tone:"risk",riskDelta:.20},
  {id:"test_date_unknown",label:"狀態記錄：空白",tone:"risk",riskDelta:.18},
  {id:"recent_breakup",label:"最近結果：待定",tone:"risk",riskDelta:.12},
  {id:"avoids_status",label:"狀態時間：對不上",tone:"risk",riskDelta:.16},
  {id:"from_afterparty",label:"底牌雜訊：增加",tone:"risk",riskDelta:.08},
  {id:"recent_negative",label:"底牌訊號：偏低",tone:"safe",riskDelta:-.20},
  {id:"sealed_test",label:"最近結果：未見感染",tone:"safe",riskDelta:-.14},
  {id:"clear_timeline",label:"狀態記錄：已核對",tone:"safe",riskDelta:-.11},
  {id:"test_this_month",label:"結果時間：本週",tone:"safe",riskDelta:-.16},
  {id:"offers_test",label:"願意直接翻牌",tone:"safe",riskDelta:-.13},
  {id:"no_recent_partner",label:"底牌雜訊：減少",tone:"safe",riskDelta:-.10}
];

const VIBE_TAGS=[
  {id:"friend_invited",label:"朋友臨時揪來"},
  {id:"after_work",label:"剛下班"},
  {id:"first_visit",label:"第一次來"},
  {id:"dance_regular",label:"舞池常客"},
  {id:"sparkling_water",label:"只喝氣泡水"},
  {id:"low_battery",label:"手機快沒電"},
  {id:"early_morning",label:"明早要早起"},
  {id:"lives_far",label:"住得有點遠"},
  {id:"knows_bartender",label:"認識吧台的人"},
  {id:"cant_dance",label:"不太會跳舞"},
  {id:"quiet",label:"話不多"},
  {id:"came_alone",label:"一個人來"},
  {id:"after_dinner",label:"剛結束聚餐"},
  {id:"one_hour",label:"只待一小時"},
  {id:"checks_time",label:"一直看時間"},
  {id:"holds_seat",label:"替朋友佔位"},
  {id:"good_playlist",label:"歌單品味很好"},
  {id:"lost_coat",label:"外套忘在樓上"},
  {id:"new_job",label:"剛換工作"},
  {id:"no_alcohol",label:"今天不喝酒"},
  {id:"missed_train",label:"錯過末班車"},
  {id:"birthday_group",label:"朋友正在慶生"},
  {id:"camera",label:"帶著底片相機"},
  {id:"song_request",label:"剛點了一首歌"}
];

const BOUNDARY_TAGS=[
  {id:"condom_only",label:"只接受有戴套",tone:"boundary",constraint:"condom_only"},
  {id:"no_oral",label:"今晚不口交",tone:"boundary",constraint:"no_oral"},
  {id:"no_sex",label:"今晚不性交",tone:"boundary",constraint:"no_sex"},
  {id:"no_intimacy",label:"今晚只聊天",tone:"boundary",constraint:"no_intimacy"}
];

const FLIRT_LINES=[
  "這裡有人嗎？沒有的話，我坐了。",
  "你也在等這首歌？",
  "外面在下雨，先別急著走。",
  "我聽不清楚，再靠近一點說。",
  "你剛剛是不是叫我？",
  "剩最後一張椅子。",
  "這杯不是我的，你拿錯了。",
  "我朋友去跳舞了。",
  "下一首歌結束我就走。",
  "你看起來也不認識這裡的人。",
  "先別問名字。",
  "你選這桌，有理由嗎？",
  "我剛好少一個聊天的人。",
  "燈太暗，我差點認錯人。",
  "你來多久了？",
  "我只聽得到一半，挑重點說。",
  "那邊太擠，這裡剛好。",
  "你的外套快掉了。",
  "你要坐裡面還是外面？",
  "散場前，還有一點時間。"
];

const MALE_FIRST=["南","澤","凱","洛","然","嶼","昀","修","白","辰"];
const FEMALE_FIRST=["霧","沐","晴","安","夏","嵐","語","棠","澄","茉"];
const LAST_NAMES=["林","江","沈","周","陸","許","葉","唐","蘇","方"];
const AVATAR_SHEETS={
  male:["./assets/optimized/avatars/male-avatars-a.jpg","./assets/optimized/avatars/male-avatars-b-v2.jpg","./assets/optimized/avatars/male-avatars-c.jpg","./assets/optimized/avatars/male-avatars-d.jpg"],
  female:["./assets/optimized/avatars/female-avatars-a-v2.jpg","./assets/optimized/avatars/female-avatars-b.jpg","./assets/optimized/avatars/female-avatars-c.jpg","./assets/optimized/avatars/female-avatars-d.jpg"]
};

const PARTY_PEOPLE=["male","female"].flatMap(gender=>Array.from({length:100},(_,index)=>{
  const sheet=Math.floor(index/25);
  const tile=index%25;
  const first=gender==="male"?MALE_FIRST:FEMALE_FIRST;
  return{
    id:`${gender}-${index+1}`,
    name:`${LAST_NAMES[Math.floor(index/10)]}${first[index%10]}`,
    gender,
    image:AVATAR_SHEETS[gender][sheet],
    x:tile%5,
    y:Math.floor(tile/5)
  };
}));
