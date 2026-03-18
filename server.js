const mongoose = require('mongoose');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

// --- CONFIGURACIÓN BASE DE DATOS ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/proyectodiego';

let mongoConnected = false;

mongoose.connect(MONGO_URI)
    .then(() => { 
        console.log("✅ Conectado a Ranking Global (Modo Compatible)");
        mongoConnected = true;
    })
    .catch(err => {
        console.log("⚠️ MongoDB no disponible - Ranking deshabilitado");
    });

const ScoreSchema = new mongoose.Schema({
    username: String,
    score: Number,
    mode: { type: String, default: 'online' },
    date: { type: Date, default: Date.now }
});
const Score = mongoose.model('Score', ScoreSchema);

// --- CONFIGURACIÓN DEL JUEGO ---
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
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
            offsets: Array.from({ length: 12 }, () => Math.random() * 0.4 + 0.8)
        });
    }
}

function spawnBoss(room) {
    room.boss = {
        x: CANVAS_WIDTH / 2,
        y: 100,
        hp: 30 + (room.level * 5),
        maxHp: 30 + (room.level * 5),
        dir: 1,
        lastShot: Date.now() - 2500,
        shotInterval: 2500,
        homingEnabled: false,
        targetX: CANVAS_WIDTH / 2,
        lastMoveChange: Date.now(),
        moveChangeTime: 1000
    };
    room.enemyLasers = [];
    io.to(room.code).emit('bossAppeared');
}

io.on('connection', (socket) => {
    // Petición de ranking filtrada por modo
    socket.on('getRanking', async (mode) => {
        if (!mongoConnected) {
            socket.emit('receiveRanking', { mode, scores: [] });
            return;
        }
        try {
            const topScores = await Score.find({ mode: mode }).sort({ score: -1 }).limit(5);
            socket.emit('receiveRanking', { mode, scores: topScores });
        } catch (e) {
            console.log("Error al leer ranking " + mode);
            socket.emit('receiveRanking', { mode, scores: [] });
        }
    });

    socket.on('createRoom', (username) => {
        const code = Math.random().toString(36).substring(2, 7).toUpperCase();
        const playerName = username || 'Host';
        rooms[code] = {
            code: code,
            playing: false,
            level: 1,
            score: 0,
            nextGoal: 1000,
            players: {},
            asteroids: [],
            lasers: [],
            enemyLasers: [],
            boss: null,
            state: 'LOBBY'
        };
        socket.join(code);
        socket.roomCode = code;
        socket.username = playerName;
        rooms[code].players[socket.id] = {
            id: socket.id,
            name: playerName,
            isHost: true,
            x: CANVAS_WIDTH / 2 - 100,
            y: CANVAS_HEIGHT / 2,
            velX: 0,
            velY: 0,
            angle: 0,
            lives: 3,
            blink: 120,
            money: 0,
            upgradeCost: 50,
            upgradeCount: 0,
            fireDelay: 400,
            thrustPower: 0.2,
            projectiles: 1,
            lastFire: 0,
            inputs: {},
            isShooting: false
        };
        socket.emit('roomCreated', code);
    });

    socket.on('joinRoom', (data) => {
        const code = data.code;
        const username = data.username || 'Guest';
        if (rooms[code] && !rooms[code].playing) {
            socket.join(code);
            socket.roomCode = code;
            socket.username = username;
            
            // Position new player at different location
            const playerCount = Object.keys(rooms[code].players).length;
            const offsetX = (playerCount % 2) * 200 - 100;
            const offsetY = Math.floor(playerCount / 2) * 100 - 50;
            
            rooms[code].players[socket.id] = {
                id: socket.id,
                name: username,
                isHost: false,
                x: CANVAS_WIDTH / 2 + offsetX,
                y: CANVAS_HEIGHT / 2 + offsetY,
                velX: 0,
                velY: 0,
                angle: 0,
                lives: 3,
                blink: 120,
                money: 0,
                upgradeCost: 50,
                upgradeCount: 0,
                fireDelay: 400,
                thrustPower: 0.2,
                projectiles: 1,
                lastFire: 0,
                inputs: {},
                isShooting: false
            };
            socket.emit('joinedRoom', code);
            io.to(code).emit('updateLobby', Object.keys(rooms[code].players).length);
        }
    });

    socket.on('startGame', (code) => {
        let room = rooms[code];
        if (room && room.players[socket.id]?.isHost) {
            room.playing = true;
            room.state = 'PLAYING';
            spawnAsteroids(room, 5);
            io.to(code).emit('gameStarted');
        }
    });

    socket.on('playerInput', (data) => {
        let room = rooms[socket.roomCode];
        let p = room?.players[socket.id];
        if (p) {
            p.angle = data.angle;
            p.inputs = data.keys;
            p.isShooting = data.isShooting;
            // Store player's screen dimensions for screen wrapping
            if (data.width && data.height) {
                p.screenWidth = data.width;
                p.screenHeight = data.height;
            }
        }
    });

    socket.on('buyUpgrade', (data) => {
        let room = rooms[data.room];
        if (!room) return;
        let p = room.players[socket.id];
        if (!p || p.money < p.upgradeCost) return;
        
        p.money -= p.upgradeCost;
        p.upgradeCost += 25;
        p.upgradeCount++;
        
        if (data.type === 'fireRate') p.fireDelay = Math.max(80, p.fireDelay - 60);
        if (data.type === 'thrust') p.thrustPower += 0.08;
        if (data.type === 'multishot') p.projectiles++;
        
        // Game continues running - just send updated state
        io.to(room.code).emit('gameState', room);
    });

    socket.on('applySuperUpgrade', (data) => {
        let room = rooms[data.room];
        if (!room) return;
        let p = room.players[socket.id];
        if (!p) return;
        
        if (data.type === 'bala') p.projectiles++;
        if (data.type === 'cadencia') p.fireDelay /= 1.8;
        if (data.type === 'motor') p.thrustPower *= 1.4;
        
        document.getElementById('boss-reward-menu').classList.add('hidden');
        room.state = 'PLAYING';
        
        // Continue to next level
        room.level++;
        room.nextGoal += 1000 + (room.level * 200);
        room.asteroids = [];
        room.boss = null;
        room.enemyLasers = [];
        spawnAsteroids(room, 4 + room.level);
        
        io.to(room.code).emit('gameStarted');
    });

    socket.on('saveScore', async (data) => {
        if (!mongoConnected || data.score <= 0) return;
        try {
            const playerName = socket.username || data.name || 'Anonymous';
            await new Score({ username: playerName, score: data.score, mode: data.mode || 'online' }).save();
            const topScores = await Score.find({ mode: data.mode || 'online' }).sort({ score: -1 }).limit(5);
            io.emit('receiveRanking', { mode: data.mode || 'online', scores: topScores });
        } catch (e) {
            console.log("Error al guardar puntuación");
        }
    });

    socket.on('disconnect', () => {
        let room = rooms[socket.roomCode];
        if (room) {
            delete room.players[socket.id];
            if (Object.keys(room.players).length === 0) {
                delete rooms[socket.roomCode];
            } else {
                io.to(socket.roomCode).emit('updateLobby', Object.keys(room.players).length);
            }
        }
    });
});

