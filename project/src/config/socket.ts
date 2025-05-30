import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:3001';

export const socket: Socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
});

export const joinRoom = (roomId: string, role: 'streamer' | 'viewer' = 'viewer') => {
  socket.emit('join-room', { roomId, role });
};

export const leaveRoom = () => {
  socket.emit('leave-room');
};

export const emitStream = (roomId: string, data: any) => {
  socket.emit('stream-video', { roomId, data });
};

export const onStream = (callback: (data: any) => void) => {
  socket.on('receive-stream', callback);
};


