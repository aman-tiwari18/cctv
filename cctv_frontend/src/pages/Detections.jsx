import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Card, CardMedia, CardContent, Typography, Chip,
  TextField, Select, MenuItem, FormControl, InputLabel,
  ToggleButtonGroup, ToggleButton, Pagination, TablePagination,
  IconButton, Skeleton, Grid, Checkbox, FormControlLabel, Dialog, DialogContent,
  InputAdornment, Button, Snackbar, Alert, LinearProgress, CircularProgress,
  useMediaQuery, useTheme,
} from '@mui/material';
import {
  Search, CameraAlt, GridView, Close,
  AccessTime, Warning, Person, FilterList, Refresh, Event, LocationCity,
  Groups, Dns, DirectionsWalk, MeetingRoom, Smartphone, Visibility,
  WarningAmber, ImageNotSupported, FlipCameraAndroid, SecurityUpdateWarning,
  VisibilityOff, PersonOff,
  ChevronLeft, ChevronRight, ViewList,
  Check, Close as CloseIcon, Memory
} from '@mui/icons-material';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { enGB } from 'date-fns/locale';
import axios from 'axios';
import { reportAPI, examsAPI } from '../services/api';
import { API_BASE_1, IMG_BASE } from '../constants/data';
import { useDetectionCounts } from '../contexts/DetectionCountsContext';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import * as XLSX from 'xlsx';

// ============================================================
// PERFORMANCE UTILITIES
// ============================================================

// Map fleet-wide gpu_id slot (0..N-1, set by db_client._get_gpu_id) to a
// human-readable "Worker X GPU Y" label. The slot ranges below mirror the
// current fleet's WORKER_INDEX layout — keep in sync if workers are
// added/removed.
//   0           → Main (worker-0)
//   1..3        → single-GPU workers (worker-1..3)
//   4..11       → worker-5 GPU 0..7
//   12..19      → worker-6 GPU 0..7
//   20..27      → worker-4 GPU 0..7  (reserved for when worker-4 rejoins)
function workerGpuLabel(slot) {
  if (slot == null) return null;
  if (slot === 0) return 'Worker 0 (Main)';
  if (slot >= 1 && slot <= 3) return `Worker ${slot}`;
  if (slot >= 4 && slot <= 11) return `Worker 5 · GPU ${slot - 4}`;
  if (slot >= 12 && slot <= 19) return `Worker 6 · GPU ${slot - 12}`;
  if (slot >= 20 && slot <= 27) return `Worker 4 · GPU ${slot - 20}`;
  return `Slot ${slot}`;
}

// Debounce hook for search input
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Request queue to prevent concurrent push operations
class RequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const { fn, resolve, reject } = this.queue.shift();
    
    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.processing = false;
      this.process(); // Process next item
    }
  }
}

const pushQueue = new RequestQueue();

const TYPE_META = {
  proximity: { label: 'Close Proximity', color: '#5cb88a', bg: '#e5f5ed', iconKey: 'proximity' },
  crowd: { label: 'Crowd Detection (Entry/Exit)', color: '#e24d7b', bg: '#fce4ec', iconKey: 'crowd' },
  crowd_biometric: { label: 'Crowd Detection (Biometric)', color: '#9333ea', bg: '#f3e8ff', iconKey: 'crowd_biometric' },
  crowd_five: { label: 'Crowd < 5', color: '#e06050', bg: '#fce8e6', iconKey: 'crowd_five' },
  crowd_zero: { label: 'Zero Person', color: '#6b5b95', bg: '#edeaf3', iconKey: 'crowd_zero' },
  server: { label: 'Server Room', color: '#a0623d', bg: '#f3ebe4', iconKey: 'server' },
  intruder: { label: 'Intruder', color: '#d94466', bg: '#fce4ea', iconKey: 'intruder' },
  strongroom: { label: 'Strong Room Movement', color: '#b91c1c', bg: '#fef2f2', iconKey: 'strongroom' },
  qp_box: { label: 'QP Box Detection', color: '#dc2626', bg: '#fee2e2', iconKey: 'qp_box' },
  entry_exit: { label: 'Entry/Exit', color: '#1d7a7d', bg: '#e0f0f0', iconKey: 'entry_exit' },
  phone: { label: 'Phone', color: '#465a38', bg: '#e8ece5', iconKey: 'phone' },
  blind_spot: { label: 'Blind Spot', color: '#b0a850', bg: '#f3f2e4', iconKey: 'blind_spot' },
  invigilator: { label: 'Invigilator', color: '#00bfcf', bg: '#e0f7fa', iconKey: 'invigilator' },
  inversion: { label: 'Camera Inversion', color: '#7a86b4', bg: '#eceef5', iconKey: 'inversion' },
  tampering: { label: 'Camera Tampering', color: '#00c8d4', bg: '#e0f8fa', iconKey: 'tampering' },
  vision: { label: 'Scene Classification', color: '#3b82f6', bg: '#dbeafe', iconKey: 'vision' },
};

const TYPE_ICONS = {
  proximity: WarningAmber,
  crowd: Groups,
  crowd_biometric: Groups,
  crowd_five: Groups,
  crowd_zero: PersonOff,
  server: Dns,
  intruder: DirectionsWalk,
  strongroom: SecurityUpdateWarning,
  qp_box: SecurityUpdateWarning,
  entry_exit: MeetingRoom,
  phone: Smartphone,
  blind_spot: VisibilityOff,
  invigilator: Visibility,
  inversion: FlipCameraAndroid,
  tampering: SecurityUpdateWarning,
  vision: Visibility,
  default: CameraAlt,
};

const NewBadge = ({ addedAt, sx }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!addedAt) return;

    const rawTime = typeof addedAt === 'number' ? addedAt : new Date(addedAt).getTime();
    const parsedTime = rawTime < 10000000000 ? rawTime * 1000 : rawTime;
    if (isNaN(parsedTime)) return; // safety check

    const diff = Math.max(0, Date.now() - parsedTime);

    if (diff < 5000) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 5000 - diff);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [addedAt]);

  if (!visible) return null;

  return (
    <Chip
      label="NEW"
      size="small"
      sx={{
        bgcolor: '#ef4444',
        color: '#fff',
        fontWeight: 800,
        fontSize: '0.65rem',
        height: 20,
        zIndex: 20,
        boxShadow: '0 0 8px rgba(239,68,68,0.6)',
        animation: 'pulse 1.5s infinite ease-in-out',
        '@keyframes pulse': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' }
        },
        ...sx
      }}
    />
  );
};

