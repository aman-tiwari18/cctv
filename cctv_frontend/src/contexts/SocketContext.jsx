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
  // Keep the current pathname in a ref so socket handlers can read its LATEST
  // value without needing pathname in the effect's deps. With pathname in deps,
  // every route change tore down and reconnected the socket — and the polling
  // reconnect window swallowed the next detection:counts emission, which is
  // exactly why the live counters stopped ticking until a manual refresh.
  const pathnameRef = useRef(location.pathname);
  useEffect(() => { pathnameRef.current = location.pathname; }, [location.pathname]);

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

    // Listen to detection counts updates — authoritative snapshot from backend.
    // Apply it whenever the user is on a page that consumes detection counters
    // (admin /detections, /dashboard, etc.). Do NOT hard-gate to a single path
    // — the sidebar and header pill in Layout.jsx consume unfilteredCounts on
    // every page and must reflect reality. The page-level handlers in
    // Detections.jsx do their own optimistic per-event bumps; this snapshot
    // reconciles the running total.
    newSocket.on('detection:counts', (counts) => {
      console.log('📊 Received detection:counts (ADMIN) from backend:', counts);
      const path = pathnameRef.current;
      // Skip only when the client-detections page is the active view — that
      // page is driven by client-detection:counts and shouldn't be clobbered
      // by the admin-side snapshot.
      if (path === '/client-detections') {
        console.log('⏭️  Skipping admin count update (on /client-detections page)');
        return;
      }
      setAllCounts(counts);
      setUnfilteredCounts(counts);
      console.log('✅ Admin counts updated in context');
    });

    // Listen to client detections (for live feed display only)
    newSocket.on('client-detection:new', (item) => {
      // Security check: only process if belongs to client's exams
      if (clientExamsRef.current.length === 0 || clientExamsRef.current.includes(String(item.exam_id))) {
        clientQueue.push(item);
      }
    });

    // Listen to client detection counts updates — only apply on the client
    // page, otherwise we'd overwrite admin counters with client-only totals.
    newSocket.on('client-detection:counts', (counts) => {
      console.log('📊 Received client-detection:counts (CLIENT) from backend:', counts);
      const path = pathnameRef.current;
      if (path !== '/client-detections') {
        console.log('⏭️  Skipping client count update (not on /client-detections page)');
        return;
      }
      setUnfilteredCounts(counts);
      setAllCounts(counts);
      console.log('✅ Client counts updated in context (on /client-detections page)');
    });

    setSocket(newSocket);

    return () => {
      if (syncInterval) clearInterval(syncInterval);
      newSocket.disconnect();
      console.log('🔌 Socket cleanup completed');
    };
    // IMPORTANT: pathname is intentionally NOT a dep — the handlers read it
    // from pathnameRef at fire time. Keeping it as a dep caused the socket to
    // reconnect on every navigation, dropping events during the reconnect.
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
