// ===============================
// 四字熟絵 game.js 完全版
// ===============================

const socket = io();

// -------------------------------
// DOM 要素取得
// -------------------------------
const titleScreen = document.getElementById('title-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const rankingScreen = document.getElementById('ranking-screen');
const finalRankingScreen = document.getElementById('final-ranking-screen');

const googleLoginBtn = document.getElementById('google-login');
const logoutBtn = document.getElementById('logout-btn');

const playerNameInput = document.getElementById('player-name');
const roomNameInput = document.getElementById('room-name');
const createRoomBtn = document.getElementById('create-room-btn');

const roomInfo = document.getElementById('room-info');
const playerIcons = document.getElementById('player-icons');

const lobbyChatLog = document.getElementById('lobby-chat-log');
const lobbyChatInput = document.getElementById('lobby-chat-input');
const lobbyChatSend = document.getElementById('lobby-chat-send');

const startGameBtn = document.getElementById('start-game-btn');
const backTitleBtn = document.getElementById('back-title-btn');

const timerEl = document.getElementById('timer');
const questionWordEl = document.getElementById('question-word');
const questionMeaningEl = document.getElementById('question-meaning');

const hint1Btn = document.getElementById('hint1-btn');
const hint2Btn = document.getElementById('hint2-btn');

const drawColorInput = document.getElementById('draw-color');
const drawWidthInput = document.getElementById('draw-width');
const penBtn = document.getElementById('pen-btn');
const eraserBtn = document.getElementById('eraser-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');

const questionCanvas = document.getElementById('question-canvas');
const answerCanvas = document.getElementById('answer-canvas');

const answerTextInput = document.getElementById('answer-text');
const answerSendBtn = document.getElementById('answer-send-btn');

const gameChatLog = document.getElementById('game-chat-log');
const gameChatInput = document.getElementById('game-chat-input');
const gameChatSend = document.getElementById('game-chat-send');

const scoreLog = document.getElementById('score-log');
const resultLog = document.getElementById('result-log');

const showRankingBtn = document.getElementById('show-ranking-btn');
const rankingList = document.getElementById('ranking-list');
const rankingBackBtn = document.getElementById('ranking-back');

const finalRankingList = document.getElementById('final-ranking-list');
const finalBackBtn = document.getElementById('final-back');

const rotateWarning = document.getElementById('rotate-warning');
const roleChangeOverlay = document.getElementById('role-change-overlay');
const roleChangeText = document.getElementById('role-change-text');

// -------------------------------
// 状態管理
// -------------------------------
let currentRoom = null;
let myId = null;
let myRole = 'waiting';
let currentQuestion = null;
let timerInterval = null;

let drawColor = "#000000";
let drawWidth = 3;
let isEraser = false;

let qCtx = questionCanvas.getContext('2d');
let aCtx = answerCanvas.getContext('2d');

let drawing = false;
let lastX = 0;
let lastY = 0;
let currentCanvas = null;
let currentCtx = null;

let historyQ = [];
let redoQ = [];
let historyA = [];
let redoA = [];

let userIcon = null;
let userId = null;

// -------------------------------
// 画面切り替え
// -------------------------------
function showScreen(screen) {
  [titleScreen, lobbyScreen, gameScreen, rankingScreen, finalRankingScreen].forEach(s => {
    s.classList.add('hidden');
  });
  screen.classList.remove('hidden');
}

// -------------------------------
// スマホ横画面強制
// -------------------------------
function checkOrientation() {
  if (window.innerHeight > window.innerWidth) {
    rotateWarning.classList.remove('hidden');
  } else {
    rotateWarning.classList.add('hidden');
  }
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation();

// -------------------------------
// Google OAuth ログイン情報取得
// -------------------------------
async function loadUser() {
  try {
    const res = await fetch('/user');
    const user = await res.json();
    if (user.loggedIn) {
      playerNameInput.value = user.name;
      userIcon = user.icon;
      userId = user.id;
    }
  } catch (e) {
    console.log(e);
  }
}
loadUser();

googleLoginBtn.addEventListener('click', () => {
  window.location.href = "/auth/google";
});
logoutBtn.addEventListener('click', () => {
  window.location.href = "/logout";
});

// -------------------------------
// モード取得
// -------------------------------
function getSelectedMode() {
  const radios = document.querySelectorAll('input[name="mode"]');
  for (const r of radios) {
    if (r.checked) return r.value;
  }
  return 'normal';
}

// -------------------------------
// ルーム作成
// -------------------------------
createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const roomName = roomNameInput.value.trim();
  const mode = getSelectedMode();
  if (!name || !roomName) return;

  currentRoom = roomName;

  socket.emit('createRoom', {
    roomName,
    playerName: name,
    mode,
    icon: userIcon,
    userId
  });

  showScreen(lobbyScreen);
});