const getDetectionTcCode = (item = {}) => item.tcCode || item.tc_code || item.tc || '-';

const getDetectionShiftName = (item = {}) => (
  item.shiftName
  || item.shift_name
  || item.shift?.shift_name
  || item.shift?.name
  || (item.shift_id ? `Shift #${item.shift_id}` : '-')
);

function DetectionCard({ item, onClick, onPushToClient, isPushing, isPushed, onSkip }) {
  const meta = TYPE_META[item.type] || { label: item.type, color: '#94a3b8', bg: '#f1f5f9' };
  const [imgError, setImgError] = useState(false);
  const cameraName = item.cameraName || item.camera_name || item.camera_id || '-';
  const centerName = item.centerName || item.centre_name || '-';
  const city = item.city || '-';
  const examDate = item.examDate || (item.date ? item.date.split('-').reverse().join('-') : '-');
  const tcCode = getDetectionTcCode(item);
  const shiftName = getDetectionShiftName(item);
  const invigilatorEventLabel = item.type === 'invigilator'
    ? (item.issueLabel || (item.issueType ? String(item.issueType).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''))
    : '';

  const isLoading = isPushing;

  return (
    <Card
      onClick={() => onClick(item)}
      sx={{
        cursor: 'pointer',
        borderRadius: 3,
        overflow: 'hidden',
        transition: 'all 0.22s ease',
        '&:hover': { transform: 'translateY(-4px) scale(1.005)', boxShadow: '0 14px 30px rgba(15, 23, 42, 0.14)' },
        border: '1px solid #e2e8f0',
      }}
    >
      <Box sx={{ position: 'relative', bgcolor: '#0f172a' }}>

        {imgError ? (
          <Box sx={{ height: { xs: 200, md: 220 }, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#1e293b' }}>
            <CameraAlt sx={{ fontSize: 48, color: '#475569' }} />
          </Box>
        ) : (
          <CardMedia
            component="img"
            image={`${IMG_BASE}${item.image_url}`}
            alt={item.camera_id}
            onError={() => setImgError(true)}
            sx={{ height: { xs: 200, md: 220 }, objectFit: 'cover' }}
          />
        )}
        <NewBadge
          addedAt={item.newBadgeAt}
          sx={{ position: 'absolute', top: 8, right: 8 }}
        />
        {invigilatorEventLabel && (
          <Chip
            label={invigilatorEventLabel}
            size="small"
            sx={{
              position: 'absolute', bottom: 8, right: 8,
              bgcolor: 'rgba(15, 23, 42, 0.72)', color: '#fff',
              fontWeight: 700, fontSize: '0.65rem',
            }}
          />
        )}
        {item.count != null && (
          <Chip
            icon={<Warning sx={{ fontSize: 12, color: '#fff !important' }} />}
            label={
              item.type === 'proximity'
                ? `${item.count} violation${item.count > 1 ? 's' : ''}`
                : `${item.count} person${item.count > 1 ? 's' : ''}`
            }
            size="small"
            sx={{
              position: 'absolute', top: 8, left: 8,
              bgcolor: 'rgba(0,0,0,0.65)', color: '#fff',
              fontSize: '0.65rem',
            }}
          />
        )}
      </Box>
      <CardContent sx={{ p: 1, pb: '10px !important', mx: { xs: 1.5, sm: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5, gap: 1 }}>
          <Typography
            variant="h6"
            fontWeight={600}
            fontSize={14}
            noWrap
            sx={{
              color: '#1e293b',
              lineHeight: 1.5,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1
            }}
          >
            {centerName}
          </Typography>
          <Chip
            label={meta.label}
            size="small"
            sx={{
              bgcolor: meta.bg || '#f1f5f9', color: meta.color || '#64748b',
              fontWeight: 700, fontSize: '0.65rem', height: 20,
            }}
          />
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '26px 1fr',
            rowGap: 0.3,
            alignItems: 'center'
          }}
        >
          <CameraAlt sx={{ fontSize: 14, color: '#777' }} />
          <Typography sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
            {cameraName}
          </Typography>

          <AccessTime sx={{ fontSize: 14, color: '#777' }} />
          <Typography sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
            {item.detected_at || '-'}
          </Typography>

          <LocationCity sx={{ fontSize: 14, color: '#777' }} />
          <Typography sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
            {city}
          </Typography>

          <Dns sx={{ fontSize: 14, color: '#777' }} />
          <Typography noWrap title={tcCode} sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
            TC Code: {tcCode}
          </Typography>

          <Event sx={{ fontSize: 14, color: '#777' }} />
          <Typography noWrap title={shiftName} sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
            Shift: {shiftName}
          </Typography>
        </Box>

        {item.confidence != null && (
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 1, lineHeight: 1.5 }}
            color={meta.color}
            fontWeight={500}
          >
            Conf: {(item.confidence * 100).toFixed(0)}%
          </Typography>
        )}

        {item.gpu_id != null && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.8 }}>
            <Memory sx={{ fontSize: 13, color: '#64748b' }} />
            <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              {workerGpuLabel(item.gpu_id)} · slot {item.gpu_id}
            </Typography>
          </Box>
        )}
      </CardContent>

      <Box sx={{ mx: { xs: 1.5, sm: 2 }, mb: { xs: 2, sm: 3 }, mt: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'end', gap: 1.5, }}>
          {!isPushed && (
            <Button
              variant="outlined"
              disableElevation
              onClick={(e) => { e.stopPropagation(); if (onSkip) onSkip(item); }}
              sx={{
                borderColor: '#c3c5d8', color: '#475569', fontWeight: 900,
                flex: '0 0 auto',
                minWidth: 72,
                px: 1,
                height: "40px",
                borderRadius: 3, textTransform: 'none', fontSize: 12,
                '&:hover': { bgcolor: '#c3c5d8', borderColor: '#c3c5d8' },
              }}
            >
              Skip
            </Button>
          )}

          <Button
            variant="contained"
            disableElevation
            onClick={(e) => {
              e.stopPropagation();
              if (onPushToClient && !isLoading && !isPushed) onPushToClient([item]);
            }}
            disabled={isLoading || isPushed}
            sx={{
              bgcolor: isPushed ? '#94a3b8' : '#3c81f6',
              color: '#fff',
              fontWeight: 900,
              flex: 1,
              minWidth: 0,
              px: 1,
              height: "40px",
              borderRadius: 3,
              textTransform: 'none',
              fontSize: 12,
              whiteSpace: 'nowrap',
              '&:hover': { bgcolor: isPushed ? '#94a3b8' : '#1e40af' },
              '&.Mui-disabled': {
                bgcolor: '#94a3b8',
                color: '#ffffff',
                cursor: 'not-allowed',
                pointerEvents: 'auto'
              }
            }}
          >
            {isLoading ? 'Pushing...' : (isPushed ? 'Pushed to client' : 'Push to client')}
          </Button>
        </Box>
      </Box>
    </Card>
  );
}

