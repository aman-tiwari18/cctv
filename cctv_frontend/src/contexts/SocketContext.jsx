import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, SOCKET_PATH } from '../constants/data';
import { useDetectionCounts } from './DetectionCountsContext';
import { useLocation } from 'react-router-dom';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { setUnfilteredCounts, setAllCounts } = useDetectionCounts();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const clientExamsRef = useRef([]);
  const location = useLocation();

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

    // Listen to detection counts updates - FOR ADMIN DETECTIONS PAGE
    newSocket.on('detection:counts', (counts) => {
      console.log('📊 Received detection:counts (ADMIN) from backend:', counts);
      
      // Only update if we're on the admin detections page
      if (location.pathname === '/detections') {
        setAllCounts(counts);
        setUnfilteredCounts(counts);
        console.log('✅ Admin counts updated in context (on /detections page)');
      } else {
        console.log('⏭️  Skipping admin count update (not on /detections page)');
      }
    });

    // Listen to client detections (for live feed display only)
    newSocket.on('client-detection:new', (item) => {
      // Security check: only process if belongs to client's exams
      if (clientExamsRef.current.length === 0 || clientExamsRef.current.includes(String(item.exam_id))) {
        clientQueue.push(item);
      }
    });

    // Listen to client detection counts updates - FOR CLIENT DETECTIONS PAGE
    newSocket.on('client-detection:counts', (counts) => {
      console.log('📊 Received client-detection:counts (CLIENT) from backend:', counts);
      
      // Only update if we're on the client detections page
      if (location.pathname === '/client-detections') {
        setUnfilteredCounts(counts);
        setAllCounts(counts);
        console.log('✅ Client counts updated in context (on /client-detections page)');
      } else {
        console.log('⏭️  Skipping client count update (not on /client-detections page)');
      }
    });

    setSocket(newSocket);

    return () => {
      if (syncInterval) clearInterval(syncInterval);
      newSocket.disconnect();
      console.log('🔌 Socket cleanup completed');
    };
  }, [setUnfilteredCounts, setAllCounts, location.pathname]);

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
