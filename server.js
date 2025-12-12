const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// Allow any origin for CORS to prevent connection blocking
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files from 'public' directory
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('a user connected', socket.id);

    // Join a room 
    socket.on('join', (room) => {
        try {
            console.log(`Socket ${socket.id} joining room ${room}`);
            socket.join(room);
            const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;

            if (roomSize === 1) {
                socket.emit('created');
            } else {
                socket.emit('joined');
                socket.to(room).emit('ready');
            }
        } catch (err) {
            console.error("Error in join handler:", err);
        }
    });

    // Signaling events
    socket.on('offer', (data) => {
        socket.to(data.room).emit('offer', data.offer);
    });

    socket.on('answer', (data) => {
        socket.to(data.room).emit('answer', data.answer);
    });

    socket.on('candidate', (data) => {
        socket.to(data.room).emit('candidate', data.candidate);
    });

    socket.on('disconnect', () => {
        console.log('user disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`listening on *:${PORT}`);
});
