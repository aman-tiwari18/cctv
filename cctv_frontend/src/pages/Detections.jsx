import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Box, Card, CardMedia, CardContent, Typography, Chip,
  TextField, Select, MenuItem, FormControl, InputLabel,
  ToggleButtonGroup, ToggleButton, Pagination, TablePagination,
  IconButton, Skeleton, Grid, Checkbox, Dialog, DialogContent,
  InputAdornment, Button, Snackbar, Alert, LinearProgress,
} from '@mui/material';
import {
  Search, CameraAlt, GridView, Close,
  AccessTime, Warning, Person, FilterList, Refresh, Event, LocationCity,
  Groups, Dns, DirectionsWalk, MeetingRoom, Smartphone, Visibility,
  WarningAmber, ImageNotSupported, FlipCameraAndroid, SecurityUpdateWarning,
  VisibilityOff, PersonOff,
  ChevronLeft, ChevronRight, ViewList,
  PersonAdd, KeyboardArrowDown,
  ZoomIn, Fullscreen, VerifiedUser, FiberManualRecord,
  Check, Close as CloseIcon
} from '@mui/icons-material';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { enGB } from 'date-fns/locale';
import axios from 'axios';
import { io } from 'socket.io-client';
import { API_BASE_1, IMG_BASE, SOCKET_URL, SOCKET_PATH } from '../constants/data';
import { useDetectionCounts } from '../contexts/DetectionCountsContext';
import * as XLSX from 'xlsx';

const TYPE_META = {
  proximity: { label: 'Close Proximity', color: '#5cb88a', bg: '#e5f5ed', iconKey: 'proximity' },
  crowd: { label: 'Crowd Detection', color: '#e24d7b', bg: '#fce4ec', iconKey: 'crowd' },
  crowd_five: { label: 'Crowd < 5', color: '#e06050', bg: '#fce8e6', iconKey: 'crowd_five' },
  crowd_zero: { label: 'Zero Person', color: '#6b5b95', bg: '#edeaf3', iconKey: 'crowd_zero' },
  server: { label: 'Server Room', color: '#a0623d', bg: '#f3ebe4', iconKey: 'server' },
  intruder: { label: 'Intruder', color: '#d94466', bg: '#fce4ea', iconKey: 'intruder' },
  entry_exit: { label: 'Entry/Exit', color: '#1d7a7d', bg: '#e0f0f0', iconKey: 'entry_exit' },
  phone: { label: 'Phone', color: '#465a38', bg: '#e8ece5', iconKey: 'phone' },
  blind_spot: { label: 'Blind Spot', color: '#b0a850', bg: '#f3f2e4', iconKey: 'blind_spot' },
  invigilator: { label: 'Invigilator', color: '#00bfcf', bg: '#e0f7fa', iconKey: 'invigilator' },
  inversion: { label: 'Camera Inversion', color: '#7a86b4', bg: '#eceef5', iconKey: 'inversion' },
  tamper: { label: 'Camera Tampering', color: '#00c8d4', bg: '#e0f8fa', iconKey: 'tamper' },
};

const TYPE_ICONS = {
  proximity: WarningAmber,
  crowd: Groups,
  crowd_five: Groups,
  crowd_zero: PersonOff,
  server: Dns,
  intruder: DirectionsWalk,
  entry_exit: MeetingRoom,
  phone: Smartphone,
  blind_spot: VisibilityOff,
  invigilator: Visibility,
  inversion: FlipCameraAndroid,
  tamper: SecurityUpdateWarning,
  default: CameraAlt,
};

