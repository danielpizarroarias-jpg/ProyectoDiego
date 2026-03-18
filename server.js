const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// --- CONFIGURACIÓN BASE DE DATOS (Enlace Largo Compatible) ---
const MONGO_URI = "mongodb://sandro:yosoysandro@ac-ttbxhp0-shard-00-00.nkmk4b6.mongodb.net:27017,ac-ttbxhp0-shard-00-01.nkmk4b6.mongodb.net:27017,ac-ttbxhp0-shard-00-02.nkmk4b6.mongodb.net:27017/?replicaSet=atlas-kbqy4q-shard-0&ssl=true&authSource=admin";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Conectado a Ranking Global (Modo Compatible)"))
    .catch(err => console.log("❌ Error MongoDB:", err));

const ScoreSchema = new mongoose.Schema({
    username: String,
    score: Number,
    mode: { type: String, default: 'online' }, // 'online' o 'local'
    date: { type: Date, default: Date.now }
});
const Score = mongoose.model('Score', ScoreSchema);

// --- LÓGICA DEL JUEGO ONLINE ---
const CANVAS_WIDTH = 1200, CANVAS_HEIGHT = 800;
const rooms = {};

function spawnAsteroids(room, num, x, y, r) {
    for (let i = 0; i < num; i++) {
        room.asteroids.push({
            id: Math.random().toString(36).substr(2, 9),
            x: x !== undefined ? x : Math.random() * CANVAS_WIDTH,
            y: y !== undefined ? y : Math.random() * CANVAS_HEIGHT,
            r: r || 40,
            vx: (Math.random() - 0.5) * 3 * (1 + room.level * 0.1),
            vy: (Math.random() - 0.5) * 3 * (1 + room.level * 0.1),
            vert: Math.floor(Math.random() * 5 + 7),
            offsets: Array.from({length: 12}, () => Math.random() * 0.4 + 0.8)
        });
    }
}

io.on('connection', (socket) => {
    // Petición de ranking filtrada por modo
    socket.on('getRanking', async (mode) => {
        try {
            const topScores = await Score.find({ mode: mode }).sort({ score: -1 }).limit(5);
            socket.emit('receiveRanking', { mode, scores: topScores });
        } catch(e) { console.log("Error al leer ranking " + mode); }
    });

    socket.on('createRoom', () => {
        const code = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[code] = { playing: false, level: 1, score: 0, nextGoal: 1000, players: {}, asteroids: [], lasers: [] };
        socket.join(code); socket.roomCode = code;
        rooms[code].players[socket.id] = { id: socket.id, isHost: true, x: 600, y: 400, velX: 0, velY: 0, angle: 0, lives: 3, blink: 120, money: 0, upgradeCost: 50, fireDelay: 400, thrustPower: 0.2, projectiles: 1, lastFire: 0, inputs: {}, isShooting: false };
        socket.emit('roomCreated', code);
    });

    socket.on('joinRoom', (code) => {
        if (rooms[code] && !rooms[code].playing) {
            socket.join(code); socket.roomCode = code;
            rooms[code].players[socket.id] = { id: socket.id, isHost: false, x: 600, y: 400, velX: 0, velY: 0, angle: 0, lives: 3, blink: 120, money: 0, upgradeCost: 50, fireDelay: 400, thrustPower: 0.2, projectiles: 1, lastFire: 0, inputs: {}, isShooting: false };
            socket.emit('joinedRoom', code);
            io.to(code).emit('updateLobby', Object.keys(rooms[code].players).length);
        }
    });

    socket.on('startGame', (code) => {
        let room = rooms[code];
        if (room && room.players[socket.id]?.isHost) {
            room.playing = true; spawnAsteroids(room, 5);
            io.to(code).emit('gameStarted');
        }
    });

    socket.on('playerInput', (data) => {
        let p = rooms[socket.roomCode]?.players[socket.id];
        if (p) Object.assign(p, { angle: data.angle, inputs: data.keys, isShooting: data.isShooting });
    });

    socket.on('saveScore', async (data) => {
        if (data.score > 0) {
            await new Score({ username: data.name, score: data.score, mode: data.mode }).save();
            // Refrescar ranking para todos según el modo
            const topScores = await Score.find({ mode: data.mode }).sort({ score: -1 }).limit(5);
            io.emit('receiveRanking', { mode: data.mode, scores: topScores });
        }
    });

    socket.on('disconnect', () => {
        let room = rooms[socket.roomCode];
        if(room) {
            delete room.players[socket.id];
            if(Object.keys(room.players).length === 0) delete rooms[socket.roomCode];
            else io.to(socket.roomCode).emit('updateLobby', Object.keys(room.players).length);
        }
    });
});

setInterval(() => {
    for (let code in rooms) {
        let room = rooms[code]; if (!room.playing) continue;
        const now = Date.now();
        for (let id in room.players) {
            let p = room.players[id]; if (p.lives <= 0) continue;
            if (p.inputs['KeyW']) { p.velX += Math.cos(p.angle)*p.thrustPower; p.velY += Math.sin(p.angle)*p.thrustPower; }
            p.velX *= 0.98; p.velY *= 0.98; p.x += p.velX; p.y += p.velY;
            if (p.x < 0) p.x = CANVAS_WIDTH; else if (p.x > CANVAS_WIDTH) p.x = 0;
            if (p.y < 0) p.y = CANVAS_HEIGHT; else if (p.y > CANVAS_HEIGHT) p.y = 0;
            if (p.blink > 0) p.blink--;
            if (p.isShooting && p.blink === 0 && (now - p.lastFire > p.fireDelay)) {
                room.lasers.push({ owner: id, x: p.x, y: p.y, vx: Math.cos(p.angle)*12, vy: Math.sin(p.angle)*12 });
                p.lastFire = now;
            }
        }
        for (let i = room.asteroids.length - 1; i >= 0; i--) {
            let a = room.asteroids[i]; a.x += a.vx; a.y += a.vy;
            if (a.x < -a.r) a.x = CANVAS_WIDTH + a.r; else if (a.x > CANVAS_WIDTH + a.r) a.x = -a.r;
            if (a.y < -a.r) a.y = CANVAS_HEIGHT + a.r; else if (a.y > CANVAS_HEIGHT + a.r) a.y = -a.r;
            for (let id in room.players) { let p = room.players[id]; if (p.lives > 0 && p.blink === 0 && Math.hypot(p.x - a.x, p.y - a.y) < a.r + 10) { p.lives--; p.blink = 120; } }
            for (let j = room.lasers.length - 1; j >= 0; j--) {
                if (Math.hypot(room.lasers[j].x - a.x, room.lasers[j].y - a.y) < a.r) {
                    room.score += 100; room.asteroids.splice(i, 1); room.lasers.splice(j, 1);
                    if (room.score >= room.nextGoal) { room.level++; room.nextGoal += 1000; spawnAsteroids(room, 4 + room.level); }
                    break;
                }
            }
        }
        io.to(code).emit('gameState', room);
    }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor escuchando en el puerto ${PORT}`));