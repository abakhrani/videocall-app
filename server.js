const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
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

    // Join a room (simple logic: everyone joins 'default-room' for now or a specific one)
    socket.on('join', (room) => {
        console.log(`Socket ${socket.id} joining room ${room}`);
        socket.join(room);
        // Determine if they are the initiator (first one in the room)
        const roomSize = io.sockets.adapter.rooms.get(room)?.size || 0;

        // Notify the client regarding their state (wait or ready)
        // For 2 people, first is 'created', 2nd is 'joined' -> ready to call.
        if (roomSize === 1) {
            socket.emit('created');
        } else {
            socket.emit('joined');
            // Tell everyone else in room that a new peer joined -> initiator should send offer
            socket.to(room).emit('ready');
        }
    });

    // Signaling events
    socket.on('offer', (data) => {
        // data contains { room: '...', offer: '...' }
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