function Lightbox({ item, onClose }) {
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down('sm'));
  if (!item) return null;
  const meta = TYPE_META[item.type] || {};
  const invigilatorEventLabel = item.type === 'invigilator'
    ? (item.issueLabel || (item.issueType ? String(item.issueType).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''))
    : '';
  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth fullScreen={isSmDown}>
      <DialogContent sx={{ p: 0, bgcolor: '#0f172a', position: 'relative', display: 'flex', flexDirection: 'column', maxHeight: { xs: '100dvh', sm: '90vh' } }}>
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute', top: 8, right: 8, zIndex: 10, color: '#fff', bgcolor: 'rgba(0,0,0,0.5)',
            width: { xs: 44, sm: 40 }, height: { xs: 44, sm: 40 },
            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
          }}
        >
          <Close sx={{ fontSize: { xs: 26, sm: 24 } }} />
        </IconButton>
        <Box
          component="img"
          src={`${IMG_BASE}${item.image_url}`}
          alt={item.camera_id}
          sx={{ width: '100%', maxHeight: { xs: '70vh', sm: '80vh' }, objectFit: 'contain', display: 'block', flexShrink: 0 }}
        />
        <Box sx={{ p: { xs: 1.5, sm: 2 }, color: '#fff', overflowY: 'auto' }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip label={meta.label} size="small" sx={{ bgcolor: meta.color, color: '#fff', fontWeight: 700 }} />
            {invigilatorEventLabel && (
              <Chip label={invigilatorEventLabel} size="small" sx={{ bgcolor: '#334155', color: '#fff' }} />
            )}
            {item.count != null && <Chip label={`Count: ${item.count}`} size="small" sx={{ bgcolor: '#334155', color: '#fff' }} />}
            {item.confidence != null && (
              <Chip label={`Confidence: ${(item.confidence * 100).toFixed(1)}%`} size="small" sx={{ bgcolor: '#334155', color: '#fff' }} />
            )}
          </Box>
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>{item.cameraName || item.camera_id}</Typography>
          <Typography variant="body2" color="#94a3b8">{item.detected_at}</Typography>
          {item.centerName && (
            <Typography variant="body2" color="#94a3b8">
              {item.centerName}{item.city ? ` — ${item.city}` : ''}{item.state ? `, ${item.state}` : ''}
            </Typography>
          )}
          {item.tcCode && <Typography variant="body2" color="#94a3b8">TC: {item.tcCode}</Typography>}
          {(item.shiftName || item.shift_name || item.shift_id) && (
            <Typography variant="body2" color="#94a3b8">Shift: {getDetectionShiftName(item)}</Typography>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

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




function ListViewPanel({ data, selectedIndex, onSelect, onPushToClient, copyingToClient, pushedUids }) {
  const item = data[selectedIndex];
  const isPushed = item ? (pushedUids.has(item.uid || item.id || item.image_url) || item.pushed_to_client === 1 || item.pushed_to_client === true) : false;
  const tcCode = item ? getDetectionTcCode(item) : '-';
  const shiftName = item ? getDetectionShiftName(item) : '-';
  const itemRefs = useRef([]);

  const goNext = useCallback(() => onSelect(Math.min(data.length - 1, selectedIndex + 1)), [data.length, selectedIndex, onSelect]);

  const handleSkip = useCallback(() => {
    console.log('Skip clicked');
    goNext();
  }, [goNext]);

  const handlePush = useCallback(async () => {
    if (!item || copyingToClient || !onPushToClient) return;
    await onPushToClient([item]);
    goNext();
  }, [item, copyingToClient, onPushToClient, goNext]);

  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); onSelect(Math.max(0, selectedIndex - 1)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); handlePush(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); handleSkip(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIndex, data.length, item, copyingToClient, onSelect, onPushToClient, goNext, handlePush, handleSkip]);

  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, height: { xs: 'auto', md: 'calc(100vh - 310px)' }, minHeight: { xs: 0, md: 500 } }}>
        <Box sx={{
        width: { xs: '100%', md: '30%', lg: 300 }, flexShrink: 0, overflowY: 'auto',
        maxHeight: { xs: 280, md: 'none' },
        borderRight: { xs: 'none', md: '1px solid #e2e8f0' },
        borderBottom: { xs: '1px solid #e2e8f0', md: 'none' },
        pr: 1,
        bgcolor: '#ffffff',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}>
        {data.map((listItem, idx) => {
          const isActive = idx === selectedIndex;

          return (
            <Box
              key={`${listItem.filename}-${idx}`}
              ref={(el) => (itemRefs.current[idx] = el)} // ✅ direct DOM ref
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
              <Box sx={{ position: 'relative', display: 'flex', ml: 1, mr: 1.5, my: 0.5 }}>
                <NewBadge
                  addedAt={listItem.newBadgeAt}
                  sx={{ position: 'absolute', top: -4, left: -4, zIndex: 10, transform: 'scale(0.85)' }}
                />
                <Box
                  component="img"
                  src={`${IMG_BASE}${listItem.image_url}`}
                  alt={listItem.camera_id}
                  sx={{
                    width: { xs: 62, sm: 70, md: 70 },
                    height: { xs: 62, sm: 70, md: 70 },
                    flexShrink: 0,
                    objectFit: 'cover',
                    alignSelf: 'center',
                    borderRadius: 1,
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </Box>

              <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {(() => {
                  if (!listItem.detected_at || listItem.detected_at === '-') {
                    return <Typography variant="body2" fontWeight={500} color="text.secondary" fontSize={12}>-</Typography>;
                  }
                  const commaIdx = listItem.detected_at.indexOf(',');
                  const datePart = commaIdx !== -1 ? listItem.detected_at.substring(0, commaIdx + 1) : listItem.detected_at;
                  const timePart = commaIdx !== -1 ? listItem.detected_at.substring(commaIdx + 1).trim() : '';
                  return (
                    <>
                      <Typography variant="body2" fontWeight={600} color="text.primary" fontSize={13}>{datePart}</Typography>
                      {timePart && <Typography variant="caption" fontWeight={500} color="text.secondary" fontSize={12}>{timePart}</Typography>}
                      {listItem.gpu_id != null && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, mt: 0.3 }}>
                          <Memory sx={{ fontSize: 11, color: '#94a3b8' }} />
                          <Typography sx={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                            {workerGpuLabel(listItem.gpu_id)}
                          </Typography>
                        </Box>
                      )}
                    </>
                  );
                })()}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Right panel */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {item ? (
          <>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              {(TYPE_META[item.type] || { label: item.type }).label}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2.5, flex: 1, minHeight: 0 }}>
              {/* Image */}
              <Box sx={{
                flex: 1, position: 'relative', borderRadius: 3, overflow: 'hidden',
                minHeight: { xs: 240, md: 0 },
                bgcolor: '#fff'
              }}>
                <Box
                  component="img"
                  src={`${IMG_BASE}${item.image_url}`}
                  alt={item.camera_id}
                  sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </Box>

              <Box sx={{
                width: { xs: '100%', md: '36%', lg: 360, xl: 400 }, flexShrink: 0,
                bgcolor: '#fff', borderRadius: 3, p: { xs: 1.5, sm: 2.5 },
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
                <CardContent sx={{ p: 1, pb: '10px !important' }}>
                  <Typography
                    variant="h6"
                    fontWeight={600}
                    fontSize={14}
                    sx={{ color: '#1e293b', lineHeight: 1.5, mb: 0.5 }}
                  >
                    {item.centerName || item.centre_name || '-'}
                  </Typography>

                  {/* Grid Info */}
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '26px 1fr',
                      rowGap: 0.3,
                      alignItems: 'center'
                    }}
                  >

                    <CameraAlt sx={{ fontSize: 14, color: '#777' }} />
                    <Typography sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
                      {item.cameraName || item.camera_name || item.camera_id || '-'}
                    </Typography>

                    <AccessTime sx={{ fontSize: 14, color: '#777' }} />
                    <Typography sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
                      {item.detected_at || '-'}
                    </Typography>


                    <LocationCity sx={{ fontSize: 14, color: '#777' }} />
                    <Typography sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
                      {item.city || '-'}
                    </Typography>

                    <Dns sx={{ fontSize: 14, color: '#777' }} />
                    <Typography noWrap title={tcCode} sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
                      TC Code: {tcCode}
                    </Typography>

                    <Event sx={{ fontSize: 14, color: '#777' }} />
                    <Typography noWrap title={shiftName} sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
                      Shift: {shiftName}
                    </Typography>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'start',
                        gap: 2,
                        mt: 0.5,
                        gridColumn: '1 / -1',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: '#aeaeaeff',
                          fontWeight: 600,
                          letterSpacing: '0.05em'
                        }}
                      >
                        DETECTION
                      </Typography>

                      <Chip
                        label={(TYPE_META[item.type] || { label: item.type }).label}
                        size="small"
                        sx={{
                          height: 30,
                          fontSize: '0.8rem',

                          minWidth: 150,
                          maxWidth: 280,
                          width: 'fit-content',

                          justifyContent: 'center',

                          bgcolor: (TYPE_META[item.type] || { bg: '#f1f5f9' }).bg,
                          color: (TYPE_META[item.type] || { color: '#64748b' }).color,
                          fontWeight: 600
                        }}
                      />
                    </Box>
                  </Box>


                  {item.confidence != null && (
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', mt: 0.8, lineHeight: 1.5 }}
                      color={meta.color}
                      fontWeight={500}
                    >
                      Conf: {(item.confidence * 100).toFixed(0)}%
                    </Typography>
                  )}

                  {item.gpu_id != null && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.8 }}>
                      <Memory sx={{ fontSize: 13, color: '#64748b' }} />
                      <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                        {workerGpuLabel(item.gpu_id)} · slot {item.gpu_id}
                      </Typography>
                    </Box>
                  )}
                </CardContent>

                <Box sx={{ mt: 2.5 }}>
                  <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center' }}>
                    {!isPushed && (
                      <Button
                        variant="outlined"
                        fullWidth
                        disableElevation
                        onClick={handleSkip}
                        sx={{
                          borderColor: '#c3c5d8', color: '#475569', fontWeight: 900,
                          width: { xs: '100%', md: '100px' },
                          height: { xs: 36, sm: 40 },
                          borderRadius: 2, textTransform: 'none', fontSize: { xs: 12, sm: 14 },
                          display: 'flex',
                          justifyContent: 'space-between',
                          pl: 1,
                          pr: 0.5,
                          '&:hover': { bgcolor: '#fff', borderColor: '#c3c5d8' },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: 1.5,
                              bgcolor: 'rgba(118, 119, 119, 0.6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Box component="img" src="/cctv_analytics/icon.svg" alt="left" sx={{ width: 16, height: 16, display: 'block', transform: 'scaleX(-1)' }} />
                          </Box>
                          <span sx = {{color: '#fff'}}>Skip</span>
                        </Box>
                      </Button>
                    )}
                    <Button
                      variant="contained"
                      disableElevation
                      onClick={handlePush}
                      disabled={copyingToClient || isPushed}
                      sx={{
                        bgcolor: isPushed ? '#94a3b8' : '#3c81f6', color: '#fff', fontWeight: 900,
                        height: { xs: 36, sm: 40 },
                        width: { xs: '100%', md: '180px' },
                        borderRadius: 2, textTransform: 'none', fontSize: { xs: 12, sm: 14 },
                        display: 'flex',
                        justifyContent: 'space-between',
                        pl: 2,
                        pr: 1,
                        '&:hover': { bgcolor: isPushed ? '#94a3b8' : '#1e40af' },
                        '&.Mui-disabled': {
                          bgcolor: '#94a3b8',
                          color: '#ffffff',
                          cursor: 'not-allowed',
                          pointerEvents: 'auto'
                        }
                      }}
                    >
                      <span>{copyingToClient ? 'Pushing...' : (isPushed ? 'Pushed to client' : 'Push to client')}</span>
                      {!isPushed && (
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: 1.5,
                            bgcolor: 'rgba(147, 197, 253, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Box component="img" src="/cctv_analytics/icon.svg" alt="right" sx={{ width: 16, height: 16, display: 'block' }} />
                        </Box>
                      )}
                    </Button>
                  </Box>
                </Box>
              </Box>
            </Box>
          </>
        ) : (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography color="text.secondary">Select a detection to preview</Typography>
          </Box>
        )}
      </Box>
      </Box>
      
      {/* Tip Banner */}
      <Box sx={{
        bgcolor: '#e3f2fd',
        borderRadius: 2,
        p: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        border: '1px solid #90caf9',
        width: 'fit-content',
      }}>
        <Box sx={{ 
          color: '#1976d2', 
          fontSize: 14, 
          display: 'flex', 
          alignItems: 'center' 
        }}>
          💡
        </Box>
        <Typography sx={{ 
          fontSize: 12, 
          color: '#1565c0', 
          fontWeight: 500 
        }}>
          <strong>Tip:</strong> Use ↑ and ↓ arrow keys to quickly review detections without using your mouse.
        </Typography>
      </Box>
    </Box>
  );
}