// -------------------------------
// 待機ルーム更新
// -------------------------------
socket.on('roomUpdate', (room) => {
  roomInfo.textContent = `ルーム名: ${currentRoom} / モード: ${room.mode}`;
  playerIcons.innerHTML = '';

  Object.entries(room.players).forEach(([id, info]) => {
    const iconDiv = document.createElement('div');
    iconDiv.className = 'player-icon';
    const img = document.createElement('img');
    img.src = info.icon || 'default.png';
    iconDiv.appendChild(img);
    playerIcons.appendChild(iconDiv);
  });
});

// -------------------------------
// ゲーム開始
// -------------------------------
startGameBtn.addEventListener('click', () => {
  const q = getRandomYojiByDifficulty('easy');
  socket.emit('startGame', { roomName: currentRoom, question: q });
});

// -------------------------------
// タイトルへ戻る
// -------------------------------
backTitleBtn.addEventListener('click', () => {
  location.reload();
});

// -------------------------------
// 出題者交代アニメーション
// -------------------------------
function showRoleChangeAnimation(newQuestionerName) {
  roleChangeText.textContent = `次の出題者：${newQuestionerName}`;
  roleChangeOverlay.classList.remove('hidden');

  setTimeout(() => {
    roleChangeOverlay.style.opacity = 0;
  }, 1500);

  setTimeout(() => {
    roleChangeOverlay.classList.add('hidden');
    roleChangeOverlay.style.opacity = 1;
  }, 2000);
}

// -------------------------------
// タイマー
// -------------------------------
function startTimer() {
  let time = 120;
  timerEl.textContent = time;

  clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    time--;
    timerEl.textContent = time;

    if (time <= 0) {
      clearInterval(timerInterval);
      timerEl.textContent = "終了";
      socket.emit('requestFinalRanking', { roomName: currentRoom });
    }
  }, 1000);
}

// -------------------------------
// ゲーム開始イベント
// -------------------------------
socket.on('gameStart', ({ question, players }) => {
  currentQuestion = question;

  questionWordEl.textContent = `四字熟語：？？？？`;
  questionMeaningEl.textContent = `意味：？？？？`;

  scoreLog.innerHTML = '';
  resultLog.innerHTML = '';

  const qId = Object.keys(players).find(id => players[id].role === 'questioner');
  const qName = players[qId].name;

  myId = socket.id;
  myRole = players[myId]?.role || 'waiting';

  showRoleChangeAnimation(qName);
  showScreen(gameScreen);
  startTimer();

  clearCanvas(questionCanvas, qCtx, historyQ, redoQ);
  clearCanvas(answerCanvas, aCtx, historyA, redoA);
});

// -------------------------------
// ヒント1
// -------------------------------
hint1Btn.addEventListener('click', () => {
  if (!currentQuestion) return;
  const idx = Math.floor(Math.random() * 4);
  const char = currentQuestion.word[idx];
  socket.emit('hint1', { roomName: currentRoom, char, index: idx + 1 });
});

socket.on('hint1', ({ char, index }) => {
  questionWordEl.textContent = `四字熟語：？${index}文字目は「${char}」`;
});

// -------------------------------
// ヒント2
// -------------------------------
hint2Btn.addEventListener('click', () => {
  if (!currentQuestion) return;
  socket.emit('hint2', { roomName: currentRoom, meaning: currentQuestion.meaning });
});

socket.on('hint2', ({ meaning }) => {
  questionMeaningEl.textContent = `意味：${meaning}`;
});

// -------------------------------
// 描画ツール
// -------------------------------
drawColorInput.addEventListener('input', (e) => {
  drawColor = e.target.value;
});
drawWidthInput.addEventListener('input', (e) => {
  drawWidth = parseInt(e.target.value);
});
penBtn.addEventListener('click', () => {
  isEraser = false;
});
eraserBtn.addEventListener('click', () => {
  isEraser = true;
});

// -------------------------------
// キャンバスクリア
// -------------------------------
function clearCanvas(canvas, ctx, history, redo) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  history.length = 0;
  redo.length = 0;
  history.push(canvas.toDataURL());
}

// -------------------------------
// 履歴保存
// -------------------------------
function pushHistory(canvas, history) {
  history.push(canvas.toDataURL());
  if (history.length > 50) history.shift();
}

// -------------------------------
// Undo / Redo
// -------------------------------
undoBtn.addEventListener('click', () => {
  if (currentCanvas === questionCanvas) undoCanvas(questionCanvas, qCtx, historyQ, redoQ);
  else if (currentCanvas === answerCanvas) undoCanvas(answerCanvas, aCtx, historyA, redoA);
});

