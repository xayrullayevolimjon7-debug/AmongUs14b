require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { connectDB } = require('./config/db');
const Word = require('./models/Word');
const gm = require('./game/gameManager');
const scoreManager = require('./game/scoreManager');
const wordMatch = require('./game/wordMatch');

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_IDS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number);

// Shuncha ball to'plagan o'yinchi impostor bo'lganda so'zning bosh harfini ko'radi
const HINT_UNLOCK_SCORE = Number(process.env.HINT_UNLOCK_SCORE || 5);
// Impostor so'zni taxmin qilganda kerak bo'ladigan minimal o'xshashlik (0-1 oralig'ida)
const GUESS_THRESHOLD = Number(process.env.GUESS_THRESHOLD || 0.6);

function displayName(from) {
  return from.username ? `@${from.username}` : from.first_name || 'Foydalanuvchi';
}

function isGroup(ctx) {
  return ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
}

function lobbyText(game) {
  const names = [...game.players.values()].map((p) => `• ${p.name}`).join('\n');
  return (
    `🕵️ *Shpionni top* — o'yinchilar yig'ilmoqda\n\n` +
    `Qatnashuvchilar (${game.players.size}/${gm.MIN_PLAYERS}+):\n${names}\n\n` +
    `Kamida ${gm.MIN_PLAYERS} kishi kerak. Qo'shilish uchun tugmani bosing.`
  );
}

function lobbyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Qo\'shilish', 'join_lobby'), Markup.button.callback('🚪 Chiqish', 'leave_lobby')],
    [Markup.button.callback('▶️ O\'yinni boshlash', 'start_game')],
  ]);
}

// ---------- /yangioyin: lobi ochish ----------
bot.command('yangioyin', async (ctx) => {
  if (!isGroup(ctx)) {
    return ctx.reply('Bu buyruq faqat guruhda ishlaydi. Botni guruhga qo\'shing va shu yerda ishga tushiring.');
  }
  const existing = gm.getGame(ctx.chat.id);
  if (existing) {
    return ctx.reply('Bu guruhda allaqachon faol o\'yin bor. Uni tugatish uchun /bekor buyrug\'ini yuboring.');
  }
  const game = gm.createLobby(ctx.chat.id, ctx.from.id, displayName(ctx.from));
  const msg = await ctx.reply(lobbyText(game), { parse_mode: 'Markdown', ...lobbyKeyboard() });
  game.lobbyMessageId = msg.message_id;
});

async function refreshLobby(ctx, game) {
  try {
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      game.lobbyMessageId,
      undefined,
      lobbyText(game),
      { parse_mode: 'Markdown', ...lobbyKeyboard() }
    );
  } catch (e) {
    // xabar o'zgarmagan bo'lishi mumkin, e'tiborsiz qoldiramiz
  }
}

bot.action('join_lobby', async (ctx) => {
  const game = gm.getGame(ctx.chat.id);
  if (!game || game.status !== 'lobby') return ctx.answerCbQuery('Faol lobi topilmadi.');
  gm.addPlayer(ctx.chat.id, ctx.from.id, displayName(ctx.from));
  await ctx.answerCbQuery('Qo\'shildingiz!');
  await refreshLobby(ctx, game);
});

bot.action('leave_lobby', async (ctx) => {
  const game = gm.getGame(ctx.chat.id);
  if (!game || game.status !== 'lobby') return ctx.answerCbQuery('Faol lobi topilmadi.');
  gm.removePlayer(ctx.chat.id, ctx.from.id);
  await ctx.answerCbQuery('Chiqdingiz.');
  await refreshLobby(ctx, game);
});

