import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, SOCKET_PATH } from '../constants/data';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const clientExamsRef = useRef([]);

  useEffect(() => {
    // Read auth credentials at connection time so the server can shard
    // operators into their assigned gpu:{id} rooms.
    // Operators → join only their gpu room(s); admin/client → join "all".
    let authPayload = {};
    try {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        authPayload = {
          role:    (u.role    || '').toUpperCase(),
          user_id: u.id ?? u.user_id ?? null,
        };
      }
    } catch (_) {
      // Ignore parse errors — server will treat this client as unauthenticated
    }

    const resolvedPath = SOCKET_PATH || '/cctv_dev/socket.io';
    const newSocket = io(SOCKET_URL, {
      path: resolvedPath,
      auth: authPayload,          // ← role + user_id sent in the handshake
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      setConnected(true);
      console.log('✅ Socket connected', authPayload);
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      console.log('❌ Socket disconnected');
    });

    newSocket.on('detections:connected', (data) => {
      console.log('📡 Socket room assignment:', data);
    });

    // unfilteredCounts is now owned entirely by page-local API fetches and
    // page-local socket handlers (Detections.jsx / ClientDetections.jsx).
    // SocketContext only manages connection state and the socket instance —
    // it must NOT call setUnfilteredCounts, otherwise every 2s backend
    // snapshot would overwrite the date-filtered counts the API just set.

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      console.log('🔌 Socket cleanup completed');
    };
  }, []);  // runs once on mount — credentials are read from localStorage

  // Method to set client exams for filtering
  const setClientExams = (examIds) => {
    clientExamsRef.current = examIds.map(id => String(id));
    console.log('🔐 Client exams set:', clientExamsRef.current);
  };

  return (
    <SocketContext.Provider value={{ socket, connected, setClientExams }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};
