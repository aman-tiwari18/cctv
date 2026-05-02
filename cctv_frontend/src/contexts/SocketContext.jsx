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
        // Process admin detections (for live feed display, not for counts)
        if (adminQueue.length > 0) {
          const batch = [...adminQueue];
          adminQueue = [];
          console.log(`📊 Processed ${batch.length} admin detections (for live feed)`);
        }

        // Process client detections (for live feed display, not for counts)
        if (clientQueue.length > 0) {
          const batch = [...clientQueue];
          clientQueue = [];
          console.log(`📊 Processed ${batch.length} client detections (for live feed)`);
        }
      }, 2000); // Consistent 2-second batching
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      if (syncInterval) clearInterval(syncInterval);
      console.log('❌ Socket disconnected');
    });

    // Listen to admin detections (for live feed display only)
    newSocket.on('detection:new', (item) => {
      adminQueue.push(item);
    });

    // Listen to detection counts updates - THIS IS THE SOURCE OF TRUTH FOR COUNTS
    newSocket.on('detection:counts', (counts) => {
      console.log('📊 Received detection:counts from backend:', counts);
      
      // Set absolute counts (not incremental)
      setUnfilteredCounts(counts);
      setAllCounts(counts);
      
      console.log('✅ Counts updated in context');
    });

    // Listen to client detections (for live feed display only)
    newSocket.on('client-detection:new', (item) => {
      // Security check: only process if belongs to client's exams
      if (clientExamsRef.current.length === 0 || clientExamsRef.current.includes(String(item.exam_id))) {
        clientQueue.push(item);
      }
    });

    // Listen to client detection counts updates
    newSocket.on('client-detection:counts', (counts) => {
      console.log('📊 Received client-detection:counts from backend:', counts);
      
      // Set absolute counts (not incremental)
      setUnfilteredCounts(counts);
      setAllCounts(counts);
      
      console.log('✅ Client counts updated in context');
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
