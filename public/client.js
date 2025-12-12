const socket = io();

// DOM elements
const joinScreen = document.getElementById('join-screen');
const videoScreen = document.getElementById('video-screen');
const roomInput = document.getElementById('roomInput');
const joinBtn = document.getElementById('joinBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const muteBtn = document.getElementById('muteBtn');
const cameraBtn = document.getElementById('cameraBtn');
const leaveBtn = document.getElementById('leaveBtn');

// Debug Logger
// Debug Logger
const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);

function log(msg) {
    originalLog(msg);
    const logDiv = document.getElementById('debug-log');
    if (logDiv) {
        const line = document.createElement('div');
        line.textContent = `${new Date().toLocaleTimeString()} - ${msg}`;
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}
window.console.log = log;
window.console.error = (msg) => {
    originalError(msg);
    log("ERROR: " + msg);
};

// Variables
let localStream;
let peerConnection;
let roomName;
let isAudioMuted = false;
let isVideoStopped = false;

// Chroma Key Variables
let isGreenScreenEnabled = false;
const processCanvas = document.getElementById('processCanvas');
const ctx = processCanvas.getContext('2d', { willReadFrequently: true });
const greenBtn = document.getElementById('greenBtn');
const toleranceInput = document.getElementById('tolerance');
let processingInterval;

// Show green screen controls only if URL has ?role=host
// Show green screen controls only if URL has ?role=host
const greenControls = document.getElementById('green-controls');
greenControls.style.display = 'none'; // Ensure hidden by default

const urlParams = new URLSearchParams(window.location.search);
console.log("Checking role...", urlParams.get('role'));
if (urlParams.get('role') === 'host') {
    greenControls.style.display = 'flex';
}

greenBtn.addEventListener('click', () => {
    isGreenScreenEnabled = !isGreenScreenEnabled;
    greenBtn.textContent = isGreenScreenEnabled ? 'Disable Green Screen' : 'Enable Green Screen';
    greenBtn.style.background = isGreenScreenEnabled ? '#44ff44' : '';
    greenBtn.style.color = isGreenScreenEnabled ? 'black' : 'white';

    if (isGreenScreenEnabled) {
        startProcessing();
    } else {
        stopProcessing();
    }
});

function startProcessing() {
    if (!localStream) return;

    // Set canvas size to match video
    const videoTrack = localStream.getVideoTracks()[0];
    const settings = videoTrack.getSettings();
    processCanvas.width = settings.width || 640;
    processCanvas.height = settings.height || 480;

    // Start loop
    function loop() {
        if (!isGreenScreenEnabled) return;

        ctx.drawImage(localVideo, 0, 0, processCanvas.width, processCanvas.height);
        const frame = ctx.getImageData(0, 0, processCanvas.width, processCanvas.height);
        const l = frame.data.length / 4;
        const tol = parseInt(toleranceInput.value);

        for (let i = 0; i < l; i++) {
            const r = frame.data[i * 4 + 0];
            const g = frame.data[i * 4 + 1];
            const b = frame.data[i * 4 + 2];

            // Green Screen Logic (Simple RGB check)
            // If G is dominant and significantly brighter than R and B
            if (g > r + tol && g > b + tol) {
                // Turn to Black
                frame.data[i * 4 + 0] = 0;
                frame.data[i * 4 + 1] = 0;
                frame.data[i * 4 + 2] = 0;
                // Alpha 255 (Opaque)
                frame.data[i * 4 + 3] = 255;
            }
        }
        ctx.putImageData(frame, 0, 0);
        requestAnimationFrame(loop);
    }
    loop();

    // Replace the track being sent to peer
    const canvasStream = processCanvas.captureStream(30);
    const canvasTrack = canvasStream.getVideoTracks()[0];

    if (peerConnection) {
        const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(canvasTrack);
        }
    }
}

function stopProcessing() {
    // Revert to original camera track
    if (peerConnection && localStream) {
        const originalTrack = localStream.getVideoTracks()[0];
        const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
        if (sender) {
            sender.replaceTrack(originalTrack);
        }
    }
}

// STUN servers configuration
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// --- UI Event Listeners ---

joinBtn.addEventListener('click', () => {
    roomName = roomInput.value;
    if (roomName) {
        joinRoom(roomName);
    }
});

muteBtn.addEventListener('click', () => {
    isAudioMuted = !isAudioMuted;
    localStream.getAudioTracks()[0].enabled = !isAudioMuted;
    muteBtn.textContent = isAudioMuted ? 'Unmute Audio' : 'Mute Audio';
    muteBtn.style.background = isAudioMuted ? '#ff4444' : 'rgba(255,255,255,0.2)';
});

cameraBtn.addEventListener('click', () => {
    isVideoStopped = !isVideoStopped;
    localStream.getVideoTracks()[0].enabled = !isVideoStopped;
    cameraBtn.textContent = isVideoStopped ? 'Start Video' : 'Stop Video';
    cameraBtn.style.background = isVideoStopped ? '#ff4444' : 'rgba(255,255,255,0.2)';
});

leaveBtn.addEventListener('click', () => {
    location.reload();
});

window.addEventListener('beforeunload', () => {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
        peerConnection.close();
    }
});

// --- WebRTC Functions ---

async function joinRoom(room) {
    try {
        log('Requesting getUserMedia...');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error(
                'Browser API "navigator.mediaDevices" is missing. \n' +
                'This usually happens if you are using HTTP instead of HTTPS on a non-localhost device.\n' +
                'Please use the HTTPS version of this site (it might likely be running on https://...:3000).'
            );
        }

        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        log('Stream acquired. Tracks: ' + localStream.getTracks().length);

        localVideo.srcObject = localStream;
        localVideo.onloadedmetadata = async () => {
            log('Video metadata loaded. Attempting play...');
            try {
                await localVideo.play();
                log('Video playing!');
            } catch (e) {
                log('Play failed: ' + e.message);
            }
        };

        joinScreen.classList.add('hidden');
        videoScreen.classList.remove('hidden');

        socket.emit('join', room);
    } catch (err) {
        log('Error accessing media devices: ' + err.name + ' - ' + err.message);
        alert('Could not access camera/microphone. Please check permissions. \n' + err.message);
    }
}

// Socket Events

socket.on('created', () => {
    console.log('Created room. Waiting for others...');
});

socket.on('joined', () => {
    console.log('Joined room. Ready.');
});

socket.on('ready', () => {
    // This peer is the "initiator" now because someone else joined an empty room
    // Or we joined a room where someone was waiting? 
    // Actually, 'ready' is sent to the existing peer when a new peer joins.
    // So the existing peer should create the offer.
    console.log('Ready event received. Initiating call...');
    createOffer();
});

// Signaling Handlers

socket.on('offer', async (offer) => {
    console.log('Received offer');
    if (!peerConnection) createPeerConnection(); // In case we are the receiver
    try {
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', { room: roomName, answer: answer });
    } catch (err) {
        console.error('Error handling offer:', err);
    }
});

socket.on('answer', async (answer) => {
    console.log('Received answer');
    try {
        await peerConnection.setRemoteDescription(answer);
    } catch (err) {
        console.error('Error handling answer:', err);
    }
});

socket.on('candidate', async (candidate) => {
    console.log('Received ICE candidate');
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(candidate);
        }
    } catch (err) {
        console.error('Error adding ICE candidate:', err);
    }
});


function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('candidate', { room: roomName, candidate: event.candidate });
        }
    };

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }
}

async function createOffer() {
    createPeerConnection();
    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('offer', { room: roomName, offer: offer });
    } catch (err) {
        console.error('Error creating offer:', err);
    }
}
