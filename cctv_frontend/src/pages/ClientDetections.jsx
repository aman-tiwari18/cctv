import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import {
  Box,
  Card,
  Typography,
  TextField,
  Button,
  Snackbar,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  TablePagination,
  IconButton,
  Skeleton,
  InputAdornment,
  Grid, CardMedia, CardContent, Dialog, DialogContent, Checkbox,
  useMediaQuery, useTheme,
} from '@mui/material';
import {
  Refresh,
  CameraAlt,
  Search,
  FilterList,
  Event,
  AccessTime,
  ViewList,
  ImageNotSupported,
  WarningAmber,
  Groups,
  PersonOff,
  Dns,
  DirectionsWalk,
  MeetingRoom,
  Smartphone,
  VisibilityOff,
  Visibility,
  FlipCameraAndroid,
  SecurityUpdateWarning,
  EventSeat,
  DesktopAccessDisabled,
  ChevronLeft,
  ChevronRight,
  KeyboardArrowDown,
  Check,
  Warning,
  Close as CloseIcon,
  GridView, LocationCity, Close, Memory, DeleteOutline, Undo as UndoIcon,
  Person, LocalOffer, ArrowUpward,
} from '@mui/icons-material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { enGB } from 'date-fns/locale';
import axios from 'axios';
import { API_BASE_1 } from '../constants/data';
import { useDetectionCounts } from '../contexts/DetectionCountsContext';
import { useSocket } from '../contexts/SocketContext';
import { useSearchParams } from 'react-router-dom';
import { examsAPI, reportAPI, clientDetectionsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useDetectionNav, DetectionDialog } from '../components/DetectionNav';
import * as XLSX from 'xlsx';

const TYPE_META = {
  proximity: { label: 'Close Proximity', color: '#5cb88a', bg: '#e5f5ed' },
  crowd: { label: 'Crowd Detection (Entry/Exit)', color: '#e24d7b', bg: '#fce4ec' },
  crowd_biometric: { label: 'Crowd Detection (Biometric)', color: '#9333ea', bg: '#f3e8ff' },
  crowd_five: { label: 'Less Than 5 People In a Lab', color: '#e06050', bg: '#fce8e6' },
  crowd_zero: { label: 'Zero Person', color: '#6b5b95', bg: '#edeaf3' },
  server: { label: 'Server Room', color: '#a0623d', bg: '#f3ebe4' },
  intruder: { label: 'Intruder', color: '#d94466', bg: '#fce4ea' },
  strongroom: { label: 'Strong Room Movement', color: '#b91c1c', bg: '#fef2f2' },
  qp_box: { label: 'QP Box Not Visible In Strong Room', color: '#dc2626', bg: '#fee2e2' },
  furniture: { label: 'Improper Furniture', color: '#c2410c', bg: '#fff1e6' },
  monitor_tamper: { label: 'Monitor Tampering', color: '#6d28d9', bg: '#f3e8ff' },
  crowd_five_invigilator: { label: 'Crowd < 5 + Invigilator Static', color: '#0f766e', bg: '#ccfbf1' },
  entry_exit: { label: 'Entry/Exit', color: '#1d7a7d', bg: '#e0f0f0' },
  phone: { label: 'Phone', color: '#465a38', bg: '#e8ece5' },
  blind_spot: { label: 'Blind Spot', color: '#b0a850', bg: '#f3f2e4' },
  invigilator: { label: 'Invigilator', color: '#00bfcf', bg: '#e0f7fa' },
  inversion: { label: 'Camera Inversion', color: '#7a86b4', bg: '#eceef5' },
  tampering: { label: 'Camera Tampering', color: '#00c8d4', bg: '#e0f8fa' },
  vision: { label: 'Scene Classification', color: '#3b82f6', bg: '#dbeafe' },
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
  furniture: EventSeat,
  monitor_tamper: DesktopAccessDisabled,
  crowd_five_invigilator: Visibility,
  entry_exit: MeetingRoom,
  phone: Smartphone,
  blind_spot: VisibilityOff,
  invigilator: Visibility,
  inversion: FlipCameraAndroid,
  tampering: SecurityUpdateWarning,
  vision: Visibility,
  default: CameraAlt,
};

// How long the NEW tag shows on a card after it arrives or is revealed.
const NEW_BADGE_MS = 6000;

const NewBadge = ({ addedAt, sx }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!addedAt) return;
    
    const rawTime = typeof addedAt === 'number' ? addedAt : new Date(addedAt).getTime();
    const parsedTime = rawTime < 10000000000 ? rawTime * 1000 : rawTime;
    if (isNaN(parsedTime)) return;
    
    const diff = Math.max(0, Date.now() - parsedTime);
    
    if (diff < NEW_BADGE_MS) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), NEW_BADGE_MS - diff);
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
        bgcolor: '#ef4444', color: '#fff', fontWeight: 800,
        fontSize: '0.65rem', height: 20, zIndex: 20,
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

// A detection is "accepted" once the client clicks Accept (persisted as
// accepted_by_client on the backend; mirrored here as item.accepted).
const isDetectionAccepted = (item = {}) => item.accepted === 1 || item.accepted_by_client === 1;

const getDetectionShiftName = (item = {}) => (
  item.shiftName
  || item.shift_name
  || item.shift?.shift_name
  || item.shift?.name
  || (item.shift_id ? `Shift #${item.shift_id}` : '-')
);

const getDetectionPushedBy = (item = {}) => (
  item.pushedByName
  || item.pushed_by_name
  || (item.pushedBy ?? item.pushed_by ? `User #${item.pushedBy ?? item.pushed_by}` : null)
);

// "Pushed by" is internal info — only ADMIN/OPERATOR see it, never the client (VIEWER).
const canViewPushedBy = (role) => role === 'ADMIN' || role === 'OPERATOR';