// Game loop - runs at 60 FPS
setInterval(() => {
    for (let code in rooms) {
        let room = rooms[code];
        if (!room.playing || room.state !== 'PLAYING') continue;
        
        const now = Date.now();
        
        // Update all players
        for (let id in room.players) {
            let p = room.players[id];
            if (p.lives <= 0) continue;
            
            // Movement - always active
            if (p.inputs['KeyW'] || p.inputs['ArrowUp']) {
                p.velX += Math.cos(p.angle) * p.thrustPower;
                p.velY += Math.sin(p.angle) * p.thrustPower;
            }
            p.velX *= 0.98;
            p.velY *= 0.98;
            p.x += p.velX;
            p.y += p.velY;
            
            // Wrap around screen
            if (p.x < 0) p.x = CANVAS_WIDTH;
            else if (p.x > CANVAS_WIDTH) p.x = 0;
            if (p.y < 0) p.y = CANVAS_HEIGHT;
            else if (p.y > CANVAS_HEIGHT) p.y = 0;
            
            // Blink countdown
            if (p.blink > 0) p.blink--;
            
            // Shooting - always active
            if (p.isShooting && p.blink === 0 && (now - p.lastFire > p.fireDelay)) {
                for (let i = 0; i < p.projectiles; i++) {
                    let offset = (i - (p.projectiles - 1) / 2) * 0.2;
                    room.lasers.push({
                        owner: id,
                        x: p.x,
                        y: p.y,
                        vx: Math.cos(p.angle + offset) * 12,
                        vy: Math.sin(p.angle + offset) * 12
                    });
                }
                p.lastFire = now;
            }
        }
        
        // Update boss
        if (room.boss) {
            let boss = room.boss;
            
            // Random horizontal movement
            if (Date.now() - boss.lastMoveChange > boss.moveChangeTime) {
                boss.targetX = 60 + Math.random() * (CANVAS_WIDTH - 120);
                boss.moveChangeTime = 800 + Math.random() * 1200;
                boss.lastMoveChange = Date.now();
            }
            let dx = boss.targetX - boss.x;
            let moveSpeed = 2 + room.level / 4;
            boss.x += Math.sign(dx) * Math.min(Math.abs(dx), moveSpeed);
            boss.y = 90 + Math.sin(Date.now() / 500) * 12;
            
            // Enable homing missiles at 30% HP
            if (!boss.homingEnabled && boss.hp <= boss.maxHp * 0.3) {
                boss.homingEnabled = true;
                boss.shotInterval = Math.max(300, boss.shotInterval * 0.6);
            }
            
            // Boss shooting
            if (Date.now() - boss.lastShot > boss.shotInterval) {
                // Find a living player to target
                let targetPlayer = null;
                for (let id in room.players) {
                    if (room.players[id].lives > 0) {
                        targetPlayer = room.players[id];
                        break;
                    }
                }
                
                if (targetPlayer) {
                    if (boss.homingEnabled) {
                        // Homing missile
                        room.enemyLasers.push({
                            x: boss.x,
                            y: boss.y + 20,
                            vx: 0,
                            vy: 0,
                            speed: 2 + room.level * 0.15,
                            homing: true,
                            size: 10
                        });
                        
                        // Additional lasers at high levels
                        let angle = Math.atan2(targetPlayer.y - boss.y, targetPlayer.x - boss.x);
                        let speed = 4 + room.level * 0.1;
                        if (room.level >= 50) {
                            let spread = 0.3;
                            room.enemyLasers.push({
                                x: boss.x,
                                y: boss.y + 20,
                                vx: Math.cos(angle - spread) * speed,
                                vy: Math.sin(angle - spread) * speed,
                                size: 8
                            });
                            room.enemyLasers.push({
                                x: boss.x,
                                y: boss.y + 20,
                                vx: Math.cos(angle + spread) * speed,
                                vy: Math.sin(angle + spread) * speed,
                                size: 8
                            });
                        } else if (room.level >= 20) {
                            room.enemyLasers.push({
                                x: boss.x,
                                y: boss.y + 20,
                                vx: Math.cos(angle) * speed,
                                vy: Math.sin(angle) * speed,
                                size: 8
                            });
                        }
                    } else {
                        let angle = Math.atan2(targetPlayer.y - boss.y, targetPlayer.x - boss.x);
                        let speed = 4 + room.level * 0.1;
                        room.enemyLasers.push({
                            x: boss.x,
                            y: boss.y + 20,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            size: 8
                        });
                    }
                }
                boss.lastShot = Date.now();
            }
            
            // Boss collision with players
            for (let id in room.players) {
                let p = room.players[id];
                if (p.lives > 0 && p.blink === 0 && Math.hypot(p.x - boss.x, p.y - boss.y) < 50) {
                    p.lives--;
                    p.blink = 120;
                    if (p.lives <= 0) {
                        io.to(room.code).emit('gameOver');
                    }
                }
            }
        }
        
        // Update enemy lasers (including homing missiles)
        for (let i = room.enemyLasers.length - 1; i >= 0; i--) {
            let el = room.enemyLasers[i];
            
            if (el.homing) {
                // Find closest living player
                let targetPlayer = null;
                let minDist = Infinity;
                for (let id in room.players) {
                    let p = room.players[id];
                    if (p.lives > 0) {
                        let dist = Math.hypot(p.x - el.x, p.y - el.y);
                        if (dist < minDist) {
                            minDist = dist;
                            targetPlayer = p;
                        }
                    }
                }
                
                if (targetPlayer) {
                    let angle = Math.atan2(targetPlayer.y - el.y, targetPlayer.x - el.x);
                    el.vx = Math.cos(angle) * el.speed;
                    el.vy = Math.sin(angle) * el.speed;
                }
                el.x += el.vx;
                el.y += el.vy;
                
                // Check collision with players
                for (let id in room.players) {
                    let p = room.players[id];
                    if (p.lives > 0 && p.blink === 0 && Math.hypot(p.x - el.x, p.y - el.y) < (el.size + 18)) {
                        p.lives--;
                        p.blink = 120;
                        room.enemyLasers.splice(i, 1);
                        if (p.lives <= 0) {
                            io.to(room.code).emit('gameOver');
                        }
                        break;
                    }
                }
            } else {
                if (el.vx !== undefined) {
                    el.x += el.vx;
                    el.y += el.vy || 0;
                } else if (el.vy !== undefined) {
                    el.y += el.vy;
                } else {
                    el.y += 7;
                }
                
                // Check collision with players
                for (let id in room.players) {
                    let p = room.players[id];
                    if (p.lives > 0 && p.blink === 0 && Math.hypot(p.x - el.x, p.y - el.y) < (el.size + 18)) {
                        p.lives--;
                        p.blink = 120;
                        room.enemyLasers.splice(i, 1);
                        if (p.lives <= 0) {
                            io.to(room.code).emit('gameOver');
                        }
                        break;
                    }
                }
            }
            
            // Remove off-screen lasers
            if (el.y > CANVAS_HEIGHT + 50 || el.x < -50 || el.x > CANVAS_WIDTH + 50 || el.y < -50) {
                room.enemyLasers.splice(i, 1);
            }
        }
        
        // Update asteroids
        if (!room.boss) {
            for (let i = room.asteroids.length - 1; i >= 0; i--) {
                let a = room.asteroids[i];
                a.x += a.vx;
                a.y += a.vy;
                
                // Wrap around
                if (a.x < -a.r) a.x = CANVAS_WIDTH + a.r;
                else if (a.x > CANVAS_WIDTH + a.r) a.x = -a.r;
                if (a.y < -a.r) a.y = CANVAS_HEIGHT + a.r;
                else if (a.y > CANVAS_HEIGHT + a.r) a.y = -a.r;
                
                // Check collision with players
                for (let id in room.players) {
                    let p = room.players[id];
                    if (p.lives > 0 && p.blink === 0 && Math.hypot(p.x - a.x, p.y - a.y) < a.r + 10) {
                        p.lives--;
                        p.blink = 120;
                        if (p.lives <= 0) {
                            io.to(room.code).emit('gameOver');
                        }
                    }
                }
                
                // Check collision with lasers
                for (let j = room.lasers.length - 1; j >= 0; j--) {
                    if (Math.hypot(room.lasers[j].x - a.x, room.lasers[j].y - a.y) < a.r) {
                        // Remove laser
                        room.lasers.splice(j, 1);
                        
                        // Give money to the laser owner
                        let laserOwner = room.lasers[j]?.owner;
                        if (laserOwner && room.players[laserOwner]) {
                            room.players[laserOwner].money++;
                        } else {
                            // If no owner, give to random player
                            for (let pid in room.players) {
                                room.players[pid].money++;
                                break;
                            }
                        }
                        
                        room.score += 100;
                        
                        // Split asteroid
                        if (a.r > 15) {
                            spawnAsteroids(room, 2, a.x, a.y, a.r / 2);
                        }
                        
                        room.asteroids.splice(i, 1);
                        
                        // Check level progression
                        if (room.score >= room.nextGoal) {
                            room.level++;
                            room.nextGoal += 1000 + (room.level * 200);
                            
                            // Check for boss level (every 5 levels)
                            if (room.level % 5 === 0) {
                                room.asteroids = [];
                                spawnBoss(room);
                            } else {
                                spawnAsteroids(room, 4 + room.level);
                            }
                            
                            // Give extra life if anyone has less than 3 lives
                            let extraLife = false;
                            for (let pid in room.players) {
                                if (room.players[pid].lives < 3) {
                                    room.players[pid].lives++;
                                    extraLife = true;
                                }
                            }
                            
                            io.to(room.code).emit('levelUp', { level: room.level, extraLife: extraLife });
                        }
                        break;
                    }
                }
            }
            
            // Spawn more asteroids if too few
            if (room.asteroids.length < 2) {
                spawnAsteroids(room, 1);
            }
        }
        
        // Update lasers (move and remove off-screen)
        for (let i = room.lasers.length - 1; i >= 0; i--) {
            let l = room.lasers[i];
            l.x += l.vx;
            l.y += l.vy;
            
            // Check boss collision
            if (room.boss) {
                if (Math.hypot(l.x - room.boss.x, l.y - room.boss.y) < 45) {
                    room.boss.hp--;
                    room.lasers.splice(i, 1);
                    
                    if (room.boss.hp <= 0) {
                        room.boss = null;
                        room.enemyLasers = [];
                        io.to(room.code).emit('bossDefeated');
                        room.state = 'REWARD';
                    }
                    continue;
                }
            }
            
            // Remove off-screen lasers
            if (l.x < 0 || l.x > CANVAS_WIDTH || l.y < 0 || l.y > CANVAS_HEIGHT) {
                room.lasers.splice(i, 1);
            }
        }
        
        // Check if any player has enough money for upgrades (but don't pause game)
        // Shop is available individually - game continues running
        // Players can buy upgrades at any time when they have enough money
        
        // Send game state to all players
        io.to(code).emit('gameState', room);
    }
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor escuchando en el puerto ${PORT}`));