// ---------- O'yinni boshlash ----------
bot.action('start_game', async (ctx) => {
  const game = gm.getGame(ctx.chat.id);
  if (!game || game.status !== 'lobby') return ctx.answerCbQuery('Faol lobi topilmadi.');
  if (ctx.from.id !== game.hostId) return ctx.answerCbQuery('Faqat o\'yinni boshlagan kishi shuni bosa oladi.');
  if (!gm.canStart(game)) return ctx.answerCbQuery(`Kamida ${gm.MIN_PLAYERS} o'yinchi kerak.`);

  await ctx.answerCbQuery();

  const count = await Word.countDocuments();
  if (count === 0) {
    return ctx.reply('So\'zlar ombori bo\'sh! Botga shaxsiy xabarda /sozqosh <so\'z> orqali so\'z qo\'shing.');
  }
  const [randomWord] = await Word.aggregate([{ $sample: { size: 1 } }]);

  await beginRound(ctx, game, ctx.chat.id, randomWord.text);
});

async function beginRound(ctx, game, chatId, word) {
  const playerIds = [...game.players.keys()];
  const impostorId = playerIds[Math.floor(Math.random() * playerIds.length)];
  const impostorScore = await scoreManager.getScore(chatId, impostorId);
  const hintLetter = impostorScore >= HINT_UNLOCK_SCORE ? word[0] : null;

  gm.startRound(game, word, impostorId, hintLetter);

  const failedUsers = [];
  for (const player of game.players.values()) {
    const isImpostor = player.id === game.impostorId;
    let text;
    if (isImpostor) {
      text = '🎭 Siz *IMPOSTOR*siz! Yashirin so\'zni bilmaysiz.\n\n' +
        'Boshqalar aytayotgan sifatlarni tinglab, mos sifat ayting va o\'zingizni fosh qilmang.\n' +
        'Taxmin qilmoqchi bo\'lsangiz, menga shu yerda (shaxsiy chatda) /taxmin <so\'z> deb yozing — ' +
        `imlo xato bo\'lsa ham, taxminan to\'g\'ri bo\'lsa yetarli. Har aylanada faqat ${gm.MAX_GUESSES_PER_ROUND} marta urinish huquqingiz bor.`;
      if (hintLetter) {
        text += `\n\n💡 Ballaringiz yetarli bo'lgani uchun maslahat: so'z "*${hintLetter}*" harfi bilan boshlanadi.`;
      }
    } else {
      text = `🔑 Yashirin so'z: *${game.word}*\n\n` +
        'Impostorni bilib qolmaslik uchun to\'g\'ridan-to\'g\'ri so\'zni aytmang — faqat unga tegishli sifatlarni ayting.';
    }
    try {
      await ctx.telegram.sendMessage(player.id, text, { parse_mode: 'Markdown' });
    } catch (e) {
      failedUsers.push(player.name);
    }
  }

  if (failedUsers.length > 0) {
    gm.endGame(chatId);
    return ctx.telegram.sendMessage(
      chatId,
      `⚠️ Quyidagi o'yinchilarga shaxsiy xabar yubora olmadim: ${failedUsers.join(', ')}\n` +
      `Ular botga shaxsiy ravishda /start bosishi kerak. O'yin bekor qilindi, qaytadan /yangioyin bilan boshlang.`
    );
  }

  const firstPlayer = game.players.get(gm.currentTurnPlayerId(game));
  const order = game.turnOrder.map((id) => game.players.get(id).name).join(' → ');
  await ctx.telegram.sendMessage(
    chatId,
    `🎬 O'yin boshlandi! Har bir o'yinchiga shaxsiy xabarda so'z (yoki impostor holati) yuborildi.\n\n` +
    `Navbat tartibi:\n${order}\n\n` +
    `Har kim navbati bilan guruhda so'zga tegishli bitta sifat aytadi. ` +
    `${gm.ROUNDS_BEFORE_VOTE} marta to'liq aylanadan so'ng ovoz berish avtomatik boshlanadi.\n\n` +
    `➡️ Boshlaymiz! Navbat: *${firstPlayer.name}*`,
    { parse_mode: 'Markdown' }
  );
}

