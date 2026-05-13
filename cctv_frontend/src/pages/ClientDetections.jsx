import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  ChevronLeft,
  ChevronRight,
  KeyboardArrowDown,
  Check,
  Warning,
  Close as CloseIcon,
  GridView, LocationCity, Close, Memory,
} from '@mui/icons-material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { enGB } from 'date-fns/locale';
import axios from 'axios';
import { API_BASE_1 } from '../constants/data';
import { useDetectionCounts } from '../contexts/DetectionCountsContext';
import { useSocket } from '../contexts/SocketContext';
import { useSearchParams } from 'react-router-dom';
import { examsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const TYPE_META = {
  proximity: { label: 'Close Proximity', color: '#5cb88a', bg: '#e5f5ed' },
  crowd: { label: 'Crowd Detection', color: '#e24d7b', bg: '#fce4ec' },
  crowd_five: { label: 'Crowd < 5', color: '#e06050', bg: '#fce8e6' },
  crowd_zero: { label: 'Zero Person', color: '#6b5b95', bg: '#edeaf3' },
  server: { label: 'Server Room', color: '#a0623d', bg: '#f3ebe4' },
  intruder: { label: 'Intruder', color: '#d94466', bg: '#fce4ea' },
  entry_exit: { label: 'Entry/Exit', color: '#1d7a7d', bg: '#e0f0f0' },
  phone: { label: 'Phone', color: '#465a38', bg: '#e8ece5' },
  blind_spot: { label: 'Blind Spot', color: '#b0a850', bg: '#f3f2e4' },
  invigilator: { label: 'Invigilator', color: '#00bfcf', bg: '#e0f7fa' },
  inversion: { label: 'Camera Inversion', color: '#7a86b4', bg: '#eceef5' },
  tamper: { label: 'Camera Tampering', color: '#00c8d4', bg: '#e0f8fa' },
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

const NewBadge = ({ addedAt, sx }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!addedAt) return;
    
    const rawTime = typeof addedAt === 'number' ? addedAt : new Date(addedAt).getTime();
    const parsedTime = rawTime < 10000000000 ? rawTime * 1000 : rawTime;
    if (isNaN(parsedTime)) return;
    
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

function DetectionCard({ item, onClick, onRemove, isRemoving, removed }) {
  const meta = TYPE_META[item.type] || { label: item.type, color: '#94a3b8', bg: '#f1f5f9' };
  const [imgError, setImgError] = useState(false);
  const cameraName = item.cameraName || item.camera_name || item.camera_id || '-';
  const centerName = item.centerName || item.centre_name || '-';
  const city = item.city || '-';
  const examDate = item.examDate || (item.date ? item.date.split('-').reverse().join('-') : '-');
  const invigilatorEventLabel = item.type === 'invigilator'
    ? (item.issueLabel || (item.issueType ? String(item.issueType).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''))
    : '';

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
            image={item.image_url}
            alt={item.camera_id}
            onError={() => setImgError(true)}
            sx={{ objectFit: 'cover' }}
          />
        )}
        <NewBadge
          addedAt={item.updatedAt || item.updated_at}
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
      <CardContent sx={{ p: 1, pb: '10px !important', mx: 2 }}>
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
              GPU {item.gpu_id} — {item.gpu_id === 0 ? 'Master' : `Worker ${item.gpu_id}`}
            </Typography>
          </Box>
        )}
      </CardContent>

      <Box sx={{ mx: 2, mb: 4, mt: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'end', gap: 1.5 }}>
          <Button
            variant="contained"
            disableElevation
            onClick={(e) => {
              e.stopPropagation();
              if (onRemove && !isRemoving && !removed) onRemove(item);
            }}
            disabled={isRemoving || removed}
            sx={{
              bgcolor: removed ? '#94a3b8' : '#ef4444',
              color: '#fff',
              fontWeight: 900,
              height: "40px",
              width: "120px",
              borderRadius: 3,
              textTransform: 'none',
              fontSize: 12,
              '&:hover': { bgcolor: removed ? '#94a3b8' : '#dc2626' },
            }}
          >
            {isRemoving ? 'Removing...' : (removed ? 'Removed' : 'Remove')}
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
          src={item.image_url}
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

