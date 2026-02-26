const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir archivos estáticos de la carpeta actual
app.use(express.static(__dirname));

// Objeto para guardar todas las salas activas
const rooms = {};

// Función para crear un código de 4 letras aleatorio
function generateRoomCode() {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 4; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

io.on('connection', (socket) => {
    console.log('Nuevo usuario conectado:', socket.id);

    // ==========================================
    // LÓGICA DEL LOBBY (vistajuegoonline.html)
    // ==========================================
    
    // El jugador crea una sala
    socket.on('createRoom', (roomName) => {
        let code = generateRoomCode();
        while (rooms[code]) { code = generateRoomCode(); } // Evitar que se repita el código

        socket.join(code);
        socket.roomId = code; // Guardamos en el socket en qué sala está

        // Inicializamos la sala
        rooms[code] = {
            name: roomName || "Sala Espacial",
            players: {},
            state: 'lobby'
        };

        // Añadimos al creador (Host) a la sala
        rooms[code].players[socket.id] = { color: '#39ff14', isHost: true };

        // Le respondemos a tu HTML con los eventos que está esperando
        socket.emit('roomCreated', code);
        io.to(code).emit('updatePlayers', rooms[code].players);
    });

    // Un jugador intenta unirse con un código
    socket.on('joinRoom', (code) => {
        if (rooms[code] && rooms[code].state === 'lobby') {
            socket.join(code);
            socket.roomId = code;
            
            // Añadimos al jugador a la sala
            rooms[code].players[socket.id] = { color: '#00f2ff', isHost: false };
            
            // Le respondemos a tu HTML
            socket.emit('roomJoined', code, rooms[code].name);
            io.to(code).emit('updatePlayers', rooms[code].players);
        } else {
            // Si el código no existe o ya están jugando, mandamos el error que tu HTML espera
            socket.emit('errorMsg', 'La sala no existe o la partida ya ha empezado.');
        }
    });

    // El host le da a "¡EMPEZAR PARTIDA!"
    socket.on('startGame', () => {
        if (socket.roomId && rooms[socket.roomId]) {
            rooms[socket.roomId].state = 'playing';
            // Avisa a todos en la sala para que ejecuten tu window.location.href
            io.to(socket.roomId).emit('gameStarted');
        }
    });

    // ==========================================
    // LÓGICA DEL JUEGO (juegoonline.html)
    // ==========================================

    // Cuando el jugador cambia de HTML, el cliente tiene que avisar a qué sala vuelve a entrar
    socket.on('joinGameRoom', (code) => {
        if (rooms[code]) {
            socket.join(code);
            socket.roomId = code;
            
            // Inicializamos sus coordenadas en el juego
            rooms[code].players[socket.id] = {
                x: 400, y: 300, rotation: 0, id: socket.id
            };

            // Le mandamos los que ya están y avisamos a los demás
            socket.emit('currentPlayers', rooms[code].players);
            socket.to(code).emit('newPlayer', rooms[code].players[socket.id]);
        }
    });

    // Movimiento dentro de la partida (solo se envía a los de su misma sala)
    socket.on('playerMovement', (movementData) => {
        const code = socket.roomId;
        if (code && rooms[code] && rooms[code].players[socket.id]) {
            rooms[code].players[socket.id].x = movementData.x;
            rooms[code].players[socket.id].y = movementData.y;
            rooms[code].players[socket.id].rotation = movementData.rotation;
            
            socket.to(code).emit('playerMoved', rooms[code].players[socket.id]);
        }
    });

    // ==========================================
    // DESCONEXIÓN
    // ==========================================
    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
        const code = socket.roomId;
        
        if (code && rooms[code]) {
            // Borramos al jugador de la sala
            delete rooms[code].players[socket.id];
            
            // Si la sala se queda vacía, la eliminamos para no gastar memoria
            if (Object.keys(rooms[code].players).length === 0) {
                delete rooms[code];
            } else {
                // Si aún queda gente, les actualizamos la información
                if (rooms[code].state === 'lobby') {
                    io.to(code).emit('updatePlayers', rooms[code].players);
                } else {
                    io.to(code).emit('playerDisconnected', socket.id);
                }
            }
        }
    });
});

// Usamos el puerto dinámico para que Render funcione, o el 3000 si estás en local
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});