// ---------- Navbat va sifatlarni kuzatish ----------
bot.on('text', async (ctx, next) => {
  if (!isGroup(ctx)) return next();
  const text = ctx.message.text || '';
  if (text.startsWith('/')) return next(); // buyruqlar alohida ishlanadi

  const game = gm.getGame(ctx.chat.id);
  if (!game || game.status !== 'in_progress') return next();

  const expectedId = gm.currentTurnPlayerId(game);
  if (ctx.from.id !== expectedId) return next(); // navbat unga emas — e'tiborsiz qoldiramiz

  const { wrapped } = gm.advanceTurn(game);

  if (gm.shouldAutoVote(game)) {
    await startAutoVoting(ctx, game, ctx.chat.id);
    return;
  }

  const nextPlayer = game.players.get(gm.currentTurnPlayerId(game));
  const roundNote = wrapped ? ` (${game.round}-aylana boshlandi)` : '';
  await ctx.reply(`✅ Qabul qilindi. Navbat: *${nextPlayer.name}*${roundNote}`, { parse_mode: 'Markdown' });
});

async function startAutoVoting(ctx, game, chatId) {
  gm.startVoting(game);
  const buttons = game.turnOrder.map((id) =>
    Markup.button.callback(game.players.get(id).name, `vote_${id}`)
  );
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));

  await ctx.telegram.sendMessage(
    chatId,
    `🗳 ${gm.ROUNDS_BEFORE_VOTE} marta to'liq aylana yakunlandi! Ovoz berish boshlandi.\n` +
    `Sizningcha kim IMPOSTOR? Pastdagi tugmalardan birini bosing.`,
    Markup.inlineKeyboard(rows)
  );
}

bot.action(/vote_(\d+)/, async (ctx) => {
  const game = gm.getGame(ctx.chat.id);
  if (!game || game.status !== 'voting') return ctx.answerCbQuery('Ovoz berish faol emas.');
  if (!game.turnOrder.includes(ctx.from.id)) return ctx.answerCbQuery('Siz bu bosqichda ovoz bera olmaysiz.');

  const targetId = Number(ctx.match[1]);
  const ok = gm.castVote(game, ctx.from.id, targetId);
  if (!ok) return ctx.answerCbQuery('Noto\'g\'ri ovoz.');
  await ctx.answerCbQuery('Ovozingiz qabul qilindi!');

  if (gm.allVoted(game)) {
    await resolveVoting(ctx, game, ctx.chat.id);
  }
});

async function resolveVoting(ctx, game, chatId) {
  const { topId, counts } = gm.tallyVotes(game);
  const breakdown = [...counts.entries()]
    .map(([id, c]) => `${game.players.get(id).name}: ${c} ovoz`)
    .join('\n');

  if (topId === game.impostorId) {
    // Jamoa g'alabasi
    const winners = game.turnOrder.filter((id) => id !== game.impostorId);
    for (const id of winners) {
      const p = game.players.get(id);
      await scoreManager.addScore(chatId, id, p.name, 1);
    }
    await ctx.telegram.sendMessage(
      chatId,
      `📊 Ovozlar:\n${breakdown}\n\n` +
      `✅ To'g'ri topildi! ${game.players.get(topId).name} haqiqatan ham IMPOSTOR edi.\n` +
      `🔑 Yashirin so'z: *${game.word}*\n\n` +
      `🏆 Jamoa g'alaba qozondi! Har bir a'zoga +1 ball.\n\nYangi o'yin uchun /yangioyin.`,
      { parse_mode: 'Markdown' }
    );
    gm.endGame(chatId);
    return;
  }

  // Noto'g'ri odam chiqarildi
  const eliminatedPlayer = game.players.get(topId);
  gm.eliminatePlayer(game, topId);

  if (gm.impostorLostByEliminations(game) || gm.onlyImpostorLeft(game)) {
    const impostor = game.players.get(game.impostorId);
    await scoreManager.addScore(chatId, impostor.id, impostor.name, 3);
    await ctx.telegram.sendMessage(
      chatId,
      `📊 Ovozlar:\n${breakdown}\n\n` +
      `❌ Noto'g'ri! ${eliminatedPlayer.name} impostor emas edi, u o'yindan chiqarildi.\n` +
      `${gm.WRONG_ELIMINATIONS_TO_LOSE} marta noto'g'ri chiqarish ro'y berdi — ` +
      `🎭 IMPOSTOR (${impostor.name}) G'ALABA QOZONDI!\n` +
      `🔑 Yashirin so'z: *${game.word}*\n\n+3 ball ${impostor.name}ga.\n\nYangi o'yin uchun /yangioyin.`,
      { parse_mode: 'Markdown' }
    );
    gm.endGame(chatId);
    return;
  }

  // O'yin davom etadi
  gm.resetForNextCycle(game);
  game.status = 'in_progress';
  const nextPlayer = game.players.get(gm.currentTurnPlayerId(game));
  await ctx.telegram.sendMessage(
    chatId,
    `📊 Ovozlar:\n${breakdown}\n\n` +
    `❌ Noto'g'ri! ${eliminatedPlayer.name} impostor emas edi, u o'yindan chiqarildi va endi qatnashmaydi.\n` +
    `O'yin davom etadi (${game.wrongEliminations}/${gm.WRONG_ELIMINATIONS_TO_LOSE} noto'g'ri chiqarish).\n\n` +
    `➡️ Yangi aylana boshlanadi. Navbat: *${nextPlayer.name}*`,
    { parse_mode: 'Markdown' }
  );
}

