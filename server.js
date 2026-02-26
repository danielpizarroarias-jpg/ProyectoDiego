const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors()); // Permitir conexiones de red
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Servir archivos estáticos
app.use(express.static(__dirname));

// Cargar el menú principal al entrar a la URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'vista.html'));
});

let players = {};

io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    // Crear nuevo jugador en posición aleatoria
    players[socket.id] = {
        x: Math.random() * 800,
        y: Math.random() * 600,
        rotation: 0,
        id: socket.id
    };

    socket.emit('currentPlayers', players);
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('playerMovement', (movementData) => {
        if (players[socket.id]) {
            players[socket.id].x = movementData.x;
            players[socket.id].y = movementData.y;
            players[socket.id].rotation = movementData.rotation;
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// Usar puerto de Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor escuchando en puerto ${PORT}`);
});