const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

app.use(session({
  secret: 'yojijukue-secret',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Google OAuth
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => {
  return done(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

app.get('/user', (req, res) => {
  if (req.user) {
    res.json({
      loggedIn: true,
      name: req.user.displayName,
      icon: req.user.photos[0].value,
      id: req.user.id
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// ルーム管理
const rooms = {};

io.on('connection', (socket) => {

  socket.on('createRoom', ({ roomName, playerName, mode, icon, userId }) => {
    if (!rooms[roomName]) {
      rooms[roomName] = {
        hostId: socket.id,
        mode,
        players: {},
        currentQuestion: null,
        questionCount: 0,
        hintUsed: { hint1: false, hint2: false }
      };
    }

    rooms[roomName].players[socket.id] = {
      name: playerName,
      role: 'waiting',
      score: 0,
      icon,
      userId
    };

    socket.join(roomName);
    io.to(roomName).emit('roomUpdate', rooms[roomName]);
  });

  socket.on('startGame', ({ roomName, question }) => {
    const room = rooms[roomName];
    room.currentQuestion = question;
    room.questionCount++;
    room.hintUsed = { hint1: false, hint2: false };

    let questionerId;
    if (room.questionCount % 2 === 1) {
      questionerId = room.hostId;
    } else {
      const ids = Object.keys(room.players);
      questionerId = ids[Math.floor(Math.random() * ids.length)];
    }

    Object.keys(room.players).forEach(id => {
      room.players[id].role = (id === questionerId) ? 'questioner' : 'answerer';
    });

    io.to(roomName).emit('gameStart', {
      question: room.currentQuestion,
      players: room.players
    });
  });

  socket.on('hint1', ({ roomName, char, index }) => {
    rooms[roomName].hintUsed.hint1 = true;
    io.to(roomName).emit('hint1', { char, index });
  });

  socket.on('hint2', ({ roomName, meaning }) => {
    rooms[roomName].hintUsed.hint2 = true;
    io.to(roomName).emit('hint2', { meaning });
  });

  socket.on('submitAnswer', ({ roomName, answer, playerId }) => {
    const room = rooms[roomName];
    const correct = answer === room.currentQuestion.word;

    let score = 0;
    let questionerScore = 0;

    if (correct) {
      const diff = room.currentQuestion.difficulty;
      const diffPoint = diff === 'easy' ? 1 : diff === 'normal' ? 2 : 3;

      let bonus = 2;
      if (room.hintUsed.hint1) bonus--;
      if (room.hintUsed.hint2) bonus--;

      score = diffPoint + bonus;
      questionerScore = Math.floor(score / 2);

      room.players[playerId].score += score;

      const qId = Object.keys(room.players).find(id => room.players[id].role === 'questioner');
      room.players[qId].score += questionerScore;
    }

    io.to(roomName).emit('answerResult', {
      playerId,
      answer,
      correct,
      score,
      questionerScore
    });
  });

  socket.on('nextQuestion', ({ roomName }) => {
    const room = rooms[roomName];
    room.questionCount++;
    room.hintUsed = { hint1: false, hint2: false };

    const diffs = ['easy', 'normal', 'hard'];
    const diff = diffs[Math.floor(Math.random() * diffs.length)];
    const q = getRandomYojiByDifficulty(diff);

    room.currentQuestion = q;

    let questionerId;
    if (room.questionCount % 2 === 1) {
      questionerId = room.hostId;
    } else {
      const ids = Object.keys(room.players);
      questionerId = ids[Math.floor(Math.random() * ids.length)];
    }

    Object.keys(room.players).forEach(id => {
      room.players[id].role = (id === questionerId) ? 'questioner' : 'answerer';
    });

    io.to(roomName).emit('gameStart', {
      question: room.currentQuestion,
      players: room.players
    });
  });

  socket.on('requestRanking', ({ roomName }) => {
    io.to(roomName).emit('rankingData', rooms[roomName].players);
  });

  socket.on('requestFinalRanking', ({ roomName }) => {
    io.to(roomName).emit('finalRankingData', rooms[roomName].players);
  });

  socket.on('disconnect', () => {
    for (const roomName of Object.keys(rooms)) {
      const room = rooms[roomName];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(roomName).emit('roomUpdate', room);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running on", PORT));