export default function Detections() {
  const { user } = useAuth();
  const theme = useTheme();
  // List view relies on keyboard navigation (↑↓ → ←) which is irrelevant on
  // touch devices, so we force Grid view and hide the toggle below md.
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { setAllCounts, setUnfilteredCounts, typeFilter, setTypeFilter, setExportToExcel, setDownloadConsolidatedReport, setReportValidationError } = useDetectionCounts();
  const [searchParams] = useSearchParams();

  const [data, setData] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [clientTotal, setClientTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500); // 500ms debounce
  const [exams, setExams] = useState([]);
  const [examFilter, setExamFilter] = useState('');
  const [examShifts, setExamShifts] = useState([]);
  const [shiftFilter, setShiftFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(todayDate);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [appliedStartTime, setAppliedStartTime] = useState('');
  const [appliedEndTime, setAppliedEndTime] = useState('');
  const [copyingToClient, setCopyingToClient] = useState(false);
  const [copyingId, setCopyingId] = useState(null);
  const [pushedUids, setPushedUids] = useState(new Set());
  const [clientSnackbar, setClientSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [liveAlert, setLiveAlert] = useState(null);
  const [listSelectedIndex, setListSelectedIndex] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [allShifts, setAllShifts] = useState(false);
  const [keyboardHintShown, setKeyboardHintShown] = useState(false);

  const [selected, setSelected] = useState(null);
  const [selectedPaths, setSelectedPaths] = useState([]);

  // Performance optimization: Use refs to prevent unnecessary re-renders
  const abortControllerRef = useRef(null);
  const fetchTimeoutRef = useRef(null);
  const lastFetchParamsRef = useRef(null);

  const buildSelectionKey = (item) => `${item.source}|${item.type}|${item.relativePath}`;
  const getDetectionKey = useCallback((item = {}) => (
    item.uid
    || item.id
    || item.image_url
    || (item.source && item.type && item.relativePath ? `${item.source}|${item.type}|${item.relativePath}` : null)
    || item.filename
  ), []);
  const dataKeysRef = useRef(new Set());

  useEffect(() => {
    dataKeysRef.current = new Set(data.map(getDetectionKey).filter(Boolean));
  }, [data, getDetectionKey]);

  const toggleSelection = (item) => {
    const key = buildSelectionKey(item);
    setSelectedPaths((prev) => (
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]
    ));
  };

  const handleSkipLocally = useCallback((itemToRemove) => {
    setData((prev) => prev.filter(i => getDetectionKey(i) !== getDetectionKey(itemToRemove)));
  }, [getDetectionKey]);

  const loadExams = useCallback(async () => {
    try {
      const response = await examsAPI.getAll({ is_active: true });
      const examList = Array.isArray(response?.data?.data) ? response.data.data : [];
      setExams(examList);
      
      const examIdFromUrl = searchParams.get('exam_id');
      if (examIdFromUrl && examList.some(exam => String(exam.id) === examIdFromUrl)) {
        setExamFilter(examIdFromUrl);
      }
    } catch (err) {
      console.error('Failed to load exams:', err);
    }
  }, [searchParams]);

  useEffect(() => {
    loadExams();
  }, [loadExams]);

  // Populate the dependent Shift filter from the selected exam. The exam list
  // (examsAPI.getAll) already embeds each exam's `examShifts`, so no extra call.
  useEffect(() => {
    if (!examFilter) {
      setExamShifts([]);
      setShiftFilter('');
      return;
    }
    const exam = exams.find((e) => String(e.id) === String(examFilter));
    setExamShifts(Array.isArray(exam?.examShifts) ? exam.examShifts : []);
    setShiftFilter('');
  }, [examFilter, exams]);

  const buildDetectionParams = useCallback((pg = 1, rpp = rowsPerPage) => {
    const params = new URLSearchParams({ page: pg, limit: rpp });
    if (typeFilter.length > 0) params.append('type', typeFilter.join(','));
    if (dateFilter) params.append('date', parseDateForQuery(dateFilter));
    if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim()); // Use debounced search
    if (examFilter) params.append('exam_id', examFilter);
    if (shiftFilter) params.append('shift_id', shiftFilter);
    if (appliedStartTime) params.append('start_time', appliedStartTime);
    if (appliedEndTime) params.append('end_time', appliedEndTime);
    return params;
  }, [typeFilter, dateFilter, debouncedSearch, examFilter, shiftFilter, appliedStartTime, appliedEndTime, rowsPerPage]);

  // Optimized fetch with abort controller and request deduplication
  const fetchDetections = useCallback(async (pg = 1, rpp = rowsPerPage) => {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    const params = buildDetectionParams(pg, rpp);
    const paramsString = params.toString();

    // Prevent duplicate requests
    if (lastFetchParamsRef.current === paramsString) {
      return;
    }
    lastFetchParamsRef.current = paramsString;

    setLoading(true);
    
    try {
      // Parallel requests with single abort controller
      const [detectionsRes, clientRes] = await Promise.all([
        axios.get(`${API_BASE_1}/detections?${params}`, {
          signal: abortControllerRef.current.signal
        }),
        axios.get(`${API_BASE_1}/client-detections?${new URLSearchParams({ ...Object.fromEntries(params), limit: 1 })}`, {
          signal: abortControllerRef.current.signal
        }).catch(() => ({ data: { total: 0 } })) // Graceful fallback
      ]);

      if (detectionsRes.data.success) {
        const fetchedItems = Array.isArray(detectionsRes.data.data)
          ? detectionsRes.data.data.map((item) => ({ ...item, newBadgeAt: undefined }))
          : [];
        
        setData(fetchedItems);
        setTotal(detectionsRes.data.total);
        setCounts(detectionsRes.data.counts || {});
        setAllCounts(detectionsRes.data.counts || {});
        // Backend now always returns counts for ALL types (not just the
        // filtered type), so we can always drive the sidebar from this response.
        setUnfilteredCounts(detectionsRes.data.counts || {});
      }

      if (clientRes.data.success) {
        setClientTotal(clientRes.data.total || 0);
      }
    } catch (err) {
      if (err.name !== 'CanceledError') {
        console.error('Failed to fetch detections:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [buildDetectionParams, rowsPerPage, setAllCounts, setUnfilteredCounts]);

  // Optimized: Only filter on server-side, remove client-side filtering
  const filteredData = useMemo(() => data, [data]); // Server already filtered

  const mergeLiveDetections = useCallback((items, { incrementTotal = false } = {}) => {
    const incoming = (Array.isArray(items) ? items : [items]).filter(Boolean);
    if (incoming.length === 0) return;

    const now = Date.now();
    const seen = new Set(dataKeysRef.current);
    const freshItems = [];

    incoming.forEach((item) => {
      const liveItem = {
        ...item,
        newBadgeAt: now,
      };

      const key = getDetectionKey(liveItem);
      if (!key || seen.has(key)) return;

      seen.add(key);
      freshItems.push(liveItem);
    });

    if (freshItems.length === 0) return;

    dataKeysRef.current = seen;

    setData(prev => {
      const prevKeys = new Set(prev.map(getDetectionKey).filter(Boolean));
      const uniqueFreshItems = freshItems.filter((item) => {
        const key = getDetectionKey(item);
        if (!key || prevKeys.has(key)) return false;
        prevKeys.add(key);
        return true;
      });

      if (uniqueFreshItems.length === 0) return prev;
      return [...uniqueFreshItems, ...prev].slice(0, rowsPerPage);
    });

    if (incrementTotal) {
      setTotal(prev => prev + freshItems.length);
    }

    setLiveAlert(freshItems[0]);
    setTimeout(() => setLiveAlert(null), 5000);
  }, [getDetectionKey, rowsPerPage]);

  // Handle live updates for the data list
  const { socket, connected } = useSocket();
  useEffect(() => {
    if (!socket) return;

    const handleNewDetection = (item) => {
      if (typeFilter.length > 0 && !typeFilter.includes(item.type)) {
        return;
      }

      // Bump sidebar counts only when this detection belongs to the currently
      // viewed date. New detections are always "today", so they only apply
      // when dateFilter is today or empty (all dates).
      const itemDateIso = item?.date;
      const filterDateIso = parseDateForQuery(dateFilter);
      if (!filterDateIso || itemDateIso === filterDateIso) {
        setUnfilteredCounts(prev => ({ ...prev, [item.type]: (prev[item.type] || 0) + 1 }));
      }

      mergeLiveDetections(item, { incrementTotal: true });
    };

    socket.on('detection:new', handleNewDetection);
    return () => socket.off('detection:new', handleNewDetection);
  }, [socket, mergeLiveDetections, typeFilter, dateFilter, setUnfilteredCounts]);

  // Optimized polling: Only when NOT connected and on page 1
  useEffect(() => {
    if (loading || page !== 1 || connected) return;

    let cancelled = false;
    let inFlight = false;

    const pollLatestDetections = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;

      try {
        const params = buildDetectionParams(1, rowsPerPage);
        const res = await axios.get(`${API_BASE_1}/detections?${params}`, {
          signal: abortControllerRef.current?.signal
        });
        
        if (cancelled || !res.data.success) return;

        setTotal(res.data.total || 0);
        setCounts(res.data.counts || {});
        setAllCounts(res.data.counts || {});
        setUnfilteredCounts(res.data.counts || {});

        // Filter polled detections by typeFilter before merging
        const filteredData = (res.data.data || []).filter(item => {
          if (typeFilter.length > 0 && !typeFilter.includes(item.type)) {
            return false;
          }
          return true;
        });
        mergeLiveDetections(filteredData);
      } catch (err) {
        if (err.name !== 'CanceledError') {
          console.error('Failed to poll latest detections:', err);
        }
      } finally {
        inFlight = false;
      }
    };

    const interval = setInterval(pollLatestDetections, 15000); // Increased to 15s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [loading, page, connected, rowsPerPage, buildDetectionParams, mergeLiveDetections, setAllCounts, setUnfilteredCounts, typeFilter]);

  // Debounced fetch on filter changes
  useEffect(() => {
    setPage(1);
    setListSelectedIndex(0);
    
    // Clear previous timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    // Debounce fetch (no debounce for typeFilter changes for instant response)
    const delay = typeFilter.length > 0 ? 0 : 300;
    fetchTimeoutRef.current = setTimeout(() => {
      fetchDetections(1);
    }, delay);

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, [typeFilter, dateFilter, examFilter, shiftFilter, appliedStartTime, appliedEndTime, debouncedSearch, fetchDetections]);

  // Broadcast push events to other users via socket
  useEffect(() => {
    if (!socket) return;

    const handleDetectionPushed = ({ uid, pushedBy }) => {
      // Update local state when another user pushes
      if (pushedBy !== user?.id) {
        setPushedUids((prev) => {
          const next = new Set(prev);
          next.add(uid);
          return next;
        });
        setClientTotal((prev) => prev + 1);
      }
    };

    socket.on('detection:pushed', handleDetectionPushed);
    return () => socket.off('detection:pushed', handleDetectionPushed);
  }, [socket, user]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  const handlePageChange = (_, pg) => {
    setPage(pg);
    setListSelectedIndex(0);
    fetchDetections(pg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Optimized push to client with queue and optimistic updates
  const pushToClient = async (items) => {
    if (items.length === 0) return;

    const currentItem = items[0];
    const id = currentItem.id || currentItem.timestamp || currentItem.image_url;

    // Optimistic update
    setPushedUids((prev) => {
      const next = new Set(prev);
      items.forEach(itm => next.add(itm.uid || itm.id || itm.image_url));
      return next;
    });
    setClientTotal((prev) => prev + items.length);

    setCopyingId(id);

    try {
      // Use queue to prevent concurrent requests
      await pushQueue.add(async () => {
        return await axios.post(`${API_BASE_1}/client-detections/copy`, {
          items: items.map(({ source, type, relativePath, uid }) => ({ source, type, relativePath, uid })),
        });
      });

      setClientSnackbar({
        open: true,
        message: `${items.length} image(s) pushed to client`,
        severity: 'success'
      });
    } catch (err) {
      console.error(err);
      
      // Rollback optimistic update on error
      setPushedUids((prev) => {
        const next = new Set(prev);
        items.forEach(itm => next.delete(itm.uid || itm.id || itm.image_url));
        return next;
      });
      setClientTotal((prev) => prev - items.length);
      
      setClientSnackbar({
        open: true,
        message: 'Failed to push selected images to client',
        severity: 'error'
      });
    } finally {
      setCopyingId(null);
    }
  };
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  const exportToExcel = () => {
    if (filteredData.length === 0) return;

    const TYPE_LABELS = {
      proximity: 'Close Proximity', crowd: 'Crowd Detection', crowd_five: 'Crowd < 5',
      crowd_zero: 'Zero Person', server: 'Server Room', intruder: 'Intruder',
      entry_exit: 'Entry/Exit', phone: 'Phone', blind_spot: 'Blind Spot',
      invigilator: 'Invigilator', inversion: 'Camera Inversion', tamper: 'Camera Tampering',
    };

    // Build rows
    const rows = filteredData.map((item) => {
      // Convert date: "2026-04-08" → "08-04-2026"
      const rawDate = item.date || '';
      const formattedDate = rawDate.match(/^\d{4}-\d{2}-\d{2}$/)
        ? rawDate.split('-').reverse().join('-')
        : rawDate;

      // Extract time: "08 Apr 2026, 05:58:53 PM" → "17:58:53"
      const timeStr = (() => {
        const m = /,\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i.exec(item.detected_at || '');
        if (!m) return item.detected_at || '-';
        let h = parseInt(m[1], 10);
        const min = m[2], sec = m[3], ampm = m[4].toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${min}:${sec}`;
      })();

      // Image URL: use the correct base path
      // const IMAGE_BASE = 'http://172.31.102.8/cctv/images/results/new_tcs_results/';
      // const imageUrl = item.image_url ? `${IMAGE_BASE}${item.image_url}` : '';
      const IMAGE_BASE = `${API_BASE_1}`;
      const imageUrl = item.image_url
        ? `${IMAGE_BASE}${item.image_url}`
        : '';

      return {
        'Detection Type': TYPE_LABELS[item.type] || item.type,
        'Center Name': item.centerName || item.centre_name || '-',
        'Camera Name': item.cameraName || item.camera_name || item.camera_id || '-',
        'Location': item.location || '-',
        'Device ID': item.deviceId || item.device_id || '-',
        'Camera No': item.cameraNo || item.camera_no || '-',
        'Date': formattedDate || '-',
        'Time': timeStr,
        'Timestamp': item.detected_at || '-',
        'Persons Count': item.count ?? '',
        'Confidence': item.confidence != null ? `${(item.confidence * 100).toFixed(1)}%` : '',
        'City': item.city || '-',
        'Download Image': imageUrl,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Column widths
    ws['!cols'] = [
      { wch: 18 }, { wch: 40 }, { wch: 25 }, { wch: 20 }, { wch: 15 },
      { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 28 }, { wch: 14 },
      { wch: 12 }, { wch: 20 }, { wch: 80 },
    ];

    // Add hyperlinks to the "Download Image" column (column M, index 12)
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: 12 }); // column M
      const url = rows[R - 1]['Download Image'];
      if (url) {
        ws[cellAddr] = {
          v: 'Click to Download',
          t: 's',
          l: { Target: url, Tooltip: 'Click to open image' },
        };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detections');

    const dateStr = dateFilter || formatDateDDMMYYYY(new Date());
    XLSX.writeFile(wb, `cctv_detections_${dateStr}.xlsx`);
  };

  const handleDownloadReport = useCallback(async () => {
    if (!examFilter) {
      setReportValidationError('Please select an Exam from the top filter to generate the report.');
      return;
    }
    if (!dateFilter) {
      setReportValidationError('Please select a Date from the top filter to generate the report.');
      return;
    }

    setReportValidationError('');

    try {
      const params = {};
      if (typeFilter.length > 0) params.type = typeFilter.join(',');
      if (dateFilter) params.date = parseDateForQuery(dateFilter);
      if (search.trim()) params.search = search.trim();
      if (examFilter) params.exam_id = examFilter;
      if (shiftFilter) params.shift_id = shiftFilter;
      if (allShifts) params.all_shifts = 'true';
      if (appliedStartTime) params.start_time = appliedStartTime;
      if (appliedEndTime) params.end_time = appliedEndTime;

      const response = await reportAPI.downloadReport(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      const downloadDate = dateFilter ? parseDateForQuery(dateFilter) : formatDateDDMMYYYY(new Date());
      link.setAttribute('download', `detection_report_${downloadDate}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      
      setClientSnackbar({
        open: true,
        message: 'Report downloaded successfully!',
        severity: 'success'
      });
    } catch (error) {
      console.error('Download report failed:', error);
      setReportValidationError('Failed to download report. Please try again.');
    }
  }, [typeFilter, dateFilter, search, examFilter, shiftFilter, appliedStartTime, appliedEndTime]);

  useEffect(() => {
    setExportToExcel(() => exportToExcel);
    setDownloadConsolidatedReport(() => handleDownloadReport);
  }, [exportToExcel, handleDownloadReport, setExportToExcel, setDownloadConsolidatedReport]);


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
          placeholder="Search center name , location..."
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
          sx={{ width: { xs: '100%', sm: 'auto' }, flex: { sm: 1 }, minWidth: { sm: 200 }, maxWidth: { sm: 400 } }}
        />
        {user?.role !== 'OPERATOR' && (
          <FormControl size="small" sx={{ width: { xs: (examFilter && examShifts.length > 0) ? 'calc(33.333% - 8px)' : 'calc(50% - 6px)', sm: 150 } }}>
            <InputLabel sx={{ fontSize: 14 }}>Exam</InputLabel>
            <Select
              value={examFilter}
              label="Exam"
              onChange={(e) => setExamFilter(e.target.value)}
              sx={{
                borderRadius: '8px', bgcolor: '#f8fafc', height: 36, fontSize: 14,
                '& fieldset': { border: 'none' },
              }}
            >
              <MenuItem value="">
                <em>All Exams</em>
              </MenuItem>
              {exams.map((exam) => (
                <MenuItem key={exam.id} value={exam.id}>
                  {exam.exam_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        {/* Shift filter — dependent on the selected exam. Only shown once an
            exam is chosen and that exam has shifts. Styling matches the Exam filter. */}
        {user?.role !== 'OPERATOR' && examFilter && examShifts.length > 0 && (
          <FormControl size="small" sx={{ width: { xs: 'calc(33.333% - 8px)', sm: 130 } }}>
            <InputLabel sx={{ fontSize: 14 }}>Shift</InputLabel>
            <Select
              value={shiftFilter}
              label="Shift"
              onChange={(e) => setShiftFilter(e.target.value)}
              sx={{
                borderRadius: '8px', bgcolor: '#f8fafc', height: 36, fontSize: 14,
                '& fieldset': { border: 'none' },
              }}
            >
              <MenuItem value="">
                <em>All Shifts</em>
              </MenuItem>
              {examShifts.map((sh) => (
                <MenuItem key={sh.id} value={sh.id}>
                  {sh.shift_name || `Shift #${sh.id}`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <Box sx={{ position: 'relative', width: { xs: (examFilter && examShifts.length > 0) ? 'calc(33.333% - 8px)' : 'calc(50% - 6px)', sm: 150 } }}>
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
          sx={{ width: { xs: 'calc(50% - 6px)', sm: 170 } }}
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
          sx={{ width: { xs: 'calc(50% - 6px)', sm: 170 } }}
        />

        <Box sx={{
          ml: { xs: 0, md: 'auto' },
          width: { xs: '100%', md: 'auto' },
          display: 'flex',
          gap: { xs: 1, sm: 1.5 },
          alignItems: 'center',
          justifyContent: { xs: 'space-between', md: 'flex-end' },
          flexWrap: 'wrap',
        }}>
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
              flexShrink: 0,
              '.MuiTablePagination-toolbar': { minHeight: '36px !important', height: '36px !important', px: { xs: 0, sm: 1 } },
              '.MuiTablePagination-selectLabel, .MuiTablePagination-select, .MuiTablePagination-displayedRows': { m: 0, fontSize: 13, color: '#334155' },
              '.MuiTablePagination-actions': { color: '#64748b', ml: { xs: 0.5, sm: 2 } },
              // On phones the "Images per page" label + rows selector eat the row;
              // collapse to just "1–50 of 200  ‹ ›" so the Search button stays visible.
              '.MuiTablePagination-selectLabel': { display: { xs: 'none', sm: 'block' } },
              '.MuiTablePagination-input': { display: { xs: 'none', sm: 'inline-flex' } },
              borderBottom: 'none'
            }}
          />

          <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, alignItems: 'center', flexShrink: 0 }}>
            {(typeFilter.length > 0 || dateFilter !== todayDate || search || startTime || endTime || shiftFilter) && (
              <Button
                size="small"
                onClick={() => { setTypeFilter([]); setDateFilter(todayDate); setSearch(''); setStartTime(''); setEndTime(''); setAppliedStartTime(''); setAppliedEndTime(''); setShiftFilter(''); }}
                sx={{ height: 36, borderRadius: '8px', fontSize: 13, textTransform: 'none', color: '#64748b', flexShrink: 0, minWidth: { xs: 48, sm: 56 }, px: { xs: 1, sm: 1.5 } }}
              >
                Clear
              </Button>
            )}
            <Button
              variant="contained"
              // startIcon={<FilterList sx={{ fontSize: 16 }} />}
              onClick={() => { setAppliedStartTime(startTime); setAppliedEndTime(endTime); }}
              disableElevation
              sx={{
                bgcolor: '#3c81f6',
                height: 36, borderRadius: '8px', fontSize: 13, fontWeight: 600, textTransform: 'none',
                px: { xs: 1.5, sm: 2.5 },
                flexShrink: 0, minWidth: { xs: 80, sm: 96 },
                '&:hover': { bgcolor: '#1e40af' }
              }}
            >
              Search
            </Button>
          </Box>
        </Box>
      </Box>

      <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        {typeFilter.map((key) => {
          const meta = TYPE_META[key] || { label: key, color: '#94a3b8', bg: '#f1f5f9' };
          return (
            <Chip
              key={key}
              label={meta.label}
              size="small"
              onDelete={() => setTypeFilter(typeFilter.filter((t) => t !== key))}
              sx={{
                bgcolor: meta.bg,
                color: meta.color,
                fontWeight: 600,
                fontSize: '0.75rem',
                borderRadius: '16px',
                '& .MuiChip-deleteIcon': { color: meta.color, fontSize: 16, '&:hover': { color: meta.color } },
              }}
            />
          );
        })}
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography sx={{ fontSize: { xs: 11, sm: 13 }, fontWeight: 500, color: '#64748b', whiteSpace: 'nowrap' }}>
            Pushed {clientTotal} · Skipped {Math.max(0, total - clientTotal)}
          </Typography>
          <ToggleButtonGroup
            value={view} 
            exclusive 
            onChange={(_, v) => {
              if (v) {
                setView(v);
                if (v === 'list' && !keyboardHintShown) {
                  setClientSnackbar({
                    open: true,
                    message: '💡 Keyboard shortcuts: ↑↓ Navigate | → Push | ← Skip',
                    severity: 'info'
                  });
                  setKeyboardHintShown(true);
                }
              }
            }} 
            size="small"
            sx={{
              // List view is keyboard-driven; hide the switcher on touch screens.
              display: { xs: 'none', md: 'flex' },
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
            <ToggleButton value="grid">
              <GridView sx={{ fontSize: 16, mr: 0.5 }} /> Grid View
            </ToggleButton>
            <ToggleButton value="list">
              <ViewList sx={{ fontSize: 16, mr: 0.5 }} /> List View
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
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
      ) : (view === 'grid' || isMobile) ? (
        <Grid container spacing={2}>
          {filteredData.map((item, i) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={`${item.chNo}-${i}`}>
              <DetectionCard
                item={item}
                onClick={setSelected}
                onPushToClient={pushToClient}
                isPushing={copyingId === (item.uid || item.id || item.image_url)}
                isPushed={pushedUids.has(item.uid || item.id || item.image_url) || item.pushed_to_client === 1 || item.pushed_to_client === true}
                onSkip={handleSkipLocally}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <ListViewPanel
          data={filteredData}
          selectedIndex={listSelectedIndex}
          onSelect={setListSelectedIndex}
          onPushToClient={pushToClient}
          copyingToClient={copyingToClient}
          pushedUids={pushedUids}
        />
      )}


      <Lightbox item={selected} onClose={() => setSelected(null)} />

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