function DetectionCard({ item, onClick, onPushToClient, copyingId, onSkip }) {
  const meta = TYPE_META[item.type] || { label: item.type, color: '#94a3b8', bg: '#f1f5f9' };
  const [imgError, setImgError] = useState(false);
  const cameraName = item.cameraName || item.camera_name || item.camera_id || '-';
  const centerName = item.centerName || item.centre_name || '-';
  const city = item.city || '-';
  const examDate = item.examDate || (item.date ? item.date.split('-').reverse().join('-') : '-');
  const invigilatorEventLabel = item.type === 'invigilator'
    ? (item.issueLabel || (item.issueType ? String(item.issueType).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''))
    : '';

  const isLoading = copyingId === (item.id || item.timestamp || item.image_url);

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
          <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#1e293b' }}>
            <CameraAlt sx={{ fontSize: 48, color: '#475569' }} />
          </Box>
        ) : (
          <CardMedia
            component="img"
            height={220}
            image={`${IMG_BASE}${item.image_url}`}
            alt={item.camera_id}
            onError={() => setImgError(true)}
            sx={{ objectFit: 'cover' }}
          />
        )}
        <Chip
          label={meta.label}
          size="small"
          sx={{
            position: 'absolute', top: 8, right: 8,
            bgcolor: meta.color, color: '#fff',
            fontWeight: 700, fontSize: '0.65rem',
          }}
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
      <CardContent sx={{ p: 1, pb: '10px !important', mx: 2 }}>
        <Typography
          variant="h6"
          fontWeight={600}
          fontSize={14}
          noWrap
          sx={{
            color: '#1e293b',
            lineHeight: 1.5,
            mb: 0.5,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {centerName}
        </Typography>

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
      </CardContent>

      <Box sx={{ mx: 2, mb: 4, mt: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'end', gap: 1.5 }}>
          <Button
            variant="outlined"
            fullWidth
            disableElevation
            onClick={(e) => { e.stopPropagation(); if (onSkip) onSkip(item); }}
            sx={{
              borderColor: '#c3c5d8', color: '#475569', fontWeight: 900,
              width: "80px",
              height: "40px",
              borderRadius: 3, textTransform: 'none', fontSize: 12,
              '&:hover': { bgcolor: '#c3c5d8', borderColor: '#c3c5d8' },
            }}
          >
            Skip
          </Button>
          <Button
            variant="contained"
            endIcon={<KeyboardArrowRightIcon />}
            fullWidth
            disableElevation
            onClick={(e) => {
              e.stopPropagation();
              if (onPushToClient && !isLoading) onPushToClient([item]);
            }}
            disabled={isLoading}
            sx={{
              bgcolor: '#3c81f6',
              color: '#fff',
              fontWeight: 900,
              height: "40px",
              width: "140px",
              borderRadius: 3,
              textTransform: 'none',
              fontSize: 12,
              '&:hover': { bgcolor: '#1e40af' },
            }}
          >
            {isLoading ? 'Pushing...' : 'Push to client'}
          </Button>
        </Box>
      </Box>
    </Card>
  );
}

