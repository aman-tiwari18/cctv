import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { SOCKET_URL, SOCKET_PATH } from '../constants/data';
import { useDetectionCounts } from './DetectionCountsContext';

const SocketContext = createContext(null);

const todayIso = () => new Date().toISOString().slice(0, 10);

const normalizeDateValue = (value) => {
  if (!value) return '';
  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  const ddmmyyyy = text.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const isTodayDetection = (item) => {
  const itemDate = normalizeDateValue(item?.date || item?.examDate || item?.exam_date);
  return !itemDate || itemDate === todayIso();
};

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

    newSocket.on('connect', () => {
      setConnected(true);
      console.log('✅ Socket connected');
    });

    newSocket.on('disconnect', () => {
      setConnected(false);
      console.log('❌ Socket disconnected');
    });

    // === ADMIN: detection:new ===========================================
    // Each live admin detection bumps the per-type counter immediately.
    // This is the SINGLE source of truth for incremental count updates —
    // running it here (in the always-mounted SocketProvider) instead of in
    // the Detections page ensures the sidebar and header pill update even
    // if the page is mid-mount, mid-remount, or behind a route transition.
    // The trailing `detection:counts` snapshot reconciles to the backend's
    // authoritative total on every 2s tick.
    newSocket.on('detection:new', (item) => {
      if (!isTodayDetection(item)) return;
      const t = item?.type;
      if (!t) return;
      console.log(`[Socket] detection:new type=${t} → bumping counts +1`);
      setUnfilteredCounts(prev => ({ ...prev, [t]: (prev[t] || 0) + 1 }));
      setAllCounts(prev => ({ ...prev, [t]: (prev[t] || 0) + 1 }));
    });

    // === ADMIN: detection:counts snapshot ===============================
    // Authoritative count snapshot from the backend (every ~2s). Always
    // apply it — no path gating. The sidebar/header in Layout.jsx consume
    // unfilteredCounts on every page (Dashboard, Detections, etc.) and
    // must reflect reality everywhere. The previous gating
    // (`if (location.pathname === '/detections')`) was also fragile under
    // the `basename='/cctv_analytics'` Router config and was the reason
    // counters froze until a manual refresh.
    newSocket.on('detection:counts', (counts) => {
      console.log('📊 detection:counts snapshot:', counts);
      setUnfilteredCounts(counts || {});
      setAllCounts(counts || {});
    });

    // === CLIENT: client-detection:new ===================================
    newSocket.on('client-detection:new', (item) => {
      if (!isTodayDetection(item)) return;
      // Security check: only process if belongs to client's exams
      if (
        clientExamsRef.current.length > 0 &&
        !clientExamsRef.current.includes(String(item?.exam_id))
      ) {
        return;
      }
      const t = item?.type;
      if (!t) return;
      console.log(`[Socket] client-detection:new type=${t} → bumping counts +1`);
      setUnfilteredCounts(prev => ({ ...prev, [t]: (prev[t] || 0) + 1 }));
      setAllCounts(prev => ({ ...prev, [t]: (prev[t] || 0) + 1 }));
    });

    // === CLIENT: client-detection:counts snapshot =======================
    // Authoritative snapshot for client-pushed counts. Applied
    // unconditionally too — the client sidebar/header should always reflect
    // the latest pushed totals when this event arrives.
    newSocket.on('client-detection:counts', (counts) => {
      console.log('📊 client-detection:counts snapshot:', counts);
      setUnfilteredCounts(counts || {});
      setAllCounts(counts || {});
    });

    // === CLIENT: client-detection:remove ================================
    // When admin un-pushes, decrement the per-type counter immediately;
    // the next client-detection:counts snapshot will reconcile.
    newSocket.on('client-detection:remove', (data) => {
      const t = data?.type;
      if (!t) return;
      console.log(`[Socket] client-detection:remove type=${t} → bumping counts -1`);
      setUnfilteredCounts(prev => ({ ...prev, [t]: Math.max(0, (prev[t] || 0) - 1) }));
      setAllCounts(prev => ({ ...prev, [t]: Math.max(0, (prev[t] || 0) - 1) }));
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      console.log('🔌 Socket cleanup completed');
    };
    // Deps are ONLY the stable setState setters. No pathname / no router
    // state — the socket lives for the entire app session and is never
    // recreated mid-flight (which previously dropped events during the
    // polling reconnect window).
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
