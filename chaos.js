const CHAOS_EVENT_CHANCE=.15;
const CHAOS_EVENTS=[
  {title:"DJ 把歌單倒著播",text:"整首情歌倒放，腦袋越聽越亂。",heat:6,anxiety:0},
  {title:"貓跳上吧台",text:"牠把所有人的杯墊推到地上，現場陷入一陣混亂。",heat:0,anxiety:7},
  {title:"外送送錯 80 杯珍奶",text:"你被迫協調飲料分配，完全沒空整理心情。",heat:4,anxiety:3},
  {title:"前任的歌突然響起",text:"DJ 不知道從哪挖出那首歌，氣氛瞬間尷尬。",heat:3,anxiety:5},
  {title:"扭蛋機吐出你的名字",text:"旁邊的人都在起鬨，你只想假裝沒看見。",heat:6,anxiety:2},
  {title:"舞台燈全打到你身上",text:"你莫名成了全場焦點。",heat:2,anxiety:6},
  {title:"派對遊戲抽到宇宙哲學題",text:"大家開始討論人生，你的腦袋更吵了。",heat:0,anxiety:8},
  {title:"手機自動播放語音備忘錄",text:"你手忙腳亂地按掉它，臉有點熱。",heat:7,anxiety:0},
  {title:"保全請你幫忙找失主",text:"你被臨時抓去處理一件完全不相干的事。",heat:4,anxiety:4},
  {title:"抽獎抽到一盆薄荷",text:"所有人都說這是命運暗示，只有你壓力更大。",heat:1,anxiety:6},
  {title:"大樓突然停電",text:"派對中斷，你錯過了下一輪換桌。",heat:4,anxiety:2,skip:true},
  {title:"試紙被珍奶淹沒",text:"桌面一陣手忙腳亂，唯一的試紙報銷了。",heat:1,anxiety:3,loseTest:true}
];