function Lightbox({ item, onClose }) {
  if (!item) return null;
  const meta = TYPE_META[item.type] || {};
  const invigilatorEventLabel = item.type === 'invigilator'
    ? (item.issueLabel || (item.issueType ? String(item.issueType).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''))
    : '';
  return (
    <Dialog open onClose={onClose} maxWidth="lg" fullWidth>
      <DialogContent sx={{ p: 0, bgcolor: '#0f172a', position: 'relative' }}>
        <IconButton onClick={onClose} sx={{ position: 'absolute', top: 8, right: 8, zIndex: 10, color: '#fff', bgcolor: 'rgba(0,0,0,0.5)' }}>
          <Close />
        </IconButton>
        <img
          src={`${IMG_BASE}${item.image_url}`}
          alt={item.camera_id}
          style={{ width: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }}
        />
        <Box sx={{ p: 2, color: '#fff' }}>
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




function ListViewPanel({ data, selectedIndex, onSelect, onPushToClient, copyingToClient }) {
  const item = data[selectedIndex];
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
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 260px)', minHeight: 500 }}>

      <Box sx={{
        width: 300, flexShrink: 0, overflowY: 'auto',
        borderRight: '1px solid #e2e8f0', pr: 1,
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
                  my: 0.5, ml: 1, mr: 1.5,
                }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />

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

            <Box sx={{ display: 'flex', gap: 2.5, flex: 1, minHeight: 0 }}>
              {/* Image */}
              <Box sx={{
                flex: 1, position: 'relative', borderRadius: 3, overflow: 'hidden',
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
                width: 360, flexShrink: 0,
                bgcolor: '#fff', borderRadius: 3, p: 2.5,
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
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'start',
                        gap: 2,
                        mt: 0.5,
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
                </CardContent>

                <Box sx={{ mt: 2.5 }}>
                  <Box sx={{ display: 'flex', gap: 1.5 }}>
                    <Button
                      variant="outlined"
                      // startIcon={<CloseIcon />}
                      fullWidth
                      disableElevation
                      onClick={handleSkip}
                      sx={{
                        borderColor: '#c3c5d8', color: '#475569', fontWeight: 900,
                        width: "100px",
                        height: "40px",
                        borderRadius: 2, textTransform: 'none', fontSize: 14,
                        '&:hover': { bgcolor: '#c3c5d8', borderColor: '#c3c5d8' },
                      }}
                    >
                      Skip
                    </Button>
                    <Button
                      variant="contained"
                      endIcon={<KeyboardArrowRightIcon />}
                      fullWidth
                      disableElevation
                      onClick={handlePush}
                      disabled={copyingToClient}
                      sx={{
                        bgcolor: '#3c81f6', color: '#fff', fontWeight: 900,
                        height: "40px",
                        borderRadius: 2, textTransform: 'none', fontSize: 14,
                        '&:hover': { bgcolor: '#1e40af' },
                      }}
                    >
                      {copyingToClient ? 'Pushing...' : 'Push to client'}
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
  );
}


export default function Detections() {
  const { setAllCounts, setUnfilteredCounts, typeFilter, setTypeFilter, setExportToExcel } = useDetectionCounts();

  const [data, setData] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(todayDate);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [appliedStartTime, setAppliedStartTime] = useState('');
  const [appliedEndTime, setAppliedEndTime] = useState('');
  const [copyingToClient, setCopyingToClient] = useState(false);
  const [copyingId, setCopyingId] = useState(null);
  const [clientSnackbar, setClientSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [liveAlert, setLiveAlert] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [listSelectedIndex, setListSelectedIndex] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const [selected, setSelected] = useState(null);
  const [selectedPaths, setSelectedPaths] = useState([]);

  const buildSelectionKey = (item) => `${item.source}|${item.type}|${item.relativePath}`;
  const toggleSelection = (item) => {
    const key = buildSelectionKey(item);
    setSelectedPaths((prev) => (
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]
    ));
  };

  const fetchAllCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: 1, limit: 1 });
      if (dateFilter) params.append('date', parseDateForQuery(dateFilter));
      const res = await axios.get(`${API_BASE_1}/detections?${params}`);
      if (res.data.success) {
        setUnfilteredCounts(res.data.counts || {});
        if (typeFilter.length === 0) {
          setAllCounts(res.data.counts || {});
        }
      }
    } catch (err) {
      console.error('Failed to fetch all counts:', err);
    }
  }, [dateFilter, setAllCounts, setUnfilteredCounts, typeFilter.length]);

  useEffect(() => {
    fetchAllCounts();
  }, [fetchAllCounts]);

  const fetchDetections = useCallback(async (pg = 1, rpp = rowsPerPage) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: rpp });
      if (typeFilter.length > 0) params.append('type', typeFilter.join(','));
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
    if (typeFilter.length > 0 && !typeFilter.includes(item.type)) return false;
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

    setListSelectedIndex(0);
    fetchDetections(pg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pushToClient = async (items) => {
    if (items.length === 0) return;

    const currentItem = items[0]; // since you're passing single item
    const id = currentItem.id || currentItem.timestamp || currentItem.image_url;

    setCopyingId(id);

    try {
      await axios.post(`${API_BASE_1}/client-detections/copy`, {
        items: items.map(({ source, type, relativePath }) => ({ source, type, relativePath })),
      });

      setClientSnackbar({
        open: true,
        message: `${items.length} image(s) pushed to client`,
        severity: 'success'
      });
    } catch (err) {
      console.error(err);
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
  
  useEffect(() => {
    setExportToExcel(() => exportToExcel);
  }, [exportToExcel]);

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
          sx={{ minWidth: 260, maxWidth: 600, flex: 1 }}
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

          {(typeFilter.length > 0 || dateFilter !== todayDate || search || startTime || endTime) && (
            <Button
              size="small"
              onClick={() => { setTypeFilter([]); setDateFilter(todayDate); setSearch(''); setStartTime(''); setEndTime(''); setAppliedStartTime(''); setAppliedEndTime(''); }}
              sx={{ height: 36, borderRadius: '8px', fontSize: 13, textTransform: 'none', color: '#64748b' }}
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
              height: 36, borderRadius: '8px', fontSize: 13, fontWeight: 600, textTransform: 'none', px: 2.5,
              '&:hover': { bgcolor: '#1e40af' }
            }}
          >
            Search
          </Button>
        </Box>
      </Box>

      {/* ── Selected Type Chips + View Toggle ── */}
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
        <Box sx={{ ml: 'auto' }}>
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
      ) : view === 'grid' ? (
        <Grid container spacing={2}>
          {filteredData.map((item, i) => (
            <Grid item xs={12} sm={6} md={3} key={`${item.chNo}-${i}`}>
              {/* <DetectionCard
                item={item}
                onClick={setSelected}
                onPushToClient={pushToClient}
                copyingToClient={copyingToClient}
                onSkip={() => console.log('Skip from grid view - unsupported auto-advance')}
              /> */}
              <DetectionCard
                item={item}
                onClick={setSelected}
                onPushToClient={pushToClient}
                copyingId={copyingId}
                onSkip={() => console.log('Skip from grid view - unsupported auto-advance')}
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