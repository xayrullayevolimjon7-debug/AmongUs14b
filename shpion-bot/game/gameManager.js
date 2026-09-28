// Har bir guruh (chatId) uchun o'yin holatini xotirada saqlaydi.

const MIN_PLAYERS = 3;
const ROUNDS_BEFORE_VOTE = 3; // shuncha to'liq aylanadan keyin avtomatik ovoz boshlanadi
const WRONG_ELIMINATIONS_TO_LOSE = 3; // shuncha noto'g'ri chiqarishdan keyin impostor yutadi
const MAX_GUESSES_PER_ROUND = 2; // impostor har bir aylanada shuncha marta so'zni taxmin qila oladi

/** @type {Map<number, object>} */
const games = new Map();

function createLobby(chatId, hostId, hostName) {
  const game = {
    status: 'lobby', // lobby | in_progress | voting | finished
    hostId,
    players: new Map(), // userId -> { id, name } — barcha original o'yinchilar
    word: null,
    impostorId: null,
    hintLetter: null, // agar impostor yetarlicha ball to'plagan bo'lsa, bosh harf
    turnOrder: [], // faol (hali chiqarilmagan) o'yinchilar tartibi
    turnIndex: 0,
    round: 1,
    eliminated: new Set(),
    wrongEliminations: 0,
    votes: new Map(), // voterId -> votedForId
    lobbyMessageId: null,
    guessAttemptsThisRound: 0, // impostor shu aylanada nechta taxmin qilgan
  };
  game.players.set(hostId, { id: hostId, name: hostName });
  games.set(chatId, game);
  return game;
}

function getGame(chatId) {
  return games.get(chatId);
}

function endGame(chatId) {
  games.delete(chatId);
}

function findGameByImpostor(userId) {
  for (const [chatId, game] of games.entries()) {
    if (
      game.impostorId === userId &&
      (game.status === 'in_progress' || game.status === 'voting')
    ) {
      return { chatId, game };
    }
  }
  return null;
}

function addPlayer(chatId, userId, name) {
  const game = games.get(chatId);
  if (!game || game.status !== 'lobby') return null;
  if (!game.players.has(userId)) {
    game.players.set(userId, { id: userId, name });
  }
  return game;
}

function removePlayer(chatId, userId) {
  const game = games.get(chatId);
  if (!game || game.status !== 'lobby') return null;
  game.players.delete(userId);
  return game;
}

function canStart(game) {
  return game && game.status === 'lobby' && game.players.size >= MIN_PLAYERS;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function startRound(game, word, impostorId, hintLetter = null) {
  const playerIds = [...game.players.keys()];
  game.word = word;
  game.impostorId = impostorId;
  game.hintLetter = hintLetter;
  game.turnOrder = shuffle(playerIds);
  game.turnIndex = 0;
  game.round = 1;
  game.eliminated = new Set();
  game.wrongEliminations = 0;
  game.votes = new Map();
  game.status = 'in_progress';
  game.guessAttemptsThisRound = 0;
}

function currentTurnPlayerId(game) {
  return game.turnOrder[game.turnIndex];
}

/** Navbatni bittaga siljitadi. To'liq aylana tugasa round++ va {wrapped:true} qaytaradi. */
function advanceTurn(game) {
  game.turnIndex += 1;
  if (game.turnIndex >= game.turnOrder.length) {
    game.turnIndex = 0;
    game.round += 1;
    game.guessAttemptsThisRound = 0;
    return { wrapped: true, round: game.round };
  }
  return { wrapped: false, round: game.round };
}

function shouldAutoVote(game) {
  return game.round > ROUNDS_BEFORE_VOTE;
}

function resetForNextCycle(game) {
  game.round = 1;
  game.turnIndex = 0;
  game.guessAttemptsThisRound = 0;
}

function canGuess(game) {
  return game.guessAttemptsThisRound < MAX_GUESSES_PER_ROUND;
}

function remainingGuesses(game) {
  return Math.max(0, MAX_GUESSES_PER_ROUND - game.guessAttemptsThisRound);
}

function recordGuessAttempt(game) {
  game.guessAttemptsThisRound += 1;
}

function startVoting(game) {
  game.status = 'voting';
  game.votes = new Map();
}

function castVote(game, voterId, targetId) {
  if (!game.turnOrder.includes(voterId) || !game.turnOrder.includes(targetId)) return false;
  game.votes.set(voterId, targetId);
  return true;
}

function allVoted(game) {
  return game.votes.size >= game.turnOrder.length;
}

function tallyVotes(game) {
  const counts = new Map();
  for (const targetId of game.votes.values()) {
    counts.set(targetId, (counts.get(targetId) || 0) + 1);
  }
  let topId = null;
  let topCount = -1;
  for (const [id, count] of counts.entries()) {
    if (count > topCount) {
      topCount = count;
      topId = id;
    }
  }
  return { topId, topCount, counts };
}

/** Bir o'yinchini faol ro'yxatdan chiqaradi (impostor emas, noto'g'ri ovoz natijasida). */
function eliminatePlayer(game, userId) {
  const idx = game.turnOrder.indexOf(userId);
  if (idx === -1) return;
  game.turnOrder.splice(idx, 1);
  game.eliminated.add(userId);
  game.wrongEliminations += 1;
  if (game.turnIndex >= game.turnOrder.length) game.turnIndex = 0;
}

function onlyImpostorLeft(game) {
  return game.turnOrder.length === 1 && game.turnOrder[0] === game.impostorId;
}

function impostorLostByEliminations(game) {
  return game.wrongEliminations >= WRONG_ELIMINATIONS_TO_LOSE;
}

module.exports = {
  MIN_PLAYERS,
  ROUNDS_BEFORE_VOTE,
  WRONG_ELIMINATIONS_TO_LOSE,
  MAX_GUESSES_PER_ROUND,
  canGuess,
  remainingGuesses,
  recordGuessAttempt,
  createLobby,
  getGame,
  endGame,
  findGameByImpostor,
  addPlayer,
  removePlayer,
  canStart,
  startRound,
  currentTurnPlayerId,
  advanceTurn,
  shouldAutoVote,
  resetForNextCycle,
  startVoting,
  castVote,
  allVoted,
  tallyVotes,
  eliminatePlayer,
  onlyImpostorLeft,
  impostorLostByEliminations,
};
