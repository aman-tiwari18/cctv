import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Card, Typography, Chip,
  TextField, Select, MenuItem, FormControl, InputLabel,
  ToggleButtonGroup, ToggleButton, Pagination, TablePagination,
  IconButton, Skeleton,
  InputAdornment, Button, Snackbar, Alert,
} from '@mui/material';
import {
  Search, CameraAlt,
  AccessTime, Warning, Person, FilterList, Refresh, Event, LocationCity,
  Groups, Dns, DirectionsWalk, MeetingRoom, Smartphone, Visibility,
  WarningAmber, ImageNotSupported, FlipCameraAndroid, SecurityUpdateWarning,
  VisibilityOff, PersonOff,
  ChevronLeft, ChevronRight, ViewCarousel, ViewList,
  PersonAdd, KeyboardArrowDown
} from '@mui/icons-material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { enGB } from 'date-fns/locale';
import axios from 'axios';
import { io } from 'socket.io-client';
import { API_BASE_1, IMG_BASE, SOCKET_URL, SOCKET_PATH } from '../constants/data';
import { useDetectionCounts } from '../contexts/DetectionCountsContext';

const TYPE_META = {
  proximity: { label: 'Close Proximity', color: '#f59e0b', bg: '#fef3c7', iconKey: 'proximity' },
  crowd: { label: 'Crowd Detection', color: '#3b82f6', bg: '#dbeafe', iconKey: 'crowd' },
  crowd_five: { label: 'Crowd < 5', color: '#2563eb', bg: '#dbeafe', iconKey: 'crowd_five' },
  crowd_zero: { label: 'Zero Person', color: '#0f766e', bg: '#ccfbf1', iconKey: 'crowd_zero' },
  server: { label: 'Server Room', color: '#ef4444', bg: '#fee2e2', iconKey: 'server' },
  intruder: { label: 'Intruder', color: '#8b5cf6', bg: '#ede9fe', iconKey: 'intruder' },
  entry_exit: { label: 'Entry/Exit', color: '#10b981', bg: '#d1fae5', iconKey: 'entry_exit' },
  phone: { label: 'Phone', color: '#6366f1', bg: '#e0e7ff', iconKey: 'phone' },
  blind_spot: { label: 'Blind Spot', color: '#7c3aed', bg: '#ede9fe', iconKey: 'blind_spot' },
  invigilator: { label: 'Invigilator', color: '#ec4899', bg: '#fce7f3', iconKey: 'invigilator' },
  inversion: { label: 'Camera Inversion', color: '#0ea5e9', bg: '#e0f2fe', iconKey: 'inversion' },
  tamper: { label: 'Camera Tampering', color: '#dc2626', bg: '#fef2f2', iconKey: 'tamper' },
};



const formatDateDDMMYYYY = (dateInput) => {
  const date = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ? new Date(dateInput) : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const parseDateForQuery = (value) => {
  if (!value) return '';
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoMatch) return value;
  const dmyMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  return value;
};

const parseDDMMYYYYToDate = (value) => {
  if (!value) return null;
  const match = /^([0-3]\d)-([0-1]\d)-(\d{4})$/.exec(value);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return new Date(yyyy, mm - 1, dd);
};

/** Extract HH:MM:SS in 24h from "08 Apr 2026, 03:47:50 PM" */
const parseDetectedAtTime = (detectedAt) => {
  if (!detectedAt) return null;
  const m = /,\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i.exec(detectedAt);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const sec = parseInt(m[3], 10);
  const ampm = m[4].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 3600 + min * 60 + sec;
};

const timeStringToSeconds = (t) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 3600 + m * 60;
};

const todayDate = formatDateDDMMYYYY(new Date());