function DetectionCard({ item, onClick, onRemove, onUndo, onAccept, isRemoving, isPendingRemoval, isAccepting, isAccepted }) {
  const { user } = useAuth();
  const meta = TYPE_META[item.type] || { label: item.type, color: '#94a3b8', bg: '#f1f5f9' };
  const [imgError, setImgError] = useState(false);
  const cameraName = item.cameraName || item.camera_name || item.camera_id || '-';
  const centerName = item.centerName || item.centre_name || '-';
  const city = item.city || '-';
  const examDate = item.examDate || (item.date ? item.date.split('-').reverse().join('-') : '-');
  const tcCode = getDetectionTcCode(item);
  const shiftName = getDetectionShiftName(item);
  // Camera's scene classification (RTSP classification / HLS camera_category).
  const classification = item.category || item.classification || '';
  const pushedBy = canViewPushedBy(user?.role) ? getDetectionPushedBy(item) : null;
  const invigilatorEventLabel = item.type === 'invigilator'
    ? (item.issueLabel || (item.issueType ? String(item.issueType).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''))
    : '';

  return (
    <Card
      onClick={() => !isPendingRemoval && onClick(item)}
      sx={{
        cursor: isPendingRemoval ? 'default' : 'pointer',
        borderRadius: 3,
        overflow: 'hidden',
        transition: 'all 0.22s ease',
        '&:hover': isPendingRemoval ? {} : { transform: 'translateY(-4px) scale(1.005)', boxShadow: '0 14px 30px rgba(15, 23, 42, 0.14)' },
        border: '1px solid #e2e8f0',
      }}
    >
      <Box sx={{ position: 'relative', bgcolor: '#f1f5f9' }}>
        {imgError ? (
          <Box sx={{ height: { xs: 200, md: 220 }, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#1e293b' }}>
            <CameraAlt sx={{ fontSize: 48, color: '#475569' }} />
          </Box>
        ) : (
          <CardMedia
            component="img"
            image={item.image_url}
            alt={item.camera_id}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            sx={{ height: { xs: 200, md: 220 }, width: '100%', objectFit: 'contain', bgcolor: '#f1f5f9', filter: isPendingRemoval ? 'grayscale(0.4) brightness(0.85)' : 'none', transition: 'filter 0.2s ease' }}
          />
        )}
        {/* When pending removal, overlay a trash glyph on the image — matches
            the spec mock. The image itself stays visible underneath. */}
        {isPendingRemoval && (
          <Box sx={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: 'rgba(15, 23, 42, 0.25)', pointerEvents: 'none',
          }}>
            <Box sx={{
              width: 56, height: 56, borderRadius: '50%',
              bgcolor: 'rgba(255,255,255,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            }}>
              <DeleteOutline sx={{ fontSize: 28, color: '#64748b' }} />
            </Box>
          </Box>
        )}
        <NewBadge
          addedAt={item.newBadgeAt || item.updatedAt || item.updated_at}
          sx={{ position: 'absolute', top: 8, right: 8 }}
        />
        {Number(item.sms_sent) === 1 && (
          <Chip
            icon={<Smartphone sx={{ fontSize: 12, color: '#fff !important' }} />}
            label="SMS sent"
            size="small"
            sx={{
              position: 'absolute', bottom: 8, left: 8,
              bgcolor: '#098466', color: '#fff',
              fontWeight: 700, fontSize: '0.65rem',
            }}
          />
        )}
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
        {/* Repeat counter: 2, 3, ... = same pair at the same spot as this camera's earlier report */}
        {item.type === 'proximity' && item.violation_count != null && (
          <Chip
            icon={<Warning sx={{ fontSize: 12, color: '#fff !important' }} />}
            label={`Proximity Violation ${item.violation_count}`}
            size="small"
            sx={{
              position: 'absolute', bottom: 8, right: 8,
              bgcolor: Number(item.violation_count) > 1 ? '#dc2626' : 'rgba(15, 23, 42, 0.72)', color: '#fff',
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

          {classification && (
            <>
              <LocalOffer sx={{ fontSize: 14, color: '#777' }} />
              <Typography noWrap title={classification} sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
                Classification: {classification}
              </Typography>
            </>
          )}

          {pushedBy && (
            <>
              <Person sx={{ fontSize: 14, color: '#777' }} />
              <Typography noWrap title={pushedBy} sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
                Pushed by: {pushedBy}
              </Typography>
            </>
          )}
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

      <Box sx={{ mx: { xs: 1.5, sm: 2 }, mb: { xs: 2, sm: 3 }, mt: 1 }}>
        {isPendingRemoval ? (
          // 15s undo affordance — replaces the Remove button. The image above
          // stays visible (dimmed) so the user has visual continuity.
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0.5 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
              Detection removed
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#64748b', mb: 0.5 }}>
              This action can be undone
            </Typography>
            <Button
              variant="contained"
              disableElevation
              startIcon={<UndoIcon sx={{ fontSize: 16 }} />}
              onClick={(e) => { e.stopPropagation(); if (onUndo) onUndo(item); }}
              sx={{
                bgcolor: '#2563eb', color: '#fff', fontWeight: 700,
                height: 40, width: '100%', borderRadius: 2,
                textTransform: 'none', fontSize: 13,
                '&:hover': { bgcolor: '#1d4ed8' },
              }}
            >
              Undo
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5 }}>
            <Button
              variant="contained"
              disableElevation
              startIcon={isAccepted ? <Check sx={{ fontSize: 16 }} /> : null}
              onClick={(e) => {
                e.stopPropagation();
                if (onAccept && !isAccepting && !isAccepted) onAccept(item);
              }}
              disabled={isAccepting || isAccepted}
              sx={{
                bgcolor: '#098466',
                color: '#fff',
                fontWeight: 900,
                height: "40px",
                flex: 1,
                minWidth: 0,
                maxWidth: { xs: 'none', sm: 160 },
                borderRadius: 3,
                textTransform: 'none',
                fontSize: 12,
                whiteSpace: 'nowrap',
                '&:hover': { bgcolor: '#086e55' },
                '&.Mui-disabled': { bgcolor: isAccepted ? '#098466' : '#cbd5e1', color: '#fff', opacity: isAccepted ? 0.9 : 0.7 },
              }}
            >
              {isAccepted ? 'Accepted' : isAccepting ? 'Accepting...' : 'Accept'}
            </Button>
            <Button
              variant="contained"
              disableElevation
              onClick={(e) => {
                e.stopPropagation();
                if (onRemove && !isRemoving) onRemove(item);
              }}
              disabled={isRemoving}
              sx={{
                bgcolor: '#f3404a',
                color: '#fff',
                fontWeight: 900,
                height: "40px",
                flex: 1,
                minWidth: 0,
                maxWidth: { xs: 'none', sm: 160 },
                borderRadius: 3,
                textTransform: 'none',
                fontSize: 12,
                whiteSpace: 'nowrap',
                '&:hover': { bgcolor: '#a51f24' },
              }}
            >
              {isRemoving ? 'Removing...' : 'Remove'}
            </Button>
          </Box>
        )}
      </Box>
    </Card>
  );
}

function Lightbox({ item, onClose, pendingLiveCount = 0, index = -1, count = 0, onNavigate = () => {}, neighbourUrls = [],
  onAccept, onRemove, onUndo, isAccepting = false, isAccepted = false, isRemoving = false, isPendingRemoval = false }) {
  const { user } = useAuth();
  // Left / Right keys and the two arrow buttons step through the grid the card was opened from.
  useDetectionNav({ index: item ? index : -1, count, onNavigate, neighbourUrls });
  if (!item) return null;
  const meta = TYPE_META[item.type] || {};
  const pushedBy = canViewPushedBy(user?.role) ? getDetectionPushedBy(item) : null;
  const invigilatorEventLabel = item.type === 'invigilator'
    ? (item.issueLabel || (item.issueType ? String(item.issueType).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''))
    : '';
  const where = [
    item.centerName && `${item.centerName}${item.city ? ` — ${item.city}` : ''}${item.state ? `, ${item.state}` : ''}`,
    item.tcCode && `TC: ${item.tcCode}`,
    (item.shiftName || item.shift_name || item.shift_id) && `Shift: ${getDetectionShiftName(item)}`,
    pushedBy && `Pushed by: ${pushedBy}`,
  ].filter(Boolean).join('  ·  ');
  return (
    <DetectionDialog
      onClose={onClose}
      imageSrc={item.image_url}
      alt={item.camera_id}
      nav={{ index, count, onNavigate }}
      banner={pendingLiveCount > 0 ? (
        <Chip
          label={`${pendingLiveCount} new detection${pendingLiveCount > 1 ? 's' : ''} waiting`}
          size="small"
          sx={{ bgcolor: '#f59e0b', color: '#fff', fontWeight: 700 }}
        />
      ) : null}
      info={(
        <>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip label={meta.label} size="small" sx={{ bgcolor: meta.color, color: '#fff', fontWeight: 700 }} />
            {invigilatorEventLabel && (
              <Chip label={invigilatorEventLabel} size="small" sx={{ bgcolor: '#334155', color: '#fff' }} />
            )}
            {item.type === 'proximity' && item.violation_count != null && (
              <Chip label={`Proximity Violation ${item.violation_count}`} size="small" sx={{ bgcolor: '#dc2626', color: '#fff', fontWeight: 700 }} />
            )}
            {item.count != null && <Chip label={`Count: ${item.count}`} size="small" sx={{ bgcolor: '#334155', color: '#fff' }} />}
            {item.confidence != null && (
              <Chip label={`Confidence: ${(item.confidence * 100).toFixed(1)}%`} size="small" sx={{ bgcolor: '#334155', color: '#fff' }} />
            )}
          </Box>
          <Typography variant="subtitle1" sx={{ mt: 0.75, fontWeight: 700, lineHeight: 1.3 }}>
            {item.cameraName || item.camera_id}
            <Typography component="span" variant="body2" sx={{ ml: 1.5, color: '#94a3b8', fontWeight: 400 }}>{item.detected_at}</Typography>
          </Typography>
          {where && <Typography variant="body2" sx={{ color: '#94a3b8' }}>{where}</Typography>}
        </>
      )}
      actions={isPendingRemoval ? (
        // 15 s undo window after Remove, like the card
        onUndo && (
          <Button
            variant="contained"
            disableElevation
            startIcon={<UndoIcon sx={{ fontSize: 18 }} />}
            onClick={() => onUndo(item)}
            sx={{ bgcolor: '#2563eb', color: '#fff', fontWeight: 900, borderRadius: 3, textTransform: 'none', '&:hover': { bgcolor: '#1d4ed8' } }}
          >
            Undo remove
          </Button>
        )
      ) : (
        <>
          {onAccept && (
            <Button
              variant="contained"
              disableElevation
              startIcon={isAccepted ? <Check sx={{ fontSize: 18 }} /> : null}
              onClick={() => { if (!isAccepting && !isAccepted) onAccept(item); }}
              disabled={isAccepting || isAccepted}
              sx={{
                bgcolor: '#098466', color: '#fff', fontWeight: 900, borderRadius: 3, textTransform: 'none', whiteSpace: 'nowrap',
                '&:hover': { bgcolor: '#086e55' },
                '&.Mui-disabled': { bgcolor: isAccepted ? '#098466' : '#475569', color: '#fff', opacity: isAccepted ? 0.9 : 0.7 },
              }}
            >
              {isAccepted ? 'Accepted' : isAccepting ? 'Accepting...' : 'Accept'}
            </Button>
          )}
          {onRemove && (
            <Button
              variant="contained"
              disableElevation
              onClick={() => { if (!isRemoving) onRemove(item); }}
              disabled={isRemoving}
              sx={{ bgcolor: '#f3404a', color: '#fff', fontWeight: 900, borderRadius: 3, textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: '#a51f24' }, '&.Mui-disabled': { bgcolor: '#475569', color: '#fff' } }}
            >
              {isRemoving ? 'Removing...' : 'Remove'}
            </Button>
          )}
        </>
      )}
    />
  );
}

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'hls', label: 'HLS' },
  { value: 'rtsp', label: 'RTSP' },
];


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

// Date filter to apply when an exam is picked from the dropdown: today while the
// exam is running, otherwise no date (all of that exam's days). The page defaults
// to today, so a past exam would otherwise show nothing.
const dateFilterForExam = (exam) => {
  if (!exam?.start_date) return '';
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const start = String(exam.start_date).slice(0, 10);
  const end = String(exam.end_date || exam.start_date).slice(0, 10);
  return start <= todayIso && todayIso <= end ? todayDate : '';
};

// Date to use when an exam is picked: today while the exam is running, otherwise
// the date of its newest detection this user can see (role-aware count endpoint),
// so a past exam opens on a day that has data. '' (all dates) if it has none.
const resolveExamDate = async (exam) => {
  const running = dateFilterForExam(exam);
  if (running || !exam?.id) return running;
  try {
    const res = await examsAPI.getDetectionCount(exam.id);
    return res.data?.data?.latest_date || '';
  } catch (err) {
    return '';
  }
};

// A pushed detection's position in the client feed: (pushed_at, source, id),
// matching the backend's order. pushed_at is whole seconds and a push burst
// puts many in one second, so time alone can't say which one is "the 50th".
const SOURCE_RANK = { hls: 0, rtsp: 1 };
const feedPosition = (it) => ({
  ts: it.pushed_at || it.created_at || new Date().toISOString(),
  source: it.source,
  id: Number(it.id) || 0,
});
const compareFeedPosition = (a, b) => (Date.parse(a.ts) - Date.parse(b.ts))
  || ((SOURCE_RANK[a.source] ?? 0) - (SOURCE_RANK[b.source] ?? 0))
  || (a.id - b.id);

// Live socket events are applied in batches this often — a 100-item burst
// becomes a handful of renders instead of one full-page render per detection.
const LIVE_BATCH_MS = 250;

// The page re-renders on every live batch/count change; memoized so cards and
// list rows whose props didn't change skip re-rendering.
const MemoDetectionCard = memo(DetectionCard);
const MemoListViewPanel = memo(ListViewPanel);

const buildImageKey = (item) => `${item.source}|${item.type}|${item.relativePath}`;

// function ListViewPanel({ data, selectedIndex, onSelect }) {
//   const item = data[selectedIndex];

//   useEffect(() => {
//     const handler = (e) => {
//       if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

//       if (e.key === 'ArrowUp') {
//         e.preventDefault();
//         onSelect(Math.max(0, selectedIndex - 1));
//       }
//       if (e.key === 'ArrowDown') {
//         e.preventDefault();
//         onSelect(Math.min(data.length - 1, selectedIndex + 1));
//       }
//       if (e.key === 'ArrowLeft') {
//         e.preventDefault();
//         console.log('Yes clicked via ArrowLeft');
//       }
//       if (e.key === 'ArrowRight') {
//         e.preventDefault();
//         console.log('No clicked via ArrowRight');
//       }
//     };
//     window.addEventListener('keydown', handler);
//     return () => window.removeEventListener('keydown', handler);
//   }, [selectedIndex, data.length, item, onSelect]);

//   return (
//     <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 260px)', minHeight: 500 }}>
//       <Box sx={{
//         width: 400, flexShrink: 0, overflowY: 'auto',
//         borderRight: '1px solid #e2e8f0', pr: 1,
//         // borderRadius: 5, bgcolor: '#ffffff',
//         bgcolor: '#ffffff',
//       }}>

//         {data.map((listItem, idx) => {
//           const isActive = idx === selectedIndex;
//           const centerName = listItem.centerName || listItem.centre_name || '-';
//           const cameraName = listItem.cameraName || listItem.camera_id || listItem.filename || '-';
//           const city = listItem.city || '-';

//           return (
//             <Box
//               key={`${listItem.filename}-${idx}`}
//               onClick={() => onSelect(idx)}
//               sx={{
//                 display: 'flex',
//                 alignItems: 'stretch',
//                 mb: 0.5,
//                 cursor: 'pointer',
//                 bgcolor: isActive ? '#eff6ff' : 'transparent',
//                 borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
//                 '&:hover': { bgcolor: isActive ? '#eff6ff' : '#f8fafc' },
//               }}
//             >
//               <Box
//                 component="img"
//                 src={listItem.image_url}
//                 alt={listItem.camera_id}
//                 sx={{
//                   width: { xs: 62, sm: 70, md: 70 },
//                   height: { xs: 62, sm: 70, md: 70 },
//                   flexShrink: 0,
//                   objectFit: 'cover',
//                   alignSelf: 'center',
//                   borderRadius: 1,
//                   my: 0.5,
//                   ml: 1,
//                   mr: 1.5,
//                 }}
//                 onError={(e) => { e.target.style.display = 'none'; }}
//               />

//               <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
//                 {(() => {
//                   if (!listItem.detected_at || listItem.detected_at === '-') {
//                     return (
//                       <Typography variant="body2" fontWeight={500} color="text.secondary" fontSize={12}>
//                         -
//                       </Typography>
//                     );
//                   }
//                   const commaIdx = listItem.detected_at.indexOf(',');
//                   const datePart = commaIdx !== -1 ? listItem.detected_at.substring(0, commaIdx + 1) : listItem.detected_at;
//                   const timePart = commaIdx !== -1 ? listItem.detected_at.substring(commaIdx + 1).trim() : '';

//                   return (
//                     <>
//                       <Typography variant="body2" fontWeight={600} color="text.primary" fontSize={13}>
//                         {datePart}
//                       </Typography>
//                       {timePart && (
//                         <Typography variant="caption" fontWeight={500} color="text.secondary" fontSize={12}>
//                           {timePart}
//                         </Typography>
//                       )}
//                     </>
//                   );
//                 })()}
//               </Box>
//             </Box>
//           );
//         })}
//       </Box>

//       {/* Right panel: Image + Details side-by-side */}
//       <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
//         {item ? (
//           <>
//             <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
//               {(TYPE_META[item.type] || { label: item.type }).label}
//             </Typography>

//             {/* Image + Details row */}
//             <Box sx={{ display: 'flex', gap: 2.5, flex: 1, minHeight: 0 }}>
//               {/* Image */}
//               <Box sx={{
//                 flex: 1, position: 'relative', borderRadius: 3, overflow: 'hidden',
//                 bgcolor: '#fff',
//                 boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
//               }}>
//                 <Box
//                   component="img"
//                   src={item.image_url}
//                   alt={item.filename}
//                   sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
//                   onError={(e) => { e.target.style.display = 'none'; }}
//                 />
//               </Box>

//               {/* Details card */}
//               <Box sx={{
//                 width: 260, flexShrink: 0,
//                 bgcolor: '#fff', borderRadius: 3, p: 2.5,
//                 border: '1px solid #e8ecf1',
//                 display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
//               }}>
//                 <Box>
//                   <Typography variant="caption" sx={{ color: '#2563eb', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.7rem' }}>
//                     Image Info
//                   </Typography>

//                   <Box sx={{ mt: 2 }}>
//                     <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.6rem' }}>
//                       Camera ID
//                     </Typography>
//                     <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a', mt: 0.3 }}>
//                       {item.cameraName || item.camera_id || item.filename || '-'}
//                     </Typography>
//                   </Box>

//                   <Box sx={{ mt: 1.5 }}>
//                     <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.6rem' }}>
//                       Location
//                     </Typography>
//                     <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a', mt: 0.3 }}>
//                       {item.centerName || item.centre_name || '-'}, {item.city || '-'}
//                     </Typography>
//                   </Box>

//                   <Box sx={{ mt: 1.5 }}>
//                     <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.6rem' }}>
//                       Timestamp
//                     </Typography>
//                     <Typography variant="body2" fontWeight={700} sx={{ color: '#0f172a', mt: 0.3 }}>
//                       {item.detected_at || '-'}
//                     </Typography>
//                   </Box>

//                   <Box sx={{ mt: 1.5 }}>
//                     <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.6rem' }}>
//                       Detection Type
//                     </Typography>
//                     <Chip
//                       label={(TYPE_META[item.type] || { label: item.type }).label}
//                       size="small"
//                       sx={{
//                         mt: 0.5,
//                         bgcolor: (TYPE_META[item.type] || { bg: '#f1f5f9' }).bg,
//                         color: (TYPE_META[item.type] || { color: '#64748b' }).color,
//                         fontWeight: 600, fontSize: '0.7rem',
//                       }}
//                     />
//                   </Box>
//                 </Box>
//               </Box>
//             </Box>
//           </>
//         ) : (
//           <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//             <Typography color="text.secondary">Select a detection to preview</Typography>
//           </Box>
//         )}
//       </Box>
//     </Box>
//   );
// }

function ListViewPanel({ data, selectedIndex, onSelect, onRemove, onUndo, onAccept, removingId, pendingRemovals, acceptingId, jumpToTopKey }) {
  const { user } = useAuth();
  const item = data[selectedIndex];
  const itemRefs = useRef([]); // ✅ ref array for each list item
  const tcCode = item ? getDetectionTcCode(item) : '-';
  const shiftName = item ? getDetectionShiftName(item) : '-';
  const classification = item ? (item.category || item.classification || '') : '';
  const pushedBy = item && canViewPushedBy(user?.role) ? getDetectionPushedBy(item) : null;
  const isPendingRemoval = item ? pendingRemovals.has(item.uid) : false;
  const isRemoving = item ? removingId === item.uid : false;
  const isAccepting = item ? acceptingId === item.uid : false;
  const isAccepted = item ? isDetectionAccepted(item) : false;

  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); onSelect(Math.max(0, selectedIndex - 1)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onSelect(Math.min(data.length - 1, selectedIndex + 1)); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIndex, data.length, onSelect]);

  // ✅ Auto-scroll directly via ref — most reliable approach
  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  // Accepted/removed items leave the list, so the index can end up past the end.
  useEffect(() => {
    if (data.length > 0 && selectedIndex > data.length - 1) onSelect(data.length - 1);
  }, [data.length, selectedIndex, onSelect]);

  // selectedIndex may already be 0 when the pill is clicked, so the effect
  // above won't fire — scroll the list container explicitly.
  const listContainerRef = useRef(null);
  useEffect(() => {
    if (jumpToTopKey && listContainerRef.current) {
      listContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [jumpToTopKey]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, height: { xs: 'auto', md: 'calc(100vh - 310px)' }, minHeight: { xs: 0, md: 500 } }}>

      <Box
        ref={listContainerRef}
        sx={{
          width: { xs: '100%', md: '30%', lg: 300 }, flexShrink: 0, overflowY: 'auto',
          maxHeight: { xs: 280, md: 'none' },
          borderRight: { xs: 'none', md: '1px solid #e2e8f0' },
          borderBottom: { xs: '1px solid #e2e8f0', md: 'none' },
          pr: 1,
          bgcolor: '#ffffff',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {data.map((listItem, idx) => {
          const isActive = idx === selectedIndex;
          const itemPending = pendingRemovals.has(listItem.uid);
          const centerName = listItem.centerName || listItem.centre_name || '-';
          const cameraName = listItem.cameraName || listItem.camera_id || listItem.filename || '-';
          const city = listItem.city || '-';

          return (
            <Box
              key={listItem.uid || listItem.filename || idx}
              ref={(el) => (itemRefs.current[idx] = el)} // ✅ assign ref per item
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
                  addedAt={listItem.newBadgeAt || listItem.updatedAt || listItem.updated_at}
                  sx={{ position: 'absolute', top: -4, left: -4, zIndex: 10, transform: 'scale(0.85)' }}
                />
                <Box
                  component="img"
                  src={listItem.image_url}
                  alt={listItem.camera_id}
                  loading="lazy"
                  decoding="async"
                  sx={{
                    width: { xs: 62, sm: 70, md: 70 },
                    height: { xs: 62, sm: 70, md: 70 },
                    flexShrink: 0,
                    objectFit: 'cover',
                    alignSelf: 'center',
                    borderRadius: 1,
                    filter: itemPending ? 'grayscale(0.5) brightness(0.85)' : 'none',
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
                    </>
                  );
                })()}
              </Box>
            </Box>
          );
        })}
      </Box>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {item ? (
          <>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              {(TYPE_META[item.type] || { label: item.type }).label}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2.5, flex: 1, minHeight: 0 }}>
              <Box sx={{
                flex: 1, position: 'relative', borderRadius: 3, overflow: 'hidden',
                minHeight: { xs: 240, md: 0 },
                bgcolor: '#fff'
              }}>
                {/* Keyed per detection: onError hides the element, so reusing one
                    <img> across selections would keep every later image hidden. */}
                <Box
                  key={item.uid || item.filename}
                  component="img"
                  src={item.image_url}
                  alt={item.filename}
                  sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </Box>

              <Box sx={{
                width: { xs: '100%', md: '36%', lg: 360, xl: 400 }, flexShrink: 0,
                bgcolor: '#fff', borderRadius: 3, p: { xs: 1.5, sm: 2.5 },
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
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

                    {classification && (
                      <>
                        <LocalOffer sx={{ fontSize: 14, color: '#777' }} />
                        <Typography noWrap title={classification} sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
                          Classification: {classification}
                        </Typography>
                      </>
                    )}

                    {pushedBy && (
                      <>
                        <Person sx={{ fontSize: 14, color: '#777' }} />
                        <Typography noWrap title={pushedBy} sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
                          Pushed by: {pushedBy}
                        </Typography>
                      </>
                    )}
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
                      color={(TYPE_META[item.type] || {}).color}
                      fontWeight={500}
                    >
                      Conf: {(item.confidence * 100).toFixed(0)}%
                    </Typography>
                  )}
                </CardContent>

                <Box sx={{ mt: 2.5 }}>
                  {isPendingRemoval ? (
                    // List-view undo: same content as DetectionCard but sized
                    // to fill the right-pane action area.
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 0.5 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                        Detection removed
                      </Typography>
                      <Typography sx={{ fontSize: 13, color: '#64748b', mb: 0.5 }}>
                        This action can be undone
                      </Typography>
                      <Button
                        variant="contained"
                        disableElevation
                        startIcon={<UndoIcon sx={{ fontSize: 18 }} />}
                        onClick={() => { if (onUndo) onUndo(item); }}
                        sx={{
                          bgcolor: '#2563eb', color: '#fff', fontWeight: 700,
                          height: 40, width: 200, borderRadius: 2,
                          textTransform: 'none', fontSize: 14,
                          '&:hover': { bgcolor: '#1d4ed8' },
                        }}
                      >
                        Undo
                      </Button>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
                      <Button
                        variant="contained"
                        disableElevation
                        startIcon={isAccepted ? <Check sx={{ fontSize: 18 }} /> : null}
                        onClick={() => {
                          if (onAccept && !isAccepting && !isAccepted) onAccept(item);
                        }}
                        disabled={isAccepting || isAccepted}
                        sx={{
                          bgcolor: '#16a34a', color: '#fff', fontWeight: 900,
                          height: "40px",
                          width: "160px",
                          borderRadius: 2, textTransform: 'none', fontSize: 14,
                          '&:hover': { bgcolor: '#15803d' },
                          '&.Mui-disabled': { bgcolor: isAccepted ? '#16a34a' : '#cbd5e1', color: '#fff', opacity: isAccepted ? 0.9 : 0.7 },
                        }}
                      >
                        {isAccepted ? 'Accepted' : isAccepting ? 'Accepting...' : 'Accept'}
                      </Button>
                      <Button
                        variant="contained"
                        disableElevation
                        onClick={() => {
                          if (onRemove && !isRemoving) onRemove(item);
                        }}
                        disabled={isRemoving}
                        sx={{
                          bgcolor: '#c3282e', color: '#fff', fontWeight: 900,
                          height: "40px",
                          width: "160px",
                          borderRadius: 2, textTransform: 'none', fontSize: 14,
                          display: 'flex',
                          justifyContent: 'space-between',
                          pl: 2,
                          pr: 0.5,
                          '&:hover': { bgcolor: '#a51f24' },
                        }}
                      >
                        <span>{isRemoving ? 'Removing...' : 'Remove'}</span>
                        <Box
                          sx={{
                            width: 32,
                            height: 32,
                            borderRadius: 1.5,
                            bgcolor: 'rgba(252, 165, 165, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Box component="img" src="/cctv_analytics/icon.svg" alt="right" sx={{ width: 16, height: 16, display: 'block' }} />
                        </Box>
                      </Button>
                    </Box>
                  )}
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

const ClientDetections = () => {
  const { setUnfilteredCounts, typeFilter, setTypeFilter, setExportToExcel, setDownloadConsolidatedReport, setReportValidationError } = useDetectionCounts();
  const { user } = useAuth(); // Get user from context
  const theme = useTheme();
  // List view is keyboard-driven (↑↓ → ←) — irrelevant on touch, so force Grid below md.
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams] = useSearchParams();

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [images, setImages] = useState([]);
  const imagesRef = useRef(images);
  useEffect(() => { imagesRef.current = images; }, [images]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const loadingRef = useRef(true);
  useEffect(() => { loadingRef.current = loading; }, [loading]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [examFilter, setExamFilter] = useState(() => searchParams.get('exam_id') || '');
  const [exams, setExams] = useState([]);
  const [examShifts, setExamShifts] = useState([]);
  const [shiftFilter, setShiftFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [regionOptions, setRegionOptions] = useState([]);
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(() => {
    const dp = searchParams.get('date');
    if (dp && /^\d{2}-\d{2}-\d{4}$/.test(dp)) return dp;
    if (dp === 'all') return '';   // exam card for an exam not running today
    return todayDate;
  });
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [appliedStartTime, setAppliedStartTime] = useState('');
  const [appliedEndTime, setAppliedEndTime] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [listSelectedIndex, setListSelectedIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  // pendingRemovals: uids inside the 15s undo window — still rendered, but the
  //   card swaps its action area for the "Detection removed / Undo" UI.
  // confirmedRemoved: uids past the undo window — filtered out of the grid.
  // removalTimersRef: per-uid setTimeout handles so Undo can cancel them.
  const [pendingRemovals, setPendingRemovals] = useState(new Set());
  const [confirmedRemoved, setConfirmedRemoved] = useState(new Set());
  // Accepted detections leave this live list immediately (no undo window) —
  // they now live on the "Accepted Detections" page instead.
  const [confirmedAccepted, setConfirmedAccepted] = useState(new Set());
  const removalTimersRef = useRef(new Map());
  // Mirror of pendingRemovals readable from inside callbacks that close over
  // stale state — namely the socket handler, which can't depend on the Set
  // without re-subscribing every render.
  const pendingRemovalsRef = useRef(pendingRemovals);
  useEffect(() => { pendingRemovalsRef.current = pendingRemovals; }, [pendingRemovals]);

  // The paged view is anchored at one pushed detection's feed position:
  // pages 1, 2, 3… are pushes at-or-before it (server-side `until`), so they
  // stay stable while new pushes arrive. Anything after it waits in
  // `pendingRef` (key -> feed position) behind the "N new" pill; each click
  // steps the anchor forward by exactly one page. null = not anchored yet.
  const anchorRef = useRef(null);
  const pendingRef = useRef(new Map());
  // key -> when it was revealed (pill click or direct live placement). The
  // reveal fetch rebuilds every card from the server, so the NEW tag's start
  // time has to be carried over from here or revealed cards never get one.
  const revealedAtRef = useRef(new Map());
  const [pendingLiveCount, setPendingLiveCount] = useState(0);
  // Live socket events queued between batch applications (see LIVE_BATCH_MS).
  const incomingRef = useRef([]);
  const countsDeltaRef = useRef({});
  const batchTimerRef = useRef(null);
  const [listJumpKey, setListJumpKey] = useState(0);
  const selectedRef = useRef(null);
  // Toggle: OFF (default) = the original live-stream page — every new push
  // prepends immediately and the oldest falls off past rowsPerPage.
  // ON = the queued/anchored review mode (the "N new" pill, step-by-page).
  const [queuedMode, setQueuedMode] = useState(false);
  const queuedModeRef = useRef(queuedMode);
  useEffect(() => { queuedModeRef.current = queuedMode; }, [queuedMode]);
  const viewRef = useRef(view);
  const pageRef = useRef(page);
  const hoverRef = useRef(false);
  const scrolledRef = useRef(false);
  const [removingId, setRemovingId] = useState(null);
  const [acceptingId, setAcceptingId] = useState(null);
  const [keyboardHintShown, setKeyboardHintShown] = useState(false);

  const UNDO_WINDOW_MS = 15000;

  useEffect(() => {
    axios.get(`${API_BASE_1}/detections/regions`)
      .then((res) => setRegionOptions(Array.isArray(res?.data?.data) ? res.data.data : []))
      .catch((err) => console.error('Failed to load regions:', err));
  }, []);

  const fetchClientImages = useCallback(async (pg = 1, rpp = rowsPerPage) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: rpp });
      if (typeFilter.length > 0) params.append('type', typeFilter.join(','));
      if (sourceFilter) params.append('source', sourceFilter);
      if (dateFilter) params.append('date', parseDateForQuery(dateFilter));
      if (search.trim()) params.append('search', search.trim());
      if (appliedStartTime) params.append('start_time', appliedStartTime);
      if (appliedEndTime) params.append('end_time', appliedEndTime);
      if (examFilter) params.append('exam_id', examFilter);
      if (shiftFilter) params.append('shift_id', shiftFilter);
      if (regionFilter) params.append('region', regionFilter);
      
      // Pass user info for filtering via user_exam_assignments
      if (user?.role) params.append('user_role', user.role);
      if (user?.id) params.append('user_id', user.id);
      if (anchorRef.current) {
        params.append('until', anchorRef.current.ts);
        if (anchorRef.current.source) params.append('until_source', anchorRef.current.source);
        params.append('until_id', String(anchorRef.current.id));
      }

      console.log('[ClientDetections] Fetching with params:', Object.fromEntries(params));

      const res = await axios.get(`${API_BASE_1}/client-detections?${params}`);
      if (res.data.success) {
        const fetched = (res.data.data || []).map((item) => ({
          ...item,
          image_url: `${API_BASE_1}${item.image_url || item.imageUrl}`,
          newBadgeAt: revealedAtRef.current.get(item.uid || item.id),
        }));
        setImages(fetched);
        setTotal(res.data.total || 0);
        // First unanchored page-1 load: anchor at the newest push we were
        // shown, so later pages and the pill agree on where "new" starts.
        if (!anchorRef.current && pg === 1) {
          anchorRef.current = fetched.reduce((max, it) => {
            if (!it.pushed_at && !it.created_at) return max;
            const p = feedPosition(it);
            return !max || compareFeedPosition(p, max) > 0 ? p : max;
          }, null);
        }
        setCounts(res.data.counts || {});
        // Backend now returns counts for ALL types regardless of the type filter,
        // so we can drive the sidebar directly from this response.
        setUnfilteredCounts(res.data.counts || {});
      } else {
        setImages([]);
        setCounts({});
        setTotal(0);
      }
    } catch (err) {
      console.error('Failed to fetch client images:', err);
      setImages([]);
      setCounts({});
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, typeFilter, dateFilter, search, appliedStartTime, appliedEndTime, examFilter, shiftFilter, regionFilter, rowsPerPage, user?.role, user?.company_name]);

  // Load exams for filter dropdown
  useEffect(() => {
    const fetchExams = async () => {
      try {
        const res = await examsAPI.getAll({ is_active: true });
        if (res.data?.data) setExams(res.data.data);
      } catch (err) { console.error('Failed to fetch exams:', err); }
    };
    fetchExams();
  }, []);

  // Populate the dependent Shift filter from the selected exam — the exam list
  // (examsAPI.getAll) already embeds each exam's `examShifts`.
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

  // Fetch images when filters change. New filters = a new view: drop the old
  // anchor and backlog BEFORE fetching, so this request isn't bounded by the
  // previous view's anchor and re-anchors from its own results.
  useEffect(() => {
    anchorRef.current = null;
    pendingRef.current.clear();
    revealedAtRef.current = new Map();
    incomingRef.current = [];
    setPendingLiveCount(0);
    setPage(1);
    setListSelectedIndex(0);
    fetchClientImages(1, rowsPerPage);
  }, [fetchClientImages, rowsPerPage]);

  /* Consolidated client report — hits the new /report/download/client endpoint
     which filters detections to pushed_to_client=1 and adds a per-row Rejected
     column for remove_from_client=1. Wired into the Layout button via
     setDownloadConsolidatedReport so the button appears in the AppBar. */
  const handleDownloadClientReport = useCallback(async () => {
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
      const params = { exam_id: examFilter, date: parseDateForQuery(dateFilter) };
      if (shiftFilter) params.shift_id = shiftFilter;   // one shift -> that shift only; none -> all shifts (consolidated)
      if (typeFilter.length > 0) params.type = typeFilter.join(',');
      if (search.trim()) params.search = search.trim();
      if (appliedStartTime) params.start_time = appliedStartTime;
      if (appliedEndTime) params.end_time = appliedEndTime;

      const response = await reportAPI.downloadClientReport(params);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `client_report_${parseDateForQuery(dateFilter)}${shiftFilter ? `_shift${shiftFilter}` : '_all_shifts'}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download client report failed:', err);
      setReportValidationError('Failed to download report. Please try again.');
    }
  }, [examFilter, dateFilter, typeFilter, search, shiftFilter, appliedStartTime, appliedEndTime, setReportValidationError]);

  useEffect(() => {
    setDownloadConsolidatedReport(() => handleDownloadClientReport);
  }, [handleDownloadClientReport, setDownloadConsolidatedReport]);

  /* Client "Export detections" — mirrors the admin export but hits the
     company-scoped /client-detections endpoint. Exports the FULL filtered set
     (all pages, limit = total), not just the current "Images per page" slice. */
  const exportToExcel = useCallback(async () => {
    const buildParams = (limit) => {
      const params = new URLSearchParams({ page: 1, limit });
      if (typeFilter.length > 0) params.append('type', typeFilter.join(','));
      if (sourceFilter) params.append('source', sourceFilter);
      if (dateFilter) params.append('date', parseDateForQuery(dateFilter));
      if (search.trim()) params.append('search', search.trim());
      if (appliedStartTime) params.append('start_time', appliedStartTime);
      if (appliedEndTime) params.append('end_time', appliedEndTime);
      if (examFilter) params.append('exam_id', examFilter);
      if (shiftFilter) params.append('shift_id', shiftFilter);
      if (user?.role) params.append('user_role', user.role);
      if (user?.id) params.append('user_id', user.id);
      return params;
    };

    let exportItems = [];
    try {
      const exportTotal = total || 0;
      if (exportTotal > 0) {
        const res = await axios.get(`${API_BASE_1}/client-detections?${buildParams(exportTotal)}`);
        exportItems = Array.isArray(res.data?.data) ? res.data.data : [];
      }
    } catch (err) {
      console.error('Client export fetch failed:', err);
    }
    if (exportItems.length === 0) return;

    const TYPE_LABELS = {
      proximity: 'Close Proximity', crowd: 'Crowd Detection', crowd_five: 'Less Than 5 People In a Lab',
      crowd_zero: 'Zero Person', server: 'Server Room', intruder: 'Intruder',
      entry_exit: 'Entry/Exit', phone: 'Phone', blind_spot: 'Blind Spot', furniture: 'Improper Furniture', monitor_tamper: 'Monitor Tampering', crowd_five_invigilator: 'Crowd < 5 + Invigilator Static',
      invigilator: 'Invigilator', inversion: 'Camera Inversion', tamper: 'Camera Tampering',
    };

    const rows = exportItems.map((item) => {
      const rawDate = item.date || '';
      const formattedDate = rawDate.match(/^\d{4}-\d{2}-\d{2}$/)
        ? rawDate.split('-').reverse().join('-')
        : rawDate;

      const timeStr = (() => {
        const m = /,\s*(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i.exec(item.detected_at || '');
        if (!m) return item.detected_at || '-';
        let h = parseInt(m[1], 10);
        const min = m[2], sec = m[3], ampm = m[4].toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${min}:${sec}`;
      })();

      const imageUrl = item.image_url
        ? `http://www.examscctvmonitoring.com/cctv_dev${String(item.image_url).replace(/^\/+/, '/')}`
        : '';

      return {
        'Detection Type': TYPE_META[item.type]?.label || TYPE_LABELS[item.type] || item.type,
        'Center Name': item.centerName || item.centre_name || '-',
        'Camera Name': item.cameraName || item.camera_name || item.camera_id || '-',
        'Location': item.city || '-',
        'Device ID': item.deviceId || item.device_id || '-',
        'Camera No': item.cameraNo || item.camera_no || (item.chNo != null ? String(item.chNo) : '') || '-',
        'Date': formattedDate || '-',
        'Time': timeStr,
        'Timestamp': item.detected_at || '-',
        'City': item.city || '-',
        'Frame URL': imageUrl,
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 18 }, { wch: 40 }, { wch: 25 }, { wch: 20 }, { wch: 15 },
      { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 28 }, { wch: 20 },
      { wch: 80 },
    ];

    // "Frame URL" column (index 10): short "View" link to the full frame URL.
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: 10 });
      const url = rows[R - 1]['Frame URL'];
      if (url) {
        ws[cellAddr] = { v: 'View', t: 's', l: { Target: url, Tooltip: 'Click to open image' } };
      }
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detections');
    const dateStr = dateFilter || formatDateDDMMYYYY(new Date());
    XLSX.writeFile(wb, `cctv_detections_${dateStr}.xlsx`);
  }, [typeFilter, sourceFilter, dateFilter, search, appliedStartTime, appliedEndTime, examFilter, shiftFilter, user, total]);

  useEffect(() => {
    setExportToExcel(() => exportToExcel);
  }, [exportToExcel, setExportToExcel]);

  // Memoized filter function to check if an item matches current filters
  const matchesFilters = useCallback((item) => {
    // Search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      const cameraName = (item.cameraName || item.camera_name || item.camera_id || '').toLowerCase();
      const centerName = (item.centerName || item.centre_name || '').toLowerCase();
      const city = (item.city || '').toLowerCase();
      if (!cameraName.includes(searchLower) && !centerName.includes(searchLower) && !city.includes(searchLower)) {
        return false;
      }
    }

    // Type filter
    if (typeFilter.length > 0 && !typeFilter.includes(item.type)) {
      return false;
    }

    // Source filter
    if (sourceFilter && item.source !== sourceFilter) {
      return false;
    }

    // Date filter
    if (dateFilter) {
      const itemDate = item.date || (item.detected_at ? item.detected_at.split(',')[0] : '');
      const filterDateFormatted = formatDateDDMMYYYY(parseDDMMYYYYToDate(dateFilter));
      const filterDateISO = parseDateForQuery(dateFilter); // "YYYY-MM-DD" — matches item.date from socket payloads
      if (itemDate !== filterDateFormatted && itemDate !== dateFilter && itemDate !== filterDateISO) {
        return false;
      }
    }

    // Time range filter
    if (appliedStartTime || appliedEndTime) {
      const itemTimeSec = parseDetectedAtTime(item.detected_at);
      if (itemTimeSec !== null) {
        if (appliedStartTime) {
          const startSec = timeStringToSeconds(appliedStartTime);
          if (startSec !== null && itemTimeSec < startSec) return false;
        }
        if (appliedEndTime) {
          const endSec = timeStringToSeconds(appliedEndTime);
          if (endSec !== null && itemTimeSec > endSec) return false;
        }
      }
    }

    // Exam filter
    if (examFilter && item.exam_id !== examFilter && String(item.exam_id) !== String(examFilter)) {
      return false;
    }

    // Shift filter (backend already filters; this is a client-side safety net)
    if (shiftFilter && String(item.shift_id) !== String(shiftFilter)) {
      return false;
    }

    return true;
  }, [search, typeFilter, sourceFilter, dateFilter, appliedStartTime, appliedEndTime, examFilter, shiftFilter]);

  const isReviewing = useCallback(() => (
    Boolean(selectedRef.current)
    || viewRef.current === 'list'
    || pageRef.current !== 1
    || hoverRef.current
    || scrolledRef.current
  ), []);

  // "Reviewing" signals only decide whether a quiet trickle may land directly
  // on page 1. They never reveal the backlog on their own — that only
  // happens when the client clicks the pill.
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => {
    viewRef.current = (view === 'grid' || isMobile) ? 'grid' : 'list';
  }, [view, isMobile]);
  useEffect(() => { pageRef.current = page; }, [page]);

  useEffect(() => {
    const onScroll = () => { scrolledRef.current = window.scrollY > 200; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleFeedMouseEnter = () => { hoverRef.current = true; };
  const handleFeedMouseLeave = () => { hoverRef.current = false; };

  // Switching modes mid-session shouldn't leave a hybrid view (e.g. an old
  // anchor lingering under legacy mode) — clear queue state and reload page 1
  // fresh under whichever mode was just selected.
  const handleQueuedModeChange = (_, next) => {
    setQueuedMode(next);
    queuedModeRef.current = next;
    anchorRef.current = null;
    pendingRef.current.clear();
    revealedAtRef.current = new Map();
    setPendingLiveCount(0);
    setPage(1);
    setListSelectedIndex(0);
    fetchClientImages(1, rowsPerPage);
  };

  // Reveal the next page's worth of new pushes, oldest first: step the anchor
  // forward to exactly the rowsPerPage-th pending one and re-fetch page 1.
  // Those become page 1, the previous page 1 becomes page 2 (and so on), and
  // the rest stay behind the pill for the next click.
  const handleShowNewDetections = () => {
    const pendingOldestFirst = [...pendingRef.current.entries()]
      .sort((a, b) => compareFeedPosition(a[1], b[1]));
    const chunk = pendingOldestFirst.slice(0, rowsPerPage);
    if (chunk.length === 0) return;
    anchorRef.current = chunk[chunk.length - 1][1];
    chunk.forEach(([key]) => pendingRef.current.delete(key));
    setPendingLiveCount(pendingRef.current.size);
    const revealedAt = Date.now();
    revealedAtRef.current = new Map(chunk.map(([key]) => [key, revealedAt]));

    setPage(1);
    setListSelectedIndex(0);
    fetchClientImages(1, rowsPerPage);
    setListJumpKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Live events are filtered on arrival (pure, no state) and queued; the
  // queue is applied once per LIVE_BATCH_MS so a burst costs a few renders.

  const applyIncomingBatch = useCallback(() => {
    batchTimerRef.current = null;
    const batch = incomingRef.current;
    const delta = countsDeltaRef.current;
    incomingRef.current = [];
    countsDeltaRef.current = {};

    if (Object.keys(delta).length > 0) {
      const bump = (prev) => {
        const next = { ...prev };
        Object.entries(delta).forEach(([type, n]) => { next[type] = (next[type] || 0) + n; });
        return next;
      };
      setCounts(bump);
      setUnfilteredCounts(bump);
    }
    if (batch.length === 0) return;

    if (!queuedModeRef.current) {
      // Legacy live-stream behavior: every push merges straight onto the
      // page immediately, oldest cards fall off past rowsPerPage. No pill,
      // no anchor, no "reviewing" gate.
      setTotal((t) => t + batch.length);
      const seen = new Set(imagesRef.current.map((i) => i.uid || i.id).filter(Boolean));
      const fresh = [];
      for (const item of batch) {
        const key = item.uid || item.id;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        fresh.push(item);
      }
      if (fresh.length > 0) {
        const now = Date.now();
        const newestFirst = fresh.map((it) => ({ ...it, newBadgeAt: now })).reverse();
        setImages((prev) => [...newestFirst, ...prev].slice(0, rowsPerPage));
      }
      return;
    }

    // Split by the anchor: at-or-before it already belongs to the paged view
    // (pages 1..N); after it is "new" and waits behind the pill. Oldest first.
    const anchor = anchorRef.current;
    const pageKeys = new Set(imagesRef.current.map((i) => i.uid || i.id).filter(Boolean));
    const newer = [];
    let olderCount = 0;
    for (const item of batch) {
      const key = item.uid || item.id;
      if (!key || pageKeys.has(key) || pendingRef.current.has(key)) continue;
      const pos = feedPosition(item);
      if (anchor && compareFeedPosition(pos, anchor) <= 0) { olderCount += 1; continue; }
      newer.push({ item, key, pos });
    }
    newer.sort((a, b) => compareFeedPosition(a.pos, b.pos));

    // Idle on page 1 with room and nothing already queued: place the oldest
    // new ones straight onto the page (the quiet-trickle case — no click
    // needed) and move the anchor up to cover them. Everything else queues.
    // Not while a page load is in flight — its response would overwrite them.
    let placed = [];
    const room = rowsPerPage - imagesRef.current.length;
    if (!isReviewing() && !loadingRef.current && pendingRef.current.size === 0 && room > 0) {
      placed = newer.slice(0, room);
    }
    const queued = newer.slice(placed.length);

    if (placed.length > 0) {
      anchorRef.current = placed[placed.length - 1].pos;
      const now = Date.now();
      placed.forEach(({ key }) => revealedAtRef.current.set(key, now));
      const newestFirst = placed.map(({ item }) => ({ ...item, newBadgeAt: now })).reverse();
      setImages((prev) => [...newestFirst, ...prev]);
    }
    // Pagination total counts the anchored view only (what pages 1..N hold);
    // the pill counts everything past the anchor.
    if (placed.length + olderCount > 0) setTotal((t) => t + placed.length + olderCount);

    if (queued.length > 0) {
      queued.forEach(({ key, pos }) => pendingRef.current.set(key, pos));
      setPendingLiveCount(pendingRef.current.size);
    }
  }, [setUnfilteredCounts, isReviewing, rowsPerPage]);

  const applyIncomingBatchRef = useRef(applyIncomingBatch);
  useEffect(() => { applyIncomingBatchRef.current = applyIncomingBatch; }, [applyIncomingBatch]);
  useEffect(() => () => clearTimeout(batchTimerRef.current), []);

  // Handle live socket updates for client detections
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;

    const handleNewClientDetection = (item) => {
      // NOTE: sidebar / header pill counter bumps are handled centrally in
      // SocketContext (one place, always mounted). Here we only update the
      // page-local data list and the page-local per-type chip count.

      // Filter by typeFilter FIRST before processing the data list
      if (typeFilter.length > 0 && !typeFilter.includes(item.type)) {
        return;
      }

      // The socket broadcasts every push to every connection; only keep
      // detections from exams this user can see (the REST feed is scoped server-side).
      if (user?.role !== 'ADMIN' && exams.length > 0 && item.exam_id != null
        && !exams.some((e) => String(e.id) === String(item.exam_id))) {
        return;
      }

      // Process URL if missing base
      const processedItem = {
        ...item,
        image_url: item.image_url?.startsWith('http') ? item.image_url : `${API_BASE_1}${item.image_url || item.imageUrl}`,
        updatedAt: item.updatedAt || item.updated_at || Date.now(),
      };

      if (!matchesFilters(processedItem)) return;

      if (item?.type) {
        countsDeltaRef.current[item.type] = (countsDeltaRef.current[item.type] || 0) + 1;
      }
      incomingRef.current.push(processedItem);

      if (!batchTimerRef.current) {
        batchTimerRef.current = setTimeout(() => applyIncomingBatchRef.current(), LIVE_BATCH_MS);
      }
    };

    const handleClientDetectionRemove = (data) => {
      console.log('[ClientDetections] Detection removed:', data.uid);

      // If this client is mid-undo-window for the same uid, ignore the socket
      // echo — handleRemove already owns the lifecycle and the post-15s timer
      // will do the final purge. Otherwise (another tab / another user) drop
      // the card immediately. Read via ref so we don't have to re-subscribe
      // on every pendingRemovals change.
      if (pendingRemovalsRef.current.has(data.uid)) return;

      incomingRef.current = incomingRef.current.filter(i => i.uid !== data.uid);
      if (pendingRef.current.delete(data.uid)) setPendingLiveCount(pendingRef.current.size);

      const removedType = data?.type;
      if (removedType) {
        setCounts(prev => ({ ...prev, [removedType]: Math.max(0, (prev[removedType] || 0) - 1) }));
        setUnfilteredCounts(prev => ({ ...prev, [removedType]: Math.max(0, (prev[removedType] || 0) - 1) }));
      }
      setImages(prev => prev.filter(i => i.uid !== data.uid));
      setTotal(t => Math.max(0, t - 1));
    };

    socket.on('client-detection:new', handleNewClientDetection);
    socket.on('client-detection:remove', handleClientDetectionRemove);
    
    return () => {
      socket.off('client-detection:new', handleNewClientDetection);
      socket.off('client-detection:remove', handleClientDetectionRemove);
    };
  }, [socket, matchesFilters, typeFilter, user?.role, exams, setUnfilteredCounts]);

  // Memoize filtered images to prevent unnecessary recalculations.
  // pendingRemovals stay in the list (rendered as "Detection removed / Undo");
  // only confirmedRemoved are filtered out so the grid layout doesn't reflow
  // until the undo window closes.
  const filteredImages = useMemo(() => {
    return images.filter(item => !confirmedRemoved.has(item.uid) && !confirmedAccepted.has(item.uid));
  }, [images, confirmedRemoved, confirmedAccepted]);

  // Open card: position in the grid, so the card can step to the previous / next detection.
  const selectedIndex = useMemo(() => {
    if (!selected) return -1;
    const key = selected.uid || selected.filename || selected.image_url;
    return filteredImages.findIndex((d) => (d.uid || d.filename || d.image_url) === key);
  }, [selected, filteredImages]);
  // The open card shows the row as the list holds it now (Accept / Remove show straight away).
  const openItem = selectedIndex >= 0 ? filteredImages[selectedIndex] : selected;
  const navigateSelected = useCallback((i) => {
    const next = filteredImages[i];
    if (next) setSelected(next);
  }, [filteredImages]);
  // A detection that leaves the list while its card is open (removal confirmed, accepted into the
  // accepted list): move on to the one now in its place, or close the card when the list is empty.
  const lastOpenIndexRef = useRef(-1);
  useEffect(() => {
    if (!selected) { lastOpenIndexRef.current = -1; return; }
    if (selectedIndex >= 0) { lastOpenIndexRef.current = selectedIndex; return; }
    const was = lastOpenIndexRef.current;
    if (was < 0) return;
    lastOpenIndexRef.current = -1;
    const next = filteredImages[Math.min(was, filteredImages.length - 1)];
    setSelected(next || null);
  }, [selected, selectedIndex, filteredImages]);
  const neighbourUrls = selectedIndex < 0 ? [] : [filteredImages[selectedIndex - 1], filteredImages[selectedIndex + 1]]
    .filter(Boolean).map((d) => d.image_url);

  // Clear any in-flight removal timers on unmount so we don't setState on a
  // dead component after the user navigates away mid-undo-window.
  useEffect(() => {
    const timers = removalTimersRef.current;
    return () => { timers.forEach((id) => clearTimeout(id)); timers.clear(); };
  }, []);

  const handleRemove = async (item) => {
    if (!item || !item.uid) return;
    const uid = item.uid;
    setRemovingId(uid);
    // Optimistically mark as pending so the live "client-detection:remove"
    // socket echo (which fires for ALL clients, including the originator)
    // doesn't yank the card out from under the undo affordance.
    setPendingRemovals(prev => {
      const next = new Set(prev);
      next.add(uid);
      return next;
    });
    try {
      await axios.post(`${API_BASE_1}/client-detections/remove`, { uid });

      // Schedule the hard-removal commit. If the user clicks Undo before this
      // fires, handleUndo clears the timer and pulls the uid back out.
      const timerId = setTimeout(() => {
        removalTimersRef.current.delete(uid);
        setPendingRemovals(prev => {
          if (!prev.has(uid)) return prev;
          const next = new Set(prev);
          next.delete(uid);
          return next;
        });
        setConfirmedRemoved(prev => {
          const next = new Set(prev);
          next.add(uid);
          return next;
        });
      }, UNDO_WINDOW_MS);
      removalTimersRef.current.set(uid, timerId);
    } catch (err) {
      console.error(err);
      // Rollback optimistic pending state on API failure.
      setPendingRemovals(prev => {
        if (!prev.has(uid)) return prev;
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
      setSnackbar({
        open: true,
        message: 'Failed to remove image',
        severity: 'error'
      });
    } finally {
      setRemovingId(null);
    }
  };

  // Reverses a removal that's still inside the 15-second undo window.
  // Optimistically clears the pending state + cancels the commit timer; if
  // the server fails we surface a snackbar but leave the card visible so the
  // user isn't suddenly stuck with a stale "Removed" state.
  const handleUndo = async (item) => {
    if (!item || !item.uid) return;
    const uid = item.uid;
    const timerId = removalTimersRef.current.get(uid);
    if (timerId) {
      clearTimeout(timerId);
      removalTimersRef.current.delete(uid);
    }
    setPendingRemovals(prev => {
      if (!prev.has(uid)) return prev;
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
    try {
      await clientDetectionsAPI.undoRemove(uid);
    } catch (err) {
      console.error('Undo failed:', err);
      setSnackbar({
        open: true,
        message: 'Undo failed on server — refresh to see authoritative state',
        severity: 'error'
      });
    }
  };

  // Client "Accept": flags the detection accepted + triggers the SMS alert to
  // the observer number(s) mapped to its tc_code (handled on cctv_backend).
  // Optimistically marks the card accepted; reflects the SMS-sent badge when
  // the backend reports it delivered.
  const handleAccept = async (item) => {
    if (!item || !item.uid) return;
    if (isDetectionAccepted(item)) return;
    const uid = item.uid;
    setAcceptingId(uid);
    try {
      const res = await clientDetectionsAPI.accept(uid);
      const smsSent = !!res?.data?.sms_sent;
      setImages(prev => prev.map(i => (
        i.uid === uid
          ? { ...i, accepted: 1, accepted_by_client: 1, sms_sent: smsSent ? 1 : i.sms_sent }
          : i
      )));
      // Card leaves this live list right away — it now lives on the
      // "Accepted Detections" page instead of sitting here as a disabled badge.
      setConfirmedAccepted(prev => {
        const next = new Set(prev);
        next.add(uid);
        return next;
      });
      setSnackbar({
        open: true,
        message: smsSent
          ? 'Detection accepted — SMS alert sent to the observer'
          : 'Detection accepted',
        severity: 'success',
      });
    } catch (err) {
      console.error('Accept failed:', err);
      setSnackbar({
        open: true,
        message: 'Failed to accept detection. Please try again.',
        severity: 'error',
      });
    } finally {
      setAcceptingId(null);
    }
  };

  // Stable identities for memoized cards/list; always call the latest handler.
  const actionsRef = useRef({});
  actionsRef.current = { handleRemove, handleUndo, handleAccept };
  const onRemoveStable = useCallback((item) => actionsRef.current.handleRemove(item), []);
  const onUndoStable = useCallback((item) => actionsRef.current.handleUndo(item), []);
  const onAcceptStable = useCallback((item) => actionsRef.current.handleAccept(item), []);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>

      {/* ── Filter Bar ── */}
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
          sx={{ width: { xs: '100%', sm: 'auto' }, flex: { sm: 1 }, minWidth: { sm: 200 }, maxWidth: { sm: 400 } }}
        />
        {/* Exam Filter */}
        <FormControl size="small" sx={{ width: { xs: (examFilter && examShifts.length > 0) ? 'calc(30% - 8px)' : 'calc(50% - 6px)', sm: 160 } }}>
          <Select
            value={examFilter}
            displayEmpty
            onChange={async (e) => {
              const id = e.target.value;
              // Set exam + date together (one fetch, never an empty in-between view).
              const date = id ? await resolveExamDate(exams.find((x) => String(x.id) === String(id))) : dateFilter;
              setExamFilter(id);
              setDateFilter(date);
              setPage(1);
            }}
            sx={{ borderRadius: '8px', bgcolor: '#f8fafc', height: 36, fontSize: 14, '& fieldset': { border: 'none' } }}
          >
            <MenuItem value="">All Exams</MenuItem>
            {exams.map((exam) => (
              <MenuItem key={exam.id} value={exam.id}>{exam.exam_name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {/* Shift Filter — dependent on the selected exam */}
        {examFilter && examShifts.length > 0 && (
          <FormControl size="small" sx={{ width: { xs: 'calc(30% - 8px)', sm: 130 } }}>
            <Select
              value={shiftFilter}
              displayEmpty
              onChange={(e) => { setShiftFilter(e.target.value); setPage(1); }}
              sx={{ borderRadius: '8px', bgcolor: '#f8fafc', height: 36, fontSize: 14, '& fieldset': { border: 'none' } }}
            >
              <MenuItem value="">All Shifts</MenuItem>
              {examShifts.map((sh) => (
                <MenuItem key={sh.id} value={sh.id}>{sh.shift_name || `Shift #${sh.id}`}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        {/* Region Filter — RTSP cameras only */}
        {regionOptions.length > 0 && (
          <FormControl size="small" sx={{ width: { xs: 'calc(30% - 8px)', sm: 130 } }}>
            <Select
              value={regionFilter}
              displayEmpty
              onChange={(e) => { setRegionFilter(e.target.value); setPage(1); }}
              sx={{ borderRadius: '8px', bgcolor: '#f8fafc', height: 36, fontSize: 14, '& fieldset': { border: 'none' } }}
            >
              <MenuItem value="">All Regions</MenuItem>
              {regionOptions.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <Box sx={{ position: 'relative', width: { xs: (examFilter && examShifts.length > 0) ? 'calc(40% - 8px)' : 'calc(50% - 6px)', sm: 150 } }}>
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
              fetchClientImages(newPage + 1, rowsPerPage);
            }}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              const newLimit = parseInt(e.target.value, 10);
              setRowsPerPage(newLimit);
              setPage(1);
              fetchClientImages(1, newLimit);
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
              '.MuiTablePagination-selectLabel': { display: { xs: 'none', sm: 'block' } },
              '.MuiTablePagination-input': { display: { xs: 'none', sm: 'inline-flex' } },
              borderBottom: 'none'
            }}
          />

          <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, alignItems: 'center', flexShrink: 0 }}>
            {(typeFilter.length > 0 || dateFilter !== todayDate || search || sourceFilter || startTime || endTime || shiftFilter) && (
              <Button
                size="small"
                onClick={() => { setTypeFilter([]); setDateFilter(todayDate); setSearch(''); setSourceFilter(''); setStartTime(''); setEndTime(''); setAppliedStartTime(''); setAppliedEndTime(''); setShiftFilter(''); }}
                sx={{ height: 36, borderRadius: '8px', fontSize: 13, textTransform: 'none', color: '#64748b', flexShrink: 0, minWidth: { xs: 48, sm: 56 }, px: { xs: 1, sm: 1.5 } }}
              >
                Clear
              </Button>
            )}

            <Button
              variant="contained"
              onClick={() => { setAppliedStartTime(startTime); setAppliedEndTime(endTime); }}
              disableElevation
              sx={{
                bgcolor: '#3c81f6',
                height: 36, borderRadius: '8px', fontSize: 13, fontWeight: 600, textTransform: 'none',
                px: { xs: 1.5, sm: 2.5 }, minWidth: { xs: 80, sm: 96 }, flexShrink: 0,
                '&:hover': { bgcolor: '#1e40af' }
              }}
            >
              Search
            </Button>
          </Box>
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
        <Box sx={{ ml: 'auto', display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1.5 }}>
          <ToggleButton
            size="small"
            value="queued"
            selected={queuedMode}
            onChange={() => handleQueuedModeChange(null, !queuedMode)}
            title={queuedMode
              ? 'Queued review mode: new pushes wait behind the "N new" pill.'
              : 'Live mode: new pushes appear immediately, oldest fall off the page.'}
            sx={{
              height: 36, borderRadius: '8px !important', textTransform: 'none', fontSize: 12, fontWeight: 600,
              px: 1.5, color: '#64748b', border: '1px solid #e2e8f0',
              '&.Mui-selected': { bgcolor: '#eff6ff', color: '#1e40af', borderColor: '#93c5fd', '&:hover': { bgcolor: '#dbeafe' } },
            }}
          >
            {queuedMode ? 'Queued review: ON' : 'Live mode'}
          </ToggleButton>
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_, v) => {
              if (v) {
                setView(v);
                if (v === 'list' && !keyboardHintShown) {
                  setSnackbar({
                    open: true,
                    message: '💡 Keyboard shortcuts: ↑↓ Navigate detections',
                    severity: 'info'
                  });
                  setKeyboardHintShown(true);
                }
              }
            }}
            size="small"
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

      {pendingLiveCount > 0 && (
        <Box sx={{ position: 'fixed', top: 76, left: 0, right: 0, zIndex: 1200, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <Chip
            icon={<ArrowUpward />}
            label={`${pendingLiveCount} new detection${pendingLiveCount > 1 ? 's' : ''}`}
            onClick={handleShowNewDetections}
            sx={{
              pointerEvents: 'auto', bgcolor: '#3c81f6', color: '#fff', fontWeight: 700,
              height: 36, px: 1, borderRadius: 18, boxShadow: '0 4px 14px rgba(15,23,42,0.25)',
              '& .MuiChip-icon': { color: '#fff' },
              '&:hover': { bgcolor: '#1e40af' },
            }}
          />
        </Box>
      )}

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
      ) : filteredImages.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <ImageNotSupported sx={{ fontSize: 60, color: '#94a3b8' }} />
          <Typography variant="h6" color="text.secondary" mt={1}>No client images found</Typography>
          <Typography variant="body2" color="text.secondary">
            Push selected detections from the admin page to populate this viewer
          </Typography>
        </Box>
      ) : (view === 'grid' || isMobile) ? (
        <Grid container spacing={2} onMouseEnter={handleFeedMouseEnter} onMouseLeave={handleFeedMouseLeave}>
          {filteredImages.map((item, i) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={item.uid || `${item.filename}-${i}`}>
              <MemoDetectionCard
                item={item}
                onClick={setSelected}
                onRemove={onRemoveStable}
                onUndo={onUndoStable}
                onAccept={onAcceptStable}
                isRemoving={removingId === item.uid}
                isPendingRemoval={pendingRemovals.has(item.uid)}
                isAccepting={acceptingId === item.uid}
                isAccepted={isDetectionAccepted(item)}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <MemoListViewPanel
          data={filteredImages}
          selectedIndex={listSelectedIndex}
          onSelect={setListSelectedIndex}
          onRemove={onRemoveStable}
          onUndo={onUndoStable}
          onAccept={onAcceptStable}
          removingId={removingId}
          pendingRemovals={pendingRemovals}
          acceptingId={acceptingId}
          jumpToTopKey={listJumpKey}
        />
      )}

      <Lightbox
        item={openItem}
        onClose={() => setSelected(null)}
        pendingLiveCount={pendingLiveCount}
        onAccept={onAcceptStable}
        onRemove={onRemoveStable}
        onUndo={onUndoStable}
        isAccepting={Boolean(openItem) && acceptingId === openItem.uid}
        isAccepted={Boolean(openItem) && isDetectionAccepted(openItem)}
        isRemoving={Boolean(openItem) && removingId === openItem.uid}
        isPendingRemoval={Boolean(openItem) && pendingRemovals.has(openItem.uid)}
        index={selectedIndex}
        count={filteredImages.length}
        onNavigate={navigateSelected}
        neighbourUrls={neighbourUrls}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ClientDetections;
