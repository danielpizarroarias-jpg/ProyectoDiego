const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

const rooms = {}; 

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

io.on('connection', (socket) => {
    console.log('🟢 Jugador conectado:', socket.id);

    // 1. EL JUGADOR CREA LA SALA
    socket.on('createRoom', (roomSettings) => {
        const roomCode = generateRoomCode();
        socket.join(roomCode); 
        
        rooms[roomCode] = { 
            name: roomSettings.name || 'Sala Espacial',
            maxPlayers: roomSettings.maxPlayers || 2,
            players: {} 
        };
        
        rooms[roomCode].players[socket.id] = {
            x: 400, y: 300, angle: -Math.PI/2, color: '#00f2ff' 
        };

        socket.roomCode = roomCode; 
        socket.emit('roomCreated', roomCode); 
        socket.emit('updatePlayers', rooms[roomCode].players);
    });

    // 2. EL JUGADOR SE UNE
    socket.on('joinRoom', (roomCode) => {
        roomCode = roomCode.toUpperCase();
        
        if (rooms[roomCode]) {
            const room = rooms[roomCode];
            const currentPlayersCount = Object.keys(room.players).length;

            if (currentPlayersCount >= room.maxPlayers) {
                socket.emit('errorMsg', 'La sala está llena. Límite: ' + room.maxPlayers + ' jugadores.');
                return;
            }

            socket.join(roomCode);
            socket.roomCode = roomCode;

            const colors = ['#00f2ff', '#39ff14', '#ff00ff', '#ffff00'];
            const playerColor = colors[currentPlayersCount % colors.length];

            rooms[roomCode].players[socket.id] = {
                x: 400, y: 300, angle: -Math.PI/2, color: playerColor 
            };

            socket.emit('roomJoined', { code: roomCode, name: room.name });
            io.to(roomCode).emit('updatePlayers', rooms[roomCode].players);
        } else {
            socket.emit('errorMsg', 'La sala no existe o el código es incorrecto.');
        }
    });

    // 3. EMPEZAR LA PARTIDA PARA TODOS
    socket.on('startGame', () => {
        const roomCode = socket.roomCode;
        if (roomCode) {
            io.to(roomCode).emit('gameStarted'); // Avisa a todos los de la sala
        }
    });

    // 4. MOVIMIENTO
    socket.on('playerMovement', (movementData) => {
        const roomCode = socket.roomCode;
        if (roomCode && rooms[roomCode] && rooms[roomCode].players[socket.id]) {
            rooms[roomCode].players[socket.id].x = movementData.x;
            rooms[roomCode].players[socket.id].y = movementData.y;
            rooms[roomCode].players[socket.id].angle = movementData.angle;
            
            socket.to(roomCode).emit('playerMoved', { 
                id: socket.id, 
                player: rooms[roomCode].players[socket.id] 
            });
        }
    });

    // 5. DESCONEXIÓN
    socket.on('disconnect', () => {
        console.log('🔴 Desconectado:', socket.id);
        const roomCode = socket.roomCode;
        if (roomCode && rooms[roomCode]) {
            delete rooms[roomCode].players[socket.id];
            io.to(roomCode).emit('updatePlayers', rooms[roomCode].players);
            
            if (Object.keys(rooms[roomCode].players).length === 0) {
                delete rooms[roomCode];
            }
        }
    });
});

http.listen(3000, () => {
    console.log('Servidor de Asteroids escuchando en http://localhost:3000');
});