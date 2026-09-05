import type { ChatScene } from '../types';

export const DIALOG_SCENES: Record<string, ChatScene> = {
  start: {
    id: 'start',
    messages: [
      { id: 'm1', sender: 'bot', text: '嗨 👋', emoji: '👋', delay: 500 },
      { id: 'm2', sender: 'bot', text: '我是卜桐乐', delay: 800 },
      { id: 'm3', sender: 'bot', text: '我们好像还不认识？', delay: 1200 },
    ],
    options: [
      { id: 'o1', text: '你好你好，想认识你一下', nextScene: 'friendly', mood: 'happy' },
      { id: 'o2', text: '嗯，听说你做了个自我介绍网页？', nextScene: 'curious', mood: 'curious' },
      { id: 'o3', text: '（已读不回）', nextScene: 'ignored', mood: 'shy' },
    ],
  },

  friendly: {
    id: 'friendly',
    messages: [
      { id: 'm1', sender: 'bot', text: '哈哈可以啊', emoji: '😄' },
      { id: 'm2', sender: 'bot', text: '那我先简单介绍一下自己' },
      { id: 'm3', sender: 'bot', text: '我叫卜桐乐，2008年8月25日出生的，来自湖南长沙' },
      { id: 'm4', sender: 'bot', text: 'MBTI是ENTP，虽然我也不太懂这到底什么意思...' },
    ],
    options: [
      { id: 'o1', text: '长沙！那岂不是经常吃好吃的', nextScene: 'changsha', mood: 'happy' },
      { id: 'o2', text: 'ENTP啊，听说很话痨（不是）', nextScene: 'mbti_reply', mood: 'curious' },
      { id: 'o3', text: '那你平时喜欢做什么？', nextScene: 'interests_menu', mood: 'curious' },
    ],
    collectFragment: 'name',
  },

  curious: {
    id: 'curious',
    messages: [
      { id: 'm1', sender: 'bot', text: '对啊，闲着没事做了一个', emoji: '😅' },
      { id: 'm2', sender: 'bot', text: '其实也不算很厉害的东西，就是觉得这样介绍自己比较有意思' },
      { id: 'm3', sender: 'bot', text: '总比发一段冷冰冰的文字强吧？' },
    ],
    options: [
      { id: 'o1', text: '确实挺有新意的', nextScene: 'friendly', mood: 'happy' },
      { id: 'o2', text: '那你自己是怎么的人？', nextScene: 'friendly', mood: 'curious' },
    ],
  },

  ignored: {
    id: 'ignored',
    messages: [
      { id: 'm1', sender: 'bot', text: '...', emoji: '😐' },
      { id: 'm2', sender: 'bot', text: '（对方正在输入...）', delay: 1500 },
      { id: 'm3', sender: 'bot', text: '好吧，那我继续说我的' },
      { id: 'm4', sender: 'bot', text: '我叫卜桐乐，08年的，长沙人' },
    ],
    options: [
      { id: 'o1', text: '哈哈抱歉刚才在忙', nextScene: 'friendly', mood: 'happy' },
      { id: 'o2', text: '继续继续，我在听', nextScene: 'interests_menu', mood: 'normal' },
    ],
  },

  changsha: {
    id: 'changsha',
    messages: [
      { id: 'm1', sender: 'bot', text: '那当然！长沙的茶颜悦色我强推', emoji: '🧋' },
      { id: 'm2', sender: 'bot', text: '不过来了大学之后好久没喝了...' },
      { id: 'm3', sender: 'bot', text: '说起来，你对什么比较感兴趣？' },
    ],
    options: [
      { id: 'o1', text: '想听听你的兴趣', nextScene: 'interests_menu', mood: 'curious' },
      { id: 'o2', text: '你先说你的吧', nextScene: 'interests_menu', mood: 'normal' },
    ],
    collectFragment: 'hometown',
  },

  mbti_reply: {
    id: 'mbti_reply',
    messages: [
      { id: 'm1', sender: 'bot', text: '？？？', emoji: '😤' },
      { id: 'm2', sender: 'bot', text: '我话不多好吧' },
      { id: 'm3', sender: 'bot', text: '...算了确实有点' },
      { id: 'm4', sender: 'bot', text: '咳咳，还是说点别的吧' },
    ],
    options: [
      { id: 'o1', text: '哈哈开玩笑的', nextScene: 'interests_menu', mood: 'happy' },
      { id: 'o2', text: '那你有什么爱好？', nextScene: 'interests_menu', mood: 'curious' },
    ],
    collectFragment: 'mbti',
  },

  interests_menu: {
    id: 'interests_menu',
    messages: [
      { id: 'm1', sender: 'bot', text: '我想想啊...', emoji: '🤔' },
      { id: 'm2', sender: 'bot', text: '我兴趣还挺杂的' },
      { id: 'm3', sender: 'bot', text: '你想听哪个？' },
    ],
    options: [
      { id: 'o1', text: '🎵 音乐', nextScene: 'music', mood: 'happy' },
      { id: 'o2', text: '🎬 电影', nextScene: 'movie', mood: 'curious' },
      { id: 'o3', text: '📸 摄影', nextScene: 'photo', mood: 'curious' },
      { id: 'o4', text: '✈️ 旅游', nextScene: 'travel', mood: 'happy' },
      { id: 'o5', text: '🎞️ 剪辑', nextScene: 'edit', mood: 'curious' },
      { id: 'o6', text: '💪 健身', nextScene: 'gym', mood: 'normal' },
      { id: 'o7', text: '🤖 AI', nextScene: 'ai', mood: 'curious' },
      { id: 'o8', text: '你还有什么别的特点吗？', nextScene: 'traits', mood: 'curious' },
    ],
  },

  music: {
    id: 'music',
    messages: [
      { id: 'm1', sender: 'bot', text: '音乐啊！', emoji: '🎧' },
      { id: 'm2', sender: 'bot', text: '最近听周杰伦和陶喆比较多' },
      { id: 'm3', sender: 'bot', text: '还有一些欧美 R&B' },
      { id: 'm4', sender: 'bot', text: '不过我的歌单其实很杂，什么类型都听一点' },
    ],
    options: [
      { id: 'o1', text: '有推荐的吗？', nextScene: 'music_rec', mood: 'curious' },
      { id: 'o2', text: '听说你最近在研究别的？', nextScene: 'interests_menu', mood: 'curious' },
      { id: 'o3', text: '聊聊别的兴趣吧', nextScene: 'interests_menu', mood: 'normal' },
    ],
    collectFragment: 'music',
  },

  music_rec: {
    id: 'music_rec',
    messages: [
      { id: 'm1', sender: 'bot', text: '推荐啊...', emoji: '🤔' },
      { id: 'm2', sender: 'bot', text: '陶喆的《普通朋友》吧' },
      { id: 'm3', sender: 'bot', text: '虽然这首歌已经二十多年了' },
      { id: 'm4', sender: 'bot', text: '但真的很好听' },
    ],
    options: [
      { id: 'o1', text: '收到，我去听听', nextScene: 'interests_menu', mood: 'happy' },
      { id: 'o2', text: '还有别的兴趣吗？', nextScene: 'interests_menu', mood: 'curious' },
    ],
  },

  movie: {
    id: 'movie',
    messages: [
      { id: 'm1', sender: 'bot', text: '电影！', emoji: '🎬' },
      { id: 'm2', sender: 'bot', text: '我什么类型都看，但比较偏爱那种有反转的' },
      { id: 'm3', sender: 'bot', text: '或者画面特别好看的' },
      { id: 'm4', sender: 'bot', text: '不过最近忙，好久没进电影院了...' },
    ],
    options: [
      { id: 'o1', text: '最近有想看的吗？', nextScene: 'movie_want', mood: 'curious' },
      { id: 'o2', text: '聊聊别的吧', nextScene: 'interests_menu', mood: 'normal' },
    ],
    collectFragment: 'movie',
  },

  movie_want: {
    id: 'movie_want',
    messages: [
      { id: 'm1', sender: 'bot', text: '想看的挺多的', emoji: '😅' },
      { id: 'm2', sender: 'bot', text: '但最近一直在写作业和做东西' },
      { id: 'm3', sender: 'bot', text: '等有空了一定去补' },
    ],
    options: [
      { id: 'o1', text: '学业重要', nextScene: 'interests_menu', mood: 'normal' },
      { id: 'o2', text: '那你平时怎么放松？', nextScene: 'interests_menu', mood: 'curious' },
    ],
  },

  photo: {
    id: 'photo',
    messages: [
      { id: 'm1', sender: 'bot', text: '摄影！', emoji: '📸' },
      { id: 'm2', sender: 'bot', text: '其实我还不算很会拍' },
      { id: 'm3', sender: 'bot', text: '就是喜欢随手记录一下' },
      { id: 'm4', sender: 'bot', text: '看到好看的云、奇怪的光影、或者朋友很傻的瞬间' },
      { id: 'm5', sender: 'bot', text: '都会想拍下来' },
    ],
    options: [
      { id: 'o1', text: '有拍过满意的作品吗？', nextScene: 'photo_work', mood: 'curious' },
      { id: 'o2', text: '挺有意思的', nextScene: 'interests_menu', mood: 'happy' },
    ],
    collectFragment: 'photo',
  },

  photo_work: {
    id: 'photo_work',
    messages: [
      { id: 'm1', sender: 'bot', text: '满意的作品...', emoji: '😳' },
      { id: 'm2', sender: 'bot', text: '目前好像还没有特别满意的' },
      { id: 'm3', sender: 'bot', text: '但拍的过程本身就很开心' },
      { id: 'm4', sender: 'bot', text: '也许以后会有吧' },
    ],
    options: [
      { id: 'o1', text: '期待你的作品', nextScene: 'interests_menu', mood: 'happy' },
      { id: 'o2', text: '聊聊别的', nextScene: 'interests_menu', mood: 'normal' },
    ],
  },

  travel: {
    id: 'travel',
    messages: [
      { id: 'm1', sender: 'bot', text: '旅游！', emoji: '✈️' },
      { id: 'm2', sender: 'bot', text: '我其实去过的地方不算多' },
      { id: 'm3', sender: 'bot', text: '但很喜欢那种"在路上的感觉"' },
      { id: 'm4', sender: 'bot', text: '大学想趁假期多出去走走' },
      { id: 'm5', sender: 'bot', text: '想看海，也想去西北看沙漠' },
    ],
    options: [
      { id: 'o1', text: '有具体计划吗？', nextScene: 'travel_plan', mood: 'curious' },
      { id: 'o2', text: '我也想旅游', nextScene: 'interests_menu', mood: 'happy' },
    ],
    collectFragment: 'travel',
  },

  travel_plan: {
    id: 'travel_plan',
    messages: [
      { id: 'm1', sender: 'bot', text: '计划啊...', emoji: '😅' },
      { id: 'm2', sender: 'bot', text: '目前还没有' },
      { id: 'm3', sender: 'bot', text: '我就是那种想到什么就做什么的人' },
      { id: 'm4', sender: 'bot', text: '可能某天突然就决定买票走了' },
    ],
    options: [
      { id: 'o1', text: '说走就走的旅行', nextScene: 'interests_menu', mood: 'happy' },
      { id: 'o2', text: '那你平时会做计划吗？', nextScene: 'traits', mood: 'curious' },
    ],
  },

  edit: {
    id: 'edit',
    messages: [
      { id: 'm1', sender: 'bot', text: '剪辑啊...', emoji: '🎞️' },
      { id: 'm2', sender: 'bot', text: '这个我还在学' },
      { id: 'm3', sender: 'bot', text: '目前的水平大概是...能把自己剪晕' },
      { id: 'm4', sender: 'bot', text: '但挺有意思的，把一个素材慢慢剪成想要的样子' },
      { id: 'm5', sender: 'bot', text: '有种拼图的感觉' },
    ],
    options: [
      { id: 'o1', text: '自学还是报课？', nextScene: 'edit_learn', mood: 'curious' },
      { id: 'o2', text: '听起来挺有耐心', nextScene: 'interests_menu', mood: 'happy' },
    ],
    collectFragment: 'edit',
  },

  edit_learn: {
    id: 'edit_learn',
    messages: [
      { id: 'm1', sender: 'bot', text: '自学的', emoji: '😅' },
      { id: 'm2', sender: 'bot', text: '看 B 站教程，边看边做' },
      { id: 'm3', sender: 'bot', text: '剪坏了就重新来' },
      { id: 'm4', sender: 'bot', text: '反正素材可以重来，人生不能' },
    ],
    options: [
      { id: 'o1', text: '说得好', nextScene: 'interests_menu', mood: 'happy' },
      { id: 'o2', text: '那你挺有毅力的', nextScene: 'traits', mood: 'curious' },
    ],
  },

  gym: {
    id: 'gym',
    messages: [
      { id: 'm1', sender: 'bot', text: '健身！', emoji: '💪' },
      { id: 'm2', sender: 'bot', text: '其实也没有很专业' },
      { id: 'm3', sender: 'bot', text: '就是每周抽时间去动一动' },
      { id: 'm4', sender: 'bot', text: '出点汗，心情会好很多' },
    ],
    options: [
      { id: 'o1', text: '坚持多久了？', nextScene: 'gym_time', mood: 'curious' },
      { id: 'o2', text: '我也该运动了', nextScene: 'interests_menu', mood: 'happy' },
    ],
    collectFragment: 'gym',
  },

  gym_time: {
    id: 'gym_time',
    messages: [
      { id: 'm1', sender: 'bot', text: '断断续续的', emoji: '😅' },
      { id: 'm2', sender: 'bot', text: '有时候忙起来就忘了' },
      { id: 'm3', sender: 'bot', text: '但确实坚持运动会让人状态变好' },
      { id: 'm4', sender: 'bot', text: '你也试试？' },
    ],
    options: [
      { id: 'o1', text: '好，下次一起去？', nextScene: 'interests_menu', mood: 'happy' },
      { id: 'o2', text: '看情况吧', nextScene: 'interests_menu', mood: 'normal' },
    ],
  },

  ai: {
    id: 'ai',
    messages: [
      { id: 'm1', sender: 'bot', text: 'AI 啊', emoji: '🤖' },
      { id: 'm2', sender: 'bot', text: '最近确实在研究这个' },
      { id: 'm3', sender: 'bot', text: '其实不算很懂，还在摸索阶段' },
      { id: 'm4', sender: 'bot', text: '但感觉 AI 挺有意思的' },
      { id: 'm5', sender: 'bot', text: '可以做一些以前做不到的东西' },
    ],
    options: [
      { id: 'o1', text: '比如呢？', nextScene: 'ai_example', mood: 'curious' },
      { id: 'o2', text: '以后想往这方面发展吗？', nextScene: 'ai_future', mood: 'curious' },
    ],
    collectFragment: 'ai',
  },

  ai_example: {
    id: 'ai_example',
    messages: [
      { id: 'm1', sender: 'bot', text: '比如...', emoji: '🤔' },
      { id: 'm2', sender: 'bot', text: '这个网页就是我用 AI 帮忙做的' },
      { id: 'm3', sender: 'bot', text: '虽然最后还是要自己改很多' },
      { id: 'm4', sender: 'bot', text: '但没有 AI 的话我可能做不出来' },
    ],
    options: [
      { id: 'o1', text: '那你还挺厉害的', nextScene: 'interests_menu', mood: 'happy' },
      { id: 'o2', text: 'AI 确实改变了好多东西', nextScene: 'interests_menu', mood: 'normal' },
    ],
  },

  ai_future: {
    id: 'ai_future',
    messages: [
      { id: 'm1', sender: 'bot', text: '未来吗...', emoji: '🤔' },
      { id: 'm2', sender: 'bot', text: '还没想好' },
      { id: 'm3', sender: 'bot', text: '但希望可以用 AI 做一些自己喜欢的东西' },
      { id: 'm4', sender: 'bot', text: '具体是什么，以后告诉你吧' },
    ],
    options: [
      { id: 'o1', text: '期待', nextScene: 'interests_menu', mood: 'happy' },
      { id: 'o2', text: '行，保留悬念', nextScene: 'interests_menu', mood: 'normal' },
    ],
  },

  traits: {
    id: 'traits',
    messages: [
      { id: 'm1', sender: 'bot', text: '我的特点啊...', emoji: '🤔' },
      { id: 'm2', sender: 'bot', text: '让我想想怎么描述' },
      { id: 'm3', sender: 'bot', text: '优点的话，想象力还算可以吧' },
      { id: 'm4', sender: 'bot', text: '脑子里经常蹦出一些奇怪的想法' },
      { id: 'm5', sender: 'bot', text: '缺点的话...比较随心所欲' },
      { id: 'm6', sender: 'bot', text: '想到什么就做什么，经常三分钟热度' },
    ],
    options: [
      { id: 'o1', text: '想象力丰富挺好的', nextScene: 'traits_good', mood: 'happy' },
      { id: 'o2', text: '三分钟热度怎么办？', nextScene: 'traits_bad', mood: 'curious' },
      { id: 'o3', text: '那你大学有什么打算？', nextScene: 'college', mood: 'curious' },
    ],
    collectFragment: 'imagination',
  },

  traits_good: {
    id: 'traits_good',
    messages: [
      { id: 'm1', sender: 'bot', text: '是吧！', emoji: '✨' },
      { id: 'm2', sender: 'bot', text: '我也觉得想东西比较好玩' },
      { id: 'm3', sender: 'bot', text: '关键是能不能把想法做出来' },
      { id: 'm4', sender: 'bot', text: '这个我还在努力' },
    ],
    options: [
      { id: 'o1', text: '已经在做了，很厉害了', nextScene: 'interests_menu', mood: 'happy' },
      { id: 'o2', text: '大学期待聊聊吗？', nextScene: 'college', mood: 'curious' },
    ],
    collectFragment: 'random',
  },

  traits_bad: {
    id: 'traits_bad',
    messages: [
      { id: 'm1', sender: 'bot', text: '怎么办...', emoji: '😅' },
      { id: 'm2', sender: 'bot', text: '可能需要一个能管得住我的人吧' },
      { id: 'm3', sender: 'bot', text: '或者自己慢慢改' },
      { id: 'm4', sender: 'bot', text: '但这个估计挺难的' },
    ],
    options: [
      { id: 'o1', text: '慢慢来', nextScene: 'interests_menu', mood: 'normal' },
      { id: 'o2', text: '聊聊大学计划？', nextScene: 'college', mood: 'curious' },
    ],
  },

  college: {
    id: 'college',
    messages: [
      { id: 'm1', sender: 'bot', text: '大学四年啊', emoji: '🎓' },
      { id: 'm2', sender: 'bot', text: '希望认识很多有趣的人' },
      { id: 'm3', sender: 'bot', text: '学点课本之外的东西' },
      { id: 'm4', sender: 'bot', text: '还想创造一些自己喜欢的东西' },
      { id: 'm5', sender: 'bot', text: '不只是学习，也想和身边的人一起开心' },
    ],
    options: [
      { id: 'o1', text: '听起来很不错', nextScene: 'ending', mood: 'happy' },
      { id: 'o2', text: '还有别的期待吗？', nextScene: 'college_more', mood: 'curious' },
    ],
  },

  college_more: {
    id: 'college_more',
    messages: [
      { id: 'm1', sender: 'bot', text: '别的期待...', emoji: '🤔' },
      { id: 'm2', sender: 'bot', text: '有的，但现在说太早了' },
      { id: 'm3', sender: 'bot', text: '四年很长，慢慢来吧' },
    ],
    options: [
      { id: 'o1', text: '说得对', nextScene: 'ending', mood: 'happy' },
      { id: 'o2', text: '那就先这样吧', nextScene: 'ending', mood: 'normal' },
    ],
  },

  ending: {
    id: 'ending',
    messages: [
      { id: 'm1', sender: 'bot', text: '聊了这么多', emoji: '😊' },
      { id: 'm2', sender: 'bot', text: '你应该对我有一点了解了吧' },
      { id: 'm3', sender: 'bot', text: '但说实话，聊天能了解的也就这么多了' },
      { id: 'm4', sender: 'bot', text: '真正认识一个人，还是需要时间' },
      { id: 'm5', sender: 'bot', text: '以后有机会再慢慢聊吧' },
      { id: 'm6', sender: 'bot', text: '我是卜桐乐，来自湖南长沙' },
      { id: 'm7', sender: 'bot', text: '喜欢健身、音乐、电影、摄影、旅游、剪辑' },
      { id: 'm8', sender: 'bot', text: '还在研究 AI，想象力丰富，有点随心所欲' },
      { id: 'm9', sender: 'bot', text: '希望大学四年能认识你这样的朋友' },
      { id: 'm10', sender: 'bot', text: '剩下的，以后慢慢磨合吧' },
      { id: 'm11', sender: 'bot', text: '下次见 👋', emoji: '👋' },
    ],
    options: [
      { id: 'o1', text: '下次见！', nextScene: 'bye', mood: 'happy' },
      { id: 'o2', text: '继续聊', nextScene: 'interests_menu', mood: 'happy' },
    ],
  },

  bye: {
    id: 'bye',
    messages: [
      { id: 'm1', sender: 'bot', text: '（对方已下线）', emoji: '🌙' },
    ],
    options: [],
  },
};
