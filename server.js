const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

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

function spawnBoss(room) {
    room.boss = { x: CANVAS_WIDTH/2, y: 100, hp: 30+(room.level*5), maxHp: 30+(room.level*5), lastShot: 0, shotInterval: 2500, homingEnabled: false, targetX: CANVAS_WIDTH/2, lastMoveChange: 0, moveChangeTime: 1000 };
}

io.on('connection', (socket) => {
    socket.on('createRoom', () => {
        const code = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[code] = { playing: false, level: 1, score: 0, nextGoal: 1000, players: {}, asteroids: [], lasers: [], enemyLasers: [], boss: null };
        socket.join(code); socket.roomCode = code;
        rooms[code].players[socket.id] = createPlayer(socket.id, true);
        socket.emit('roomCreated', code);
        console.log(`[+] Sala creada: ${code}`);
    });

    socket.on('joinRoom', (code) => {
        if (rooms[code] && !rooms[code].playing) {
            socket.join(code); socket.roomCode = code;
            rooms[code].players[socket.id] = createPlayer(socket.id, false);
            socket.emit('joinedRoom', code);
            io.to(code).emit('updateLobby', Object.keys(rooms[code].players).length);
            console.log(`[+] Jugador se unió a la sala: ${code}`);
        } else socket.emit('errorMsg', 'Sala no existe o en partida');
    });

    // --- EL BOTÓN DE INICIAR ---
    socket.on('startGame', (code) => {
        console.log(`[!] Petición para iniciar sala: ${code}`);
        let room = rooms[code];
        if (!room) return console.log("   ❌ Error: La sala no existe en el servidor.");
        if (!room.players[socket.id]) return console.log("   ❌ Error: El jugador no está registrado en esta sala.");
        if (!room.players[socket.id].isHost) return console.log("   ❌ Error: El jugador no es el líder (Host).");
        
        console.log("   ✅ Todo correcto. ¡Iniciando la partida!");
        room.playing = true; 
        spawnAsteroids(room, 5);
        io.to(code).emit('gameStarted');
    });

    socket.on('playerInput', (data) => {
        let room = rooms[socket.roomCode];
        if (room && room.playing && room.players[socket.id]) {
            Object.assign(room.players[socket.id], { angle: data.angle, inputs: data.keys, isShooting: data.isShooting });
        }
    });

    socket.on('buyUpgrade', (type) => {
        let p = rooms[socket.roomCode]?.players[socket.id];
        if (p && p.money >= p.upgradeCost) {
            p.money -= p.upgradeCost; p.upgradeCost += 25;
            if(type==='fireRate') p.fireDelay = Math.max(80, p.fireDelay - 60);
            if(type==='thrust') p.thrustPower += 0.08;
            if(type==='multishot') p.projectiles++;
        }
    });

    socket.on('applySuperUpgrade', (type) => {
        let room = rooms[socket.roomCode];
        let p = room?.players[socket.id];
        if (p) {
            if(type==='bala') p.projectiles++;
            if(type==='cadencia') p.fireDelay /= 1.8;
            if(type==='motor') p.thrustPower *= 1.4;
            p.bossRewardClaimed = true;
            if (Object.values(room.players).every(pl => pl.bossRewardClaimed || pl.lives <= 0)) {
                Object.values(room.players).forEach(pl => pl.bossRewardClaimed = false);
                room.level++; room.nextGoal += 1000 + (room.level * 200);
                spawnAsteroids(room, 4 + room.level);
                io.to(socket.roomCode).emit('levelUp', { level: room.level, extraLife: false });
            }
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

function createPlayer(id, isHost) {
    return { id, isHost, x: CANVAS_WIDTH/2, y: CANVAS_HEIGHT/2, velX: 0, velY: 0, angle: 0, lives: 3, blink: 120, money: 0, upgradeCost: 50, fireDelay: 400, thrustPower: 0.2, projectiles: 1, lastFire: 0, inputs: {}, isShooting: false, bossRewardClaimed: false };
}

setInterval(() => {
    const now = Date.now();
    for (let code in rooms) {
        let room = rooms[code];
        if (!room.playing) continue;

        for (let id in room.players) {
            let p = room.players[id];
            if (p.lives <= 0) continue;

            if (p.inputs['KeyW'] || p.inputs['ArrowUp']) { p.velX += Math.cos(p.angle) * p.thrustPower; p.velY += Math.sin(p.angle) * p.thrustPower; }
            p.velX *= 0.98; p.velY *= 0.98; p.x += p.velX; p.y += p.velY;
            if (p.x < 0) p.x = CANVAS_WIDTH; else if (p.x > CANVAS_WIDTH) p.x = 0;
            if (p.y < 0) p.y = CANVAS_HEIGHT; else if (p.y > CANVAS_HEIGHT) p.y = 0;
            if (p.blink > 0) p.blink--;

            if (p.isShooting && p.blink === 0 && (now - p.lastFire > p.fireDelay)) {
                for(let i = 0; i < p.projectiles; i++) {
                    let offset = (i - (p.projectiles - 1) / 2) * 0.2;
                    room.lasers.push({ owner: id, x: p.x, y: p.y, vx: Math.cos(p.angle + offset)*12, vy: Math.sin(p.angle + offset)*12 });
                }
                p.lastFire = now;
            }
        }

        if (room.boss) {
            let boss = room.boss;
            if (now - boss.lastMoveChange > boss.moveChangeTime) { boss.targetX = 60 + Math.random() * (CANVAS_WIDTH - 120); boss.moveChangeTime = 800 + Math.random() * 1200; boss.lastMoveChange = now; }
            let dx = boss.targetX - boss.x; boss.x += Math.sign(dx) * Math.min(Math.abs(dx), 2 + room.level / 4); boss.y = 90 + Math.sin(now / 500) * 12;
            if (!boss.homingEnabled && boss.hp <= boss.maxHp * 0.3) { boss.homingEnabled = true; boss.shotInterval *= 0.6; }
            if (now - boss.lastShot > boss.shotInterval) {
                let target = Object.values(room.players).find(p => p.lives > 0); 
                if(target) {
                    let angle = Math.atan2(target.y - boss.y, target.x - boss.x), speed = 4 + room.level * 0.1;
                    room.enemyLasers.push({ x: boss.x, y: boss.y+20, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed, homing: boss.homingEnabled, speed: boss.homingEnabled? 2+room.level*0.15 : 0, size: boss.homingEnabled? 10:8 });
                }
                boss.lastShot = now;
            }
            for (let id in room.players) { let p = room.players[id]; if (p.lives > 0 && Math.hypot(p.x - boss.x, p.y - boss.y) < 50 && p.blink === 0) { p.lives--; p.blink = 120; } }
        }

        for (let i = room.lasers.length - 1; i >= 0; i--) {
            let l = room.lasers[i]; l.x += l.vx; l.y += l.vy;
            if (room.boss && Math.hypot(l.x - room.boss.x, l.y - room.boss.y) < 45) {
                room.boss.hp--; room.lasers.splice(i, 1);
                if (room.boss.hp <= 0) { room.boss = null; room.enemyLasers = []; io.to(code).emit('bossDefeated'); }
                continue;
            }
            let hitMissile = false;
            for (let j = room.enemyLasers.length - 1; j >= 0; j--) {
                if (room.enemyLasers[j].homing && Math.hypot(l.x - room.enemyLasers[j].x, l.y - room.enemyLasers[j].y) < 12) { room.enemyLasers.splice(j, 1); room.lasers.splice(i, 1); hitMissile = true; break; }
            }
            if (hitMissile) continue;
            if (l.x < 0 || l.x > CANVAS_WIDTH || l.y < 0 || l.y > CANVAS_HEIGHT) room.lasers.splice(i, 1);
        }

        for (let i = room.enemyLasers.length - 1; i >= 0; i--) {
            let el = room.enemyLasers[i];
            if (el.homing) { let target = Object.values(room.players).find(p => p.lives > 0); if(target) { let angle = Math.atan2(target.y - el.y, target.x - el.x); el.vx = Math.cos(angle) * el.speed; el.vy = Math.sin(angle) * el.speed; } }
            el.x += el.vx; el.y += el.vy || 7;
            for (let id in room.players) { let p = room.players[id]; if (p.lives > 0 && p.blink === 0 && Math.hypot(p.x - el.x, p.y - el.y) < (el.size + 18)) { p.lives--; p.blink = 120; room.enemyLasers.splice(i, 1); break; } }
            if (el.y > CANVAS_HEIGHT + 50 || el.x < -50 || el.x > CANVAS_WIDTH + 50 || el.y < -50) room.enemyLasers.splice(i, 1);
        }

        if (!room.boss) {
            for (let i = room.asteroids.length - 1; i >= 0; i--) {
                let a = room.asteroids[i]; a.x += a.vx; a.y += a.vy;
                if (a.x < -a.r) a.x = CANVAS_WIDTH + a.r; else if (a.x > CANVAS_WIDTH + a.r) a.x = -a.r;
                if (a.y < -a.r) a.y = CANVAS_HEIGHT + a.r; else if (a.y > CANVAS_HEIGHT + a.r) a.y = -a.r;

                for (let id in room.players) { let p = room.players[id]; if (p.lives > 0 && p.blink === 0 && Math.hypot(p.x - a.x, p.y - a.y) < a.r + 5) { p.lives--; p.blink = 120; } }

                let destroyed = false;
                for (let j = room.lasers.length - 1; j >= 0; j--) {
                    let l = room.lasers[j];
                    if (Math.hypot(l.x - a.x, l.y - a.y) < a.r) {
                        if(room.players[l.owner]) room.players[l.owner].money++;
                        room.score += 100;
                        if (a.r > 15) { spawnAsteroids(room, 1, a.x, a.y, a.r / 2); spawnAsteroids(room, 1, a.x, a.y, a.r / 2); }
                        room.asteroids.splice(i, 1); room.lasers.splice(j, 1); destroyed = true;
                        if (room.score >= room.nextGoal) {
                            room.level++; room.nextGoal += 1000 + (room.level * 200);
                            let extraLife = false; for(let pid in room.players) { if(room.players[pid].lives < 3 && room.players[pid].lives > 0) { room.players[pid].lives++; extraLife = true; } }
                            io.to(code).emit('levelUp', { level: room.level, extraLife });
                            if (room.level % 5 === 0) { room.asteroids = []; spawnBoss(room); } else { spawnAsteroids(room, 4 + room.level); }
                        }
                        break;
                    }
                }
                if (destroyed) continue;
            }
            if (room.asteroids.length < 2) spawnAsteroids(room, 1);
        }

        io.to(code).emit('gameState', room);
    }
}, 1000 / 60);

server.listen(3000, () => console.log('🚀 Server port 3000'));