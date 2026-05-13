import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, SOCKET_PATH } from '../constants/data';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const clientExamsRef = useRef([]);

  useEffect(() => {
    const resolvedPath = SOCKET_PATH || '/cctv_dev/socket.io';
    const newSocket = io(SOCKET_URL, {
      path: resolvedPath,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      setConnected(true);
      console.log('✅ Socket connected');
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      console.log('❌ Socket disconnected');
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
  }, []);

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