redoBtn.addEventListener('click', () => {
  if (currentCanvas === questionCanvas) redoCanvas(questionCanvas, qCtx, historyQ, redoQ);
  else if (currentCanvas === answerCanvas) redoCanvas(answerCanvas, aCtx, historyA, redoA);
});

function undoCanvas(canvas, ctx, history, redo) {
  if (history.length <= 1) return;
  const last = history.pop();
  redo.push(last);

  const img = new Image();
  img.src = history[history.length - 1];
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
}

function redoCanvas(canvas, ctx, history, redo) {
  if (redo.length === 0) return;
  const data = redo.pop();
  history.push(data);

  const img = new Image();
  img.src = data;
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  };
}

// -------------------------------
// キャンバス描画処理
// -------------------------------
function setupCanvas(canvas, ctx, type) {
  canvas.addEventListener('mousedown', (e) => {
    if (type === 'question' && myRole !== 'questioner') return;
    if (type === 'answer' && myRole !== 'answerer') return;

    drawing = true;
    currentCanvas = canvas;
    currentCtx = ctx;

    const rect = canvas.getBoundingClientRect();
    lastX = e.clientX - rect.left;
    lastY = e.clientY - rect.top;

    if (type === 'question') pushHistory(canvas, historyQ);
    else pushHistory(canvas, historyA);
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!drawing) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    currentCtx.strokeStyle = isEraser ? "#ffffff" : drawColor;
    currentCtx.lineWidth = isEraser ? 20 : drawWidth;
    currentCtx.lineCap = 'round';

    currentCtx.beginPath();
    currentCtx.moveTo(lastX, lastY);
    currentCtx.lineTo(x, y);
    currentCtx.stroke();

    lastX = x;
    lastY = y;
  });

  canvas.addEventListener('mouseup', () => drawing = false);
  canvas.addEventListener('mouseleave', () => drawing = false);
}

setupCanvas(questionCanvas, qCtx, 'question');
setupCanvas(answerCanvas, aCtx, 'answer');

// -------------------------------
// 回答送信
// -------------------------------
answerSendBtn.addEventListener('click', () => {
  const ans = answerTextInput.value.trim();
  if (!ans || !currentRoom) return;

  socket.emit('submitAnswer', {
    roomName: currentRoom,
    answer: ans,
    playerId: socket.id
  });
});

// -------------------------------
// 回答結果
// -------------------------------
socket.on('answerResult', ({ playerId, answer, correct, score, questionerScore }) => {
  const div = document.createElement('div');
  div.textContent = `プレイヤー ${playerId === myId ? '(あなた)' : playerId} の回答「${answer}」: ${correct ? '正解！' : '不正解'}`;
  resultLog.appendChild(div);

  if (correct) {
    const s = document.createElement('div');
    s.textContent = `回答者 +${score}点 / 出題者 +${questionerScore}点`;
    scoreLog.appendChild(s);

    setTimeout(() => {
      socket.emit('nextQuestion', { roomName: currentRoom });
    }, 2000);
  }
});

// -------------------------------
// ランキング表示
// -------------------------------
showRankingBtn.addEventListener('click', () => {
  socket.emit('requestRanking', { roomName: currentRoom });
});

socket.on('rankingData', (players) => {
  rankingList.innerHTML = '';

  const arr = Object.entries(players).map(([id, p]) => ({
    name: p.name,
    score: p.score || 0
  }));

  arr.sort((a, b) => b.score - a.score);

  arr.forEach((p, i) => {
    const div = document.createElement('div');
    div.textContent = `${i + 1}位: ${p.name} - ${p.score}点`;
    rankingList.appendChild(div);
  });

  showScreen(rankingScreen);
});

rankingBackBtn.addEventListener('click', () => {
  showScreen(gameScreen);
});

// -------------------------------
// 最終ランキング
// -------------------------------
socket.on('finalRankingData', (players) => {
  finalRankingList.innerHTML = '';

  const arr = Object.entries(players).map(([id, p]) => ({
    name: p.name,
    score: p.score || 0
  }));

  arr.sort((a, b) => b.score - a.score);

  arr.forEach((p, i) => {
    const div = document.createElement('div');
    div.textContent = `${i + 1}位: ${p.name} - ${p.score}点`;
    finalRankingList.appendChild(div);
  });

  showScreen(finalRankingScreen);
});

finalBackBtn.addEventListener('click', () => {
  location.reload();
});

// -------------------------------
// 四字熟語辞書から難易度別ランダム取得
// -------------------------------
function getRandomYojiByDifficulty(diff) {
  const list = YOJI_DICTIONARY.filter(y => y.difficulty === diff);
  return list[Math.floor(Math.random() * list.length)];
}