// ---------- Impostor so'zni taxmin qilishi (shaxsiy chatda) ----------
bot.command('taxmin', async (ctx) => {
  if (ctx.chat.type !== 'private') {
    return ctx.reply('Bu buyruqni menga shaxsiy xabarda yuboring (guruhda emas), sirni saqlash uchun.');
  }
  const found = gm.findGameByImpostor(ctx.from.id);
  if (!found) return ctx.reply('Siz hozir hech qanday faol o\'yinda IMPOSTOR emassiz.');

  const guess = ctx.message.text.replace(/^\/taxmin(@\w+)?\s*/i, '').trim();
  if (!guess) return ctx.reply('Foydalanish: /taxmin <so\'z>\nMasalan: /taxmin galaba');

  const { chatId, game } = found;

  if (!gm.canGuess(game)) {
    return ctx.reply(
      `⛔️ Bu aylanada urinishlaringiz tugadi (har aylanada ${gm.MAX_GUESSES_PER_ROUND} marta). ` +
      `Keyingi aylanagacha kuting.`
    );
  }
  gm.recordGuessAttempt(game);

  if (wordMatch.isCloseMatch(guess, game.word, GUESS_THRESHOLD)) {
    await scoreManager.addScore(chatId, ctx.from.id, displayName(ctx.from), 3);
    await ctx.reply(`🎉 To'g'ri topdingiz! Yashirin so'z: "${game.word}" edi. IMPOSTOR sifatida g'alaba qozondingiz!`);
    await ctx.telegram.sendMessage(
      chatId,
      `🎭 IMPOSTOR (${displayName(ctx.from)}) yashirin so'zni to'g'ri taxmin qildi va G'ALABA QOZONDI!\n` +
      `🔑 Yashirin so'z: *${game.word}*\n\n+3 ball ${displayName(ctx.from)}ga.\n\nYangi o'yin uchun /yangioyin.`,
      { parse_mode: 'Markdown' }
    );
    gm.endGame(chatId);
  } else {
    const left = gm.remainingGuesses(game);
    await ctx.reply(
      `❌ Yo'q, bu so'z emas. Shu aylanada yana ${left} marta urinish huquqingiz bor.`
    );
  }
});

// ---------- O'yinni bekor qilish ----------
bot.command('bekor', (ctx) => {
  const game = gm.getGame(ctx.chat.id);
  if (!game) return ctx.reply('Faol o\'yin yo\'q.');
  if (ctx.from.id !== game.hostId) return ctx.reply('Faqat o\'yinni boshlagan kishi uni bekor qila oladi.');
  gm.endGame(ctx.chat.id);
  ctx.reply('O\'yin bekor qilindi.');
});

// ---------- Reyting ----------
bot.command('reyting', async (ctx) => {
  if (!isGroup(ctx)) return ctx.reply('Reytingni guruhda ko\'ring.');
  const top = await scoreManager.topScores(ctx.chat.id, 10);
  if (!top.length) return ctx.reply('Hali hech kim ball to\'plamagan.');
  const lines = top.map((s, i) => `${i + 1}. ${s.name} — ${s.score} ball`).join('\n');
  ctx.reply(`🏆 Reyting:\n${lines}`);
});

