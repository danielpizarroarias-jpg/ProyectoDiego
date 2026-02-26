const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

// Configuración de Socket.io para la nube
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Servir archivos estáticos de la carpeta
app.use(express.static(__dirname));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'vista.html'));
});

// Lógica de jugadores
let players = {};

io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    // Crear estado inicial
    players[socket.id] = {
        x: Math.random() * 800,
        y: Math.random() * 600,
        rotation: 0,
        id: socket.id
    };

    // Enviar lista de jugadores al nuevo
    socket.emit('currentPlayers', players);
    // Avisar a los demás
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Recibir y reenviar movimiento
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

// IMPORTANTE: process.env.PORT para Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor activo en puerto ${PORT}`);
});