function CarouselView({ data, currentIndex, onIndexChange, onPushToClient, copyingToClient }) {
  const thumbRef = useRef(null);
  const containerRef = useRef(null);
  const item = data[currentIndex];
  if (!item) return null;

  const meta = TYPE_META[item.type] || { label: item.type, color: '#94a3b8' };
  const centerName = item.centerName || item.centre_name || '-';
  const cameraName = item.cameraName || item.camera_name || item.camera_id || '-';
  const city = item.city || '-';
  const examDate = item.examDate || (item.date ? item.date.split('-').reverse().join('-') : '-');

  const goPrev = () => onIndexChange(Math.max(0, currentIndex - 1));
  const goNext = () => onIndexChange(Math.min(data.length - 1, currentIndex + 1));

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentIndex, data.length]);

  useEffect(() => {
    if (thumbRef.current) {
      const el = thumbRef.current.children[currentIndex];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [currentIndex]);

  return (
    <Box ref={containerRef} tabIndex={-1} sx={{ outline: 'none' }}>
      <Typography variant="h6" fontWeight={300} fontSize={12} textAlign="center" sx={{ mb: 1, mt: 0 }}>
        {currentIndex + 1} / {data.length} {meta.label} Detections
      </Typography>

      <Box sx={{ position: 'relative', bgcolor: '#0f172a', borderRadius: 3, overflow: 'hidden', mb: 1 }}>
        <IconButton
          onClick={goPrev}
          disabled={currentIndex === 0}
          sx={{
            position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 3,
            bgcolor: 'rgba(255,255,255,0.9)', '&:hover': { bgcolor: '#fff' }, '&.Mui-disabled': { opacity: 0.3 },
          }}
        >
          <ChevronLeft />
        </IconButton>
        <IconButton
          onClick={goNext}
          disabled={currentIndex === data.length - 1}
          sx={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 3,
            bgcolor: 'rgba(255,255,255,0.9)', '&:hover': { bgcolor: '#fff' }, '&.Mui-disabled': { opacity: 0.3 },
          }}
        >
          <ChevronRight />
        </IconButton>

        <Box
          component="img"
          src={`${IMG_BASE}${item.image_url}`}
          alt={item.camera_id}
          sx={{ width: '100%', height: 550, objectFit: 'contain', display: 'block' }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />

        {/* Details overlay */}
        <Box sx={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'linear-gradient(transparent, rgba(15,23,42,0.85))',
          p: 2.5, pt: 5, color: '#fff',
        }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Box>
              <Box display="flex" gap={1} alignItems="center">
                <Typography variant="caption" color="#94a3b8">
                  Cam:
                </Typography>
                <Typography variant="subtitle1" fontWeight={700}>
                  {cameraName}
                </Typography>
              </Box>

              <Box display="flex" gap={1} alignItems="center">
                <Typography variant="caption" color="#94a3b8">
                  Center:
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {centerName}
                </Typography>
              </Box>
              <Box display="flex" gap={1} alignItems="center">
                <Typography variant="caption" color="#94a3b8">
                  City:
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {city}
                </Typography>
              </Box>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Event sx={{ fontSize: 16, color: '#94a3b8' }} />
            <Typography variant="body2" color="#94a3b8">
              {item.detected_at || '-'}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Push to Client button — outside image, bottom center */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2, mt: 2 }}>
        <Button
          variant="contained"
          startIcon={<PersonAdd />}
          disabled={copyingToClient}
          onClick={() => onPushToClient([item])}
          sx={{
            bgcolor: '#2563eb',
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 700,
            px: 4,
            '&:hover': { bgcolor: '#1d4ed8' },
          }}
        >
          {copyingToClient ? 'Pushing...' : 'Push to Client'}
        </Button>
      </Box>

      {/* Counter */}
      {/* <Typography variant="body2" textAlign="center" color="text.secondary" sx={{ mb: 1 }}>
        {currentIndex + 1} of {data.length}
      </Typography> */}

      {/* Thumbnail strip */}
      <Box
        ref={thumbRef}
        sx={{
          display: 'flex', gap: 1, overflowX: 'auto', pb: 1, px: 1,
          '&::-webkit-scrollbar': { height: 4 },
          '&::-webkit-scrollbar-thumb': { bgcolor: '#cbd5e1', borderRadius: 2 },
        }}
      >
        {data.map((thumbItem, idx) => (
          <Box
            key={`${thumbItem.filename}-${idx}`}
            onClick={() => onIndexChange(idx)}
            sx={{
              flexShrink: 0, width: 100, cursor: 'pointer', textAlign: 'center',
              borderRadius: 1.5, border: idx === currentIndex ? '2px solid #2563eb' : '2px solid transparent',
              overflow: 'hidden', transition: 'border-color 0.15s',
            }}
          >
            <Box
              component="img"
              src={`${IMG_BASE}${thumbItem.image_url}`}
              alt=""
              sx={{ width: '100%', height: 60, objectFit: 'cover', display: 'block' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <Typography
              variant="caption"
              fontWeight={idx === currentIndex ? 700 : 500}
              color={idx === currentIndex ? '#2563eb' : 'text.secondary'}
              sx={{ display: 'block', mt: 0.3 }}
            >
              {thumbItem.detected_at || '-'}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}


function ListViewPanel({ data, selectedIndex, onSelect, onPushToClient, copyingToClient }) {
  const item = data[selectedIndex];

  return (
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 260px)', minHeight: 500 }}>
      <Box sx={{
        width: 400, flexShrink: 0, overflowY: 'auto',
        borderRight: '1px solid #e2e8f0', pr: 1,
        bgcolor: '#ffffff',
      }}>
        {data.map((listItem, idx) => {
          const isActive = idx === selectedIndex;
          const centerName = listItem.centerName || listItem.centre_name || '-';
          const cameraName = listItem.cameraName || listItem.camera_name || listItem.camera_id || '-';
          const city = listItem.city || '-';

          return (
            <Box
              key={`${listItem.filename}-${idx}`}
              onClick={() => onSelect(idx)}
              sx={{
                display: 'flex',
                alignItems: 'stretch',
                mb: 0.5,
                cursor: 'pointer',
                bgcolor: isActive ? '#eff6ff' : 'transparent',
                borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
                '&:hover': { bgcolor: isActive ? '#eff6ff' : '#f8fafc' },
              }}
            >
              <Box
                component="img"
                src={`${IMG_BASE}${listItem.image_url}`}
                alt={listItem.camera_id}
                sx={{
                  width: { xs: 62, sm: 70, md: 50 },
                  height: { xs: 62, sm: 70, md: 50 },
                  flexShrink: 0,
                  objectFit: 'cover',
                  alignSelf: 'center',
                  borderRadius: 1,
                  m: 1,
                }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />

              <Box sx={{ p: 1.5, flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2" fontWeight={700} color="#2563eb" noWrap>
                    {listItem.detected_at || '-'}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
                  {centerName}, {cameraName}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>
                  {city}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Right panel unchanged */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {item ? (
          <>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              {(TYPE_META[item.type] || { label: item.type }).label}
            </Typography>

            <Box sx={{
              position: 'relative', borderRadius: 3, overflow: 'hidden', bgcolor: '#0f172a', flex: 1, height: '70vh',
              maxHeight: 650
            }}>
              <Box
                component="img"
                src={`${IMG_BASE}${item.image_url}`}
                alt={item.camera_id}
                sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />

              <Box sx={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(15,23,42,0.85))',
                p: 2, pt: 4, color: '#fff',
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, alignItems: 'flex-start' }}>
                  <Box>
                    <Box display="flex" gap={1} alignItems="center">
                      <Typography variant="caption" color="#94a3b8">Cam:</Typography>
                      <Typography variant="subtitle1" fontWeight={700}>
                        {item.cameraName || item.camera_id || '-'}
                      </Typography>
                    </Box>
                    <Box display="flex" gap={1} alignItems="center">
                      <Typography variant="caption" color="#94a3b8">Center:</Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {item.centerName || item.centre_name || '-'}
                      </Typography>
                    </Box>
                    <Box display="flex" gap={1} alignItems="center">
                      <Typography variant="caption" color="#94a3b8">City:</Typography>
                      <Typography variant="body2" fontWeight={600}>{item.city || '-'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Event sx={{ fontSize: 16, color: '#94a3b8' }} />
                      <Typography variant="body2" color="#94a3b8">{item.detected_at || '-'}</Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="contained"
                startIcon={<PersonAdd />}
                disabled={copyingToClient}
                onClick={() => onPushToClient([item])}
                sx={{
                  bgcolor: '#2563eb', borderRadius: 2, textTransform: 'none',
                  fontWeight: 700, px: 4, '&:hover': { bgcolor: '#1d4ed8' },
                }}
              >
                {copyingToClient ? 'Pushing...' : 'Push to Client'}
              </Button>
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">Select a detection to preview</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}


export default function Detections() {
  const { setAllCounts, typeFilter, setTypeFilter } = useDetectionCounts();

  const [data, setData] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [view, setView] = useState('carousel');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(todayDate);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [appliedStartTime, setAppliedStartTime] = useState('');
  const [appliedEndTime, setAppliedEndTime] = useState('');
  const [copyingToClient, setCopyingToClient] = useState(false);
  const [clientSnackbar, setClientSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [liveAlert, setLiveAlert] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [listSelectedIndex, setListSelectedIndex] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const fetchAllCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: 1, limit: 1 });
      if (dateFilter) params.append('date', parseDateForQuery(dateFilter));
      const res = await axios.get(`${API_BASE_1}/detections?${params}`);
      if (res.data.success) {
        setAllCounts(res.data.counts || {});
      }
    } catch (err) {
      console.error('Failed to fetch all counts:', err);
    }
  }, [dateFilter, setAllCounts]);

  useEffect(() => {
    fetchAllCounts();
  }, [fetchAllCounts]);

  const fetchDetections = useCallback(async (pg = 1, rpp = rowsPerPage) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: rpp });
      if (typeFilter) params.append('type', typeFilter);
      if (dateFilter) params.append('date', parseDateForQuery(dateFilter));
      if (search.trim()) params.append('search', search.trim());
      if (appliedStartTime) params.append('start_time', appliedStartTime);
      if (appliedEndTime) params.append('end_time', appliedEndTime);

      const res = await axios.get(`${API_BASE_1}/detections?${params}`);
      if (res.data.success) {
        setData(res.data.data);
        setTotal(res.data.total);
        setCounts(res.data.counts || {});
        setAllCounts(res.data.counts || {});
      }
    } catch (err) {
      console.error('Failed to fetch detections:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, dateFilter, search, appliedStartTime, appliedEndTime, rowsPerPage, setAllCounts]);

  const matchesFilters = useCallback((item) => {
    if (typeFilter && item.type !== typeFilter) return false;
    const normalizedDateFilter = parseDateForQuery(dateFilter);
    if (dateFilter && item.date !== normalizedDateFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = [
        item.camera_id, item.cameraId, item.cameraName,
        item.centerName, item.city, item.state, item.tcCode,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    // Time range filter (client-side on detected_at)
    if (dateFilter && (appliedStartTime || appliedEndTime)) {
      const itemSec = parseDetectedAtTime(item.detected_at);
      if (itemSec !== null) {
        const startSec = timeStringToSeconds(appliedStartTime);
        const endSec = timeStringToSeconds(appliedEndTime);
        if (startSec !== null && itemSec < startSec) return false;
        if (endSec !== null && itemSec > endSec + 59) return false; // +59 to include the whole minute
      }
    }
    return true;
  }, [typeFilter, dateFilter, search, appliedStartTime, appliedEndTime]);

  const filteredData = useMemo(() => data.filter(matchesFilters), [data, matchesFilters]);

  useEffect(() => {
    setPage(1);
    setCarouselIndex(0);
    setListSelectedIndex(0);
    fetchDetections(1);
  }, [fetchDetections]);

  useEffect(() => {
    const resolvedPath = SOCKET_PATH || '/cctv_dev/socket.io';
    const socket = io(SOCKET_URL, {
      path: resolvedPath,
      transports: ['polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('detection:new', (newItem) => {
      setLiveAlert(newItem);
      if (!matchesFilters(newItem)) return;
      setTotal((prev) => prev + 1);
      setCounts((prev) => ({ ...prev, [newItem.type]: (prev[newItem.type] || 0) + 1 }));
      setAllCounts((prev) => ({ ...prev, [newItem.type]: (prev[newItem.type] || 0) + 1 }));
      if (page === 1) {
        setData((prev) => {
          if (prev.some((existing) => existing.image_url === newItem.image_url)) return prev;
          return [newItem, ...prev].slice(0, rowsPerPage);
        });
      }
    });

    return () => socket.disconnect();
  }, [matchesFilters, page, setAllCounts, rowsPerPage]);

  const handlePageChange = (_, pg) => {
    setPage(pg);
    setCarouselIndex(0);
    setListSelectedIndex(0);
    fetchDetections(pg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pushToClient = async (items) => {
    if (items.length === 0) return;
    setCopyingToClient(true);
    try {
      await axios.post(`${API_BASE_1}/client-detections/copy`, {
        items: items.map(({ source, type, relativePath }) => ({ source, type, relativePath })),
      });
      setClientSnackbar({ open: true, message: `${items.length} image(s) pushed to client`, severity: 'success' });
    } catch (err) {
      console.error('Failed to push selected images:', err);
      setClientSnackbar({ open: true, message: 'Failed to push selected images to client', severity: 'error' });
    } finally {
      setCopyingToClient(false);
    }
  };

  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      <Box sx={{
        display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center',
        p: '8px 12px',
        borderRadius: '16px',
        bgcolor: '#ffffff',
        mb: 2,
      }}>
        {/* Search */}
        <TextField
          size="small"
          placeholder="Search detections..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: '#94a3b8' }} />
              </InputAdornment>
            ),
            sx: {
              borderRadius: '8px',
              bgcolor: '#f8fafc',
              height: 36,
              fontSize: 14,
              '& fieldset': { border: 'none' },
              '& input': { color: '#334155', '&::placeholder': { color: '#94a3b8', opacity: 1 } }
            }
          }}
          sx={{ minWidth: 260, maxWidth: 420, flex: 1 }}
        />
        <Box sx={{ position: 'relative', minWidth: 150, maxWidth: 100 }}>
          <TextField
            type="date"
            size="small"
            value={parseDateForQuery(dateFilter) || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (val) {
                const [y, m, d] = val.split('-');
                setDateFilter(`${d}-${m}-${y}`);
              } else {
                setDateFilter('');
              }
            }}
            InputProps={{
              sx: {
                borderRadius: '8px',
                bgcolor: '#f8fafc',
                height: 36,
                fontSize: 14,
                color: dateFilter ? 'transparent' : '#334155',
                paddingRight: '6px',
                '& fieldset': { border: 'none' },
                '&::-webkit-calendar-picker-indicator': {
                  cursor: 'pointer',
                  opacity: 0.6,
                  '&:hover': { opacity: 1 }
                }
              }
            }}
            sx={{ width: '100%' }}
          />
          {dateFilter && (
            <Box
              sx={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 14,
                color: '#334155',
                pointerEvents: 'none'
              }}
            >
              {dateFilter}
            </Box>
          )}
        </Box>

        {/* Start Time */}
        <TextField
          type="time"
          size="small"
          placeholder="Start"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          disabled={!dateFilter}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Typography sx={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap', mr: 0.5 }}>Start</Typography>
              </InputAdornment>
            ),
            sx: {
              borderRadius: '8px',
              bgcolor: dateFilter ? '#f8fafc' : '#f1f5f9',
              height: 36,
              fontSize: 14,
              color: '#334155',
              paddingRight: '6px',
              '& fieldset': { border: 'none' },
              '&::-webkit-calendar-picker-indicator': {
                cursor: 'pointer',
                opacity: 0.6,
                '&:hover': { opacity: 1 },
              }
            }
          }}
          sx={{ width: 170 }}
        />

        {/* End Time */}
        <TextField
          type="time"
          size="small"
          placeholder="End"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          disabled={!dateFilter}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Typography sx={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap', mr: 0.5 }}>End</Typography>
              </InputAdornment>
            ),
            sx: {
              borderRadius: '8px',
              bgcolor: dateFilter ? '#f8fafc' : '#f1f5f9',
              height: 36,
              fontSize: 14,
              color: '#334155',
              paddingRight: '6px',
              '& fieldset': { border: 'none' },
              '&::-webkit-calendar-picker-indicator': {
                cursor: 'pointer',
                opacity: 0.6,
                '&:hover': { opacity: 1 },
              }
            }
          }}
          sx={{ width: 170 }}
        />

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <TablePagination
            component="div"
            count={total}
            page={page - 1}
            onPageChange={(e, newPage) => {
              setPage(newPage + 1);
              fetchDetections(newPage + 1, rowsPerPage);
            }}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              const newLimit = parseInt(e.target.value, 10);
              setRowsPerPage(newLimit);
              setPage(1);
              fetchDetections(1, newLimit);
            }}
            rowsPerPageOptions={[10, 20, 50, 100]}
            labelRowsPerPage="Images per page:"
            sx={{
              overflow: 'hidden',
              minHeight: 36,
              height: 36,
              '.MuiTablePagination-toolbar': { minHeight: '36px !important', height: '36px !important', px: 1 },
              '.MuiTablePagination-selectLabel, .MuiTablePagination-select, .MuiTablePagination-displayedRows': { m: 0, fontSize: 13, color: '#334155' },
              '.MuiTablePagination-actions': { color: '#64748b' },
              borderBottom: 'none'
            }}
          />

          {(typeFilter || dateFilter !== todayDate || search || startTime || endTime) && (
            <Button
              size="small"
              onClick={() => { setTypeFilter(''); setDateFilter(todayDate); setSearch(''); setStartTime(''); setEndTime(''); setAppliedStartTime(''); setAppliedEndTime(''); }}
              sx={{ height: 36, borderRadius: '8px', fontSize: 13, textTransform: 'none', color: '#64748b' }}
            >
              Clear
            </Button>
          )}
          <Button
            variant="contained"
            startIcon={<FilterList sx={{ fontSize: 16 }} />}
            onClick={() => { setAppliedStartTime(startTime); setAppliedEndTime(endTime); }}
            disableElevation
            sx={{
              bgcolor: '#1d4ed8',
              height: 36, borderRadius: '8px', fontSize: 13, fontWeight: 600, textTransform: 'none', px: 2.5,
              '&:hover': { bgcolor: '#1e40af' }
            }}
          >
            Apply
          </Button>
        </Box>
      </Box>

      {/* ── View Toggle (Replaced Result Count) ── */}
      <Box sx={{ mb: 1, display: 'flex', justifyContent: 'flex-end' }}>
        <ToggleButtonGroup
          value={view} exclusive onChange={(_, v) => v && setView(v)} size="small"
          sx={{
            bgcolor: '#ffffff',
            border: '0.5px solid #e2e8f0',
            height: 36,
            borderRadius: '8px',
            p: '2px',
            '& .MuiToggleButton-root': {
              border: 'none', borderRadius: '6px !important', textTransform: 'none',
              px: 1.5, fontSize: 13, color: '#64748b',
              '&.Mui-selected': { bgcolor: '#f8fafc', color: '#0f172a', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', fontWeight: 600 }
            }
          }}
        >
          <ToggleButton value="carousel">
            <ViewCarousel sx={{ fontSize: 16, mr: 0.5 }} /> Carousel
          </ToggleButton>
          <ToggleButton value="list">
            <ViewList sx={{ fontSize: 16, mr: 0.5 }} /> List View
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* ── Content ── */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Skeleton variant="rounded" height={400} sx={{ borderRadius: 3 }} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} variant="rounded" width={100} height={60} sx={{ borderRadius: 1 }} />
            ))}
          </Box>
        </Box>
      ) : filteredData.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <ImageNotSupported sx={{ fontSize: 60, color: '#94a3b8' }} />
          <Typography variant="h6" color="text.secondary" mt={1}>No detections found</Typography>
          <Typography variant="body2" color="text.secondary">
            Try changing your filters or run a script to generate detections
          </Typography>
        </Box>
      ) : view === 'carousel' ? (
        <CarouselView
          data={filteredData}
          currentIndex={carouselIndex}
          onIndexChange={setCarouselIndex}
          onPushToClient={pushToClient}
          copyingToClient={copyingToClient}
        />
      ) : (
        <ListViewPanel
          data={filteredData}
          selectedIndex={listSelectedIndex}
          onSelect={setListSelectedIndex}
          onPushToClient={pushToClient}
          copyingToClient={copyingToClient}
        />
      )}


      {/* Snackbars */}
      <Snackbar
        open={Boolean(liveAlert)}
        autoHideDuration={5000}
        onClose={() => setLiveAlert(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert onClose={() => setLiveAlert(null)} severity="warning" variant="filled" sx={{ width: '100%' }}>
          {liveAlert
            ? `New ${TYPE_META[liveAlert.type]?.label || liveAlert.type} alert from ${liveAlert.cameraName || liveAlert.camera_id}`
            : ''}
        </Alert>
      </Snackbar>

      <Snackbar
        open={clientSnackbar.open}
        autoHideDuration={5000}
        onClose={() => setClientSnackbar({ ...clientSnackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setClientSnackbar({ ...clientSnackbar, open: false })}
          severity={clientSnackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {clientSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}