function ListViewPanel({ data, selectedIndex, onSelect, onRemove, removingId, removedUids }) {
  const item = data[selectedIndex];
  const itemRefs = useRef([]); // ✅ ref array for each list item
  const removed = item ? removedUids.has(item.uid) : false;
  const isRemoving = item ? removingId === item.uid : false;

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

  return (
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 260px)', minHeight: 500 }}>
      <Box
        sx={{
          width: 300, flexShrink: 0, overflowY: 'auto',
          borderRight: '1px solid #e2e8f0', pr: 1,
          bgcolor: '#ffffff',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {data.map((listItem, idx) => {
          const isActive = idx === selectedIndex;
          const centerName = listItem.centerName || listItem.centre_name || '-';
          const cameraName = listItem.cameraName || listItem.camera_id || listItem.filename || '-';
          const city = listItem.city || '-';

          return (
            <Box
              key={`${listItem.filename}-${idx}`}
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
                  addedAt={listItem.updatedAt || listItem.updated_at}
                  sx={{ position: 'absolute', top: -4, left: -4, zIndex: 10, transform: 'scale(0.85)' }}
                />
                <Box
                  component="img"
                  src={listItem.image_url}
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

            <Box sx={{ display: 'flex', gap: 2.5, flex: 1, minHeight: 0 }}>
              <Box sx={{
                flex: 1, position: 'relative', borderRadius: 3, overflow: 'hidden',
                bgcolor: '#fff'
              }}>
                <Box
                  component="img"
                  src={item.image_url}
                  alt={item.filename}
                  sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </Box>

              <Box sx={{
                width: 360, flexShrink: 0,
                bgcolor: '#fff', borderRadius: 3, p: 2.5,
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
                      color={(TYPE_META[item.type] || {}).color}
                      fontWeight={500}
                    >
                      Conf: {(item.confidence * 100).toFixed(0)}%
                    </Typography>
                  )}
                </CardContent>

                <Box sx={{ mt: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
                    <Button
                      variant="contained"
                      disableElevation
                      onClick={() => {
                        if (onRemove && !isRemoving && !removed) onRemove(item);
                      }}
                      disabled={isRemoving || removed}
                      sx={{
                        bgcolor: removed ? '#94a3b8' : '#ef4444', color: '#fff', fontWeight: 900,
                        height: "40px",
                        width: "160px",
                        borderRadius: 2, textTransform: 'none', fontSize: 14,
                        '&:hover': { bgcolor: removed ? '#94a3b8' : '#dc2626' },
                      }}
                    >
                      {isRemoving ? 'Removing...' : (removed ? 'Removed' : 'Remove')}
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

const ClientDetections = () => {
  const { setUnfilteredCounts, typeFilter, setTypeFilter } = useDetectionCounts();
  const { user } = useAuth(); // Get user from context
  const [searchParams] = useSearchParams();

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [images, setImages] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [exams, setExams] = useState([]);
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFilter, setDateFilter] = useState(todayDate);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [appliedStartTime, setAppliedStartTime] = useState('');
  const [appliedEndTime, setAppliedEndTime] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [listSelectedIndex, setListSelectedIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [removedUids, setRemovedUids] = useState(new Set());
  const [removingId, setRemovingId] = useState(null);
  const [keyboardHintShown, setKeyboardHintShown] = useState(false);

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
      
      // Pass user info for filtering
      if (user?.role) params.append('user_role', user.role);
      if (user?.company_name) params.append('user_company', user.company_name);

      console.log('[ClientDetections] Fetching with params:', Object.fromEntries(params));

      const res = await axios.get(`${API_BASE_1}/client-detections?${params}`);
      if (res.data.success) {
        setImages((res.data.data || []).map((item) => ({
          ...item,
          image_url: `${API_BASE_1}${item.image_url || item.imageUrl}`,
        })));
        setTotal(res.data.total || 0);
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
  }, [sourceFilter, typeFilter, dateFilter, search, appliedStartTime, appliedEndTime, examFilter, rowsPerPage, user?.role, user?.company_name]);

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

  // Read exam_id from URL params on mount
  useEffect(() => {
    const examId = searchParams.get('exam_id');
    if (examId) setExamFilter(examId);
  }, [searchParams]);

  // Fetch images when filters change
  useEffect(() => {
    setPage(1);
    setListSelectedIndex(0);
    fetchClientImages(1, rowsPerPage);
  }, [fetchClientImages, rowsPerPage]);

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
      if (itemDate !== filterDateFormatted && itemDate !== dateFilter) {
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

    return true;
  }, [search, typeFilter, sourceFilter, dateFilter, appliedStartTime, appliedEndTime, examFilter]);

  // Handle live socket updates for client detections
  const { socket } = useSocket();
  useEffect(() => {
    if (!socket) return;

    const handleNewClientDetection = (item) => {
      console.log('[ClientDetections] New detection received:', item.type);

      // NOTE: sidebar / header pill counter bumps are handled centrally in
      // SocketContext (one place, always mounted). Here we only update the
      // page-local data list and the page-local per-type chip count.

      // Filter by typeFilter FIRST before processing the data list
      if (typeFilter.length > 0 && !typeFilter.includes(item.type)) {
        return;
      }

      // Process URL if missing base
      const processedItem = {
        ...item,
        image_url: item.image_url?.startsWith('http') ? item.image_url : `${API_BASE_1}${item.image_url || item.imageUrl}`,
        updatedAt: item.updatedAt || item.updated_at || Date.now(),
      };

      if (matchesFilters(processedItem)) {
        if (item?.type) {
          setCounts(prev => ({ ...prev, [item.type]: (prev[item.type] || 0) + 1 }));
          setUnfilteredCounts(prev => ({ ...prev, [item.type]: (prev[item.type] || 0) + 1 }));
        }
        setImages(prev => {
          const exists = prev.some(i => (i.uid || i.id) === (processedItem.uid || processedItem.id));
          if (exists) return prev;
          const next = [processedItem, ...prev];
          return next.slice(0, rowsPerPage);
        });
        setTotal(t => t + 1);
      }
    };

    const handleClientDetectionRemove = (data) => {
      console.log('[ClientDetections] Detection removed:', data.uid);

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
  }, [socket, matchesFilters, rowsPerPage, typeFilter]);

  // Memoize filtered images to prevent unnecessary recalculations
  const filteredImages = useMemo(() => {
    return images.filter(item => !removedUids.has(item.uid));
  }, [images, removedUids]);

  const handleRemove = async (item) => {
    if (!item || !item.uid) return;
    setRemovingId(item.uid);
    try {
      await axios.post(`${API_BASE_1}/client-detections/remove`, {
        uid: item.uid,
      });

      setRemovedUids((prev) => {
        const next = new Set(prev);
        next.add(item.uid);
        return next;
      });

      setSnackbar({
        open: true,
        message: 'Image removed from client detections',
        severity: 'success'
      });
    } catch (err) {
      console.error(err);
      setSnackbar({
        open: true,
        message: 'Failed to remove image',
        severity: 'error'
      });
    } finally {
      setRemovingId(null);
    }
  };

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
          sx={{ minWidth: 200, maxWidth: 400, flex: 1 }}
        />
        {/* Exam Filter */}
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel sx={{ fontSize: 13 }}>Exam</InputLabel>
          <Select
            value={examFilter}
            label="Exam"
            onChange={(e) => { setExamFilter(e.target.value); setPage(1); }}
            sx={{ borderRadius: '8px', bgcolor: '#f8fafc', height: 36, fontSize: 14, '& fieldset': { border: 'none' } }}
          >
            <MenuItem value=""><em>All Exams</em></MenuItem>
            {exams.map((exam) => (
              <MenuItem key={exam.id} value={exam.id}>{exam.exam_name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ position: 'relative', minWidth: 100, maxWidth: 150 }}>
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
          sx={{ width: 180 }}
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
          sx={{ width: 180 }}
        />

        <Box sx={{ ml: 'auto', display: 'flex', gap: 1.5, alignItems: 'center' }}>
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
              '.MuiTablePagination-toolbar': { minHeight: '36px !important', height: '36px !important', px: 1 },
              '.MuiTablePagination-selectLabel, .MuiTablePagination-select, .MuiTablePagination-displayedRows': { m: 0, fontSize: 13, color: '#334155' },
              '.MuiTablePagination-actions': { color: '#64748b' },
              borderBottom: 'none'
            }}
          />


          {(typeFilter.length > 0 || dateFilter !== todayDate || search || sourceFilter || startTime || endTime) && (
            <Button
              size="small"
              onClick={() => { setTypeFilter([]); setDateFilter(todayDate); setSearch(''); setSourceFilter(''); setStartTime(''); setEndTime(''); setAppliedStartTime(''); setAppliedEndTime(''); }}
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
      ) : view === 'grid' ? (
        <Grid container spacing={2}>
          {filteredImages.map((item, i) => (
            <Grid item xs={12} sm={6} md={3} key={`${item.filename}-${i}`}>
              <DetectionCard
                item={item}
                onClick={setSelected}
                onRemove={handleRemove}
                isRemoving={removingId === item.uid}
                removed={removedUids.has(item.uid)}
              />
            </Grid>
          ))}
        </Grid>
      ) : (
        <ListViewPanel
          data={filteredImages}
          selectedIndex={listSelectedIndex}
          onSelect={setListSelectedIndex}
          onRemove={handleRemove}
          removingId={removingId}
          removedUids={removedUids}
        />
      )}

      <Lightbox item={selected} onClose={() => setSelected(null)} />

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