// ---------- So'zlar ombori bilan ishlash ----------
bot.command('sozqosh', async (ctx) => {
  const isPrivate = ctx.chat.type === 'private';
  if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('So\'z qo\'shish faqat adminlarga ruxsat etilgan.');
  }
  const text = ctx.message.text.replace(/^\/sozqosh(@\w+)?\s*/i, '').trim();
  if (!text) {
    return ctx.reply(
      isPrivate
        ? 'Foydalanish: /sozqosh <so\'z>\nMasalan: /sozqosh Muzqaymoq'
        : 'Foydalanish: /sozqosh <so\'z>\n(Iltimos, botga shaxsiy xabarda yuboring: bu guruhni spamlamaydi)'
    );
  }
  try {
    await Word.create({ text, addedBy: ctx.from.id, addedByName: displayName(ctx.from) });
    ctx.reply(`✅ "${text}" so'zlar omboriga qo'shildi.`);
  } catch (e) {
    if (e.code === 11000) {
      ctx.reply('Bu so\'z allaqachon omborda bor.');
    } else {
      console.error(e);
      ctx.reply('Xatolik yuz berdi, qaytadan urinib ko\'ring.');
    }
  }
});

bot.command('sozlar', async (ctx) => {
  const count = await Word.countDocuments();
  ctx.reply(`📚 Hozircha ombordagi so'zlar soni: ${count}`);
});

bot.command('start', (ctx) => {
  ctx.reply(
    '👋 Assalomu alaykum! Men "Shpionni top" o\'yin botiman.\n\n' +
    'Guruhda /yangioyin buyrug\'i bilan lobi oching, do\'stlaringizni qo\'shing va o\'ynang!\n' +
    'Menga shaxsiy xabarda /sozqosh <so\'z> orqali yashirin so\'zlar bazasiga so\'z qo\'shishingiz mumkin.\n\n' +
    '/yordam — barcha buyruqlar va o\'yin qoidalari'
  );
});

bot.help((ctx) => {
  ctx.reply(
    'Buyruqlar:\n' +
    '/yangioyin — guruhda yangi o\'yin lobisi ochish\n' +
    `/taxmin <so\'z> — (faqat impostor, shaxsiy chatda) yashirin so\'zni taxmin qilish (aylanada ${gm.MAX_GUESSES_PER_ROUND} marta)\n` +
    '/bekor — (host) faol o\'yinni bekor qilish\n' +
    '/reyting — guruh bo\'yicha ballar reytingi\n' +
    '/sozqosh <so\'z> — yashirin so\'zlar omboriga so\'z qo\'shish (shaxsiy chatda)\n' +
    '/sozlar — ombordagi so\'zlar sonini ko\'rish\n\n' +
    `Qoidalar:\n` +
    `• ${gm.MIN_PLAYERS}+ o'yinchi kerak.\n` +
    `• ${gm.ROUNDS_BEFORE_VOTE} marta to'liq aylanadan keyin ovoz berish AVTOMATIK boshlanadi.\n` +
    `• Noto'g'ri odam chiqarilsa, o'yin davom etadi. ${gm.WRONG_ELIMINATIONS_TO_LOSE} marta noto'g'ri chiqarilsa — impostor yutadi.\n` +
    `• Impostor har aylanada ${gm.MAX_GUESSES_PER_ROUND} martagacha /taxmin bilan so'zni topishga urinishi mumkin.\n` +
    `• Jamoa yoki impostor g'alaba qilsa — mos ravishda ball oladi.\n` +
    `• ${HINT_UNLOCK_SCORE}+ ball to'plagan o'yinchi impostor bo'lganda so'zning bosh harfini ko'radi.`
  );
});

async function main() {
  await connectDB();
  await bot.launch();
  console.log('🚀 Bot ishga tushdi (long polling)');
}

main().catch((e) => {
  console.error('Botni ishga tushirishda xatolik:', e);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
