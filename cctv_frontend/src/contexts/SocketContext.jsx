import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, SOCKET_PATH } from '../constants/data';
import { useDetectionCounts } from './DetectionCountsContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { setUnfilteredCounts, setAllCounts } = useDetectionCounts();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const clientExamsRef = useRef([]);

  useEffect(() => {
    const resolvedPath = SOCKET_PATH || '/cctv_dev/socket.io';
    const newSocket = io(SOCKET_URL, {
      path: resolvedPath,
      transports: ['polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    let adminQueue = [];
    let clientQueue = [];
    let syncInterval;

    newSocket.on('connect', () => {
      setConnected(true);
      console.log('✅ Socket connected');

      // Process queues every 2 seconds for consistent batching
      syncInterval = setInterval(() => {
        // Process admin detections
        if (adminQueue.length > 0) {
          const batch = [...adminQueue];
          adminQueue = [];

          const typeIncrements = {};
          batch.forEach(item => {
            typeIncrements[item.type] = (typeIncrements[item.type] || 0) + 1;
          });

          setUnfilteredCounts(prev => {
            const next = { ...prev };
            for (const t in typeIncrements) {
              next[t] = (next[t] || 0) + typeIncrements[t];
            }
            return next;
          });

          setAllCounts(prev => {
            const next = { ...prev };
            for (const t in typeIncrements) {
              next[t] = (next[t] || 0) + typeIncrements[t];
            }
            return next;
          });

          console.log(`📊 Processed ${batch.length} admin detections`);
        }

        // Process client detections
        if (clientQueue.length > 0) {
          const batch = [...clientQueue];
          clientQueue = [];

          const typeIncrements = {};
          batch.forEach(item => {
            typeIncrements[item.type] = (typeIncrements[item.type] || 0) + 1;
          });

          setUnfilteredCounts(prev => {
            const next = { ...prev };
            for (const t in typeIncrements) {
              next[t] = (next[t] || 0) + typeIncrements[t];
            }
            return next;
          });

          setAllCounts(prev => {
            const next = { ...prev };
            for (const t in typeIncrements) {
              next[t] = (next[t] || 0) + typeIncrements[t];
            }
            return next;
          });

          console.log(`📊 Processed ${batch.length} client detections`);
        }
      }, 2000); // Consistent 2-second batching
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      if (syncInterval) clearInterval(syncInterval);
      console.log('❌ Socket disconnected');
    });

    // Listen to admin detections
    newSocket.on('detection:new', (item) => {
      adminQueue.push(item);
    });

    // Listen to client detections
    newSocket.on('client-detection:new', (item) => {
      // Security check: only process if belongs to client's exams
      if (clientExamsRef.current.length === 0 || clientExamsRef.current.includes(String(item.exam_id))) {
        clientQueue.push(item);
      }
    });

    setSocket(newSocket);

    return () => {
      if (syncInterval) clearInterval(syncInterval);
      newSocket.disconnect();
      console.log('🔌 Socket cleanup completed');
    };
  }, [setUnfilteredCounts, setAllCounts]);

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
