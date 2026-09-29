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
  Grid, CardMedia, CardContent, Dialog, DialogContent,
} from '@mui/material';
import {
  CameraAlt,
  Search,
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
  Warning,
  GridView, LocationCity, Close, Memory, ArrowBack, Event,
  EventSeat,
  DesktopAccessDisabled,
} from '@mui/icons-material';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE_1 } from '../constants/data';
import { useDetectionCounts } from '../contexts/DetectionCountsContext';
import { examsAPI, clientDetectionsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const TYPE_META = {
  proximity: { label: 'Close Proximity', color: '#5cb88a', bg: '#e5f5ed' },
  crowd: { label: 'Crowd Detection', color: '#e24d7b', bg: '#fce4ec' },
  crowd_five: { label: 'Less Than 5 People In a Lab', color: '#e06050', bg: '#fce8e6' },
  crowd_zero: { label: 'Zero Person', color: '#6b5b95', bg: '#edeaf3' },
  server: { label: 'Server Room', color: '#a0623d', bg: '#f3ebe4' },
  intruder: { label: 'Intruder', color: '#d94466', bg: '#fce4ea' },
  entry_exit: { label: 'Entry/Exit', color: '#1d7a7d', bg: '#e0f0f0' },
  phone: { label: 'Phone', color: '#465a38', bg: '#e8ece5' },
  blind_spot: { label: 'Blind Spot', color: '#b0a850', bg: '#f3f2e4' },
  furniture: { label: 'Improper Furniture', color: '#c2410c', bg: '#fff1e6' },
  monitor_tamper: { label: 'Monitor Tampering', color: '#6d28d9', bg: '#f3e8ff' },
  invigilator: { label: 'Invigilator', color: '#00bfcf', bg: '#e0f7fa' },
  inversion: { label: 'Camera Inversion', color: '#7a86b4', bg: '#eceef5' },
  tamper: { label: 'Camera Tampering', color: '#00c8d4', bg: '#e0f8fa' },
};

const getDetectionShiftName = (item = {}) => (
  item.shiftName
  || item.shift_name
  || item.shift?.shift_name
  || item.shift?.name
  || (item.shift_id ? `Shift #${item.shift_id}` : '-')
);

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
  furniture: EventSeat,
  monitor_tamper: DesktopAccessDisabled,
  invigilator: Visibility,
  inversion: FlipCameraAndroid,
  tamper: SecurityUpdateWarning,
  default: CameraAlt,
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

const todayDate = formatDateDDMMYYYY(new Date());

// Date filter to apply when an exam is picked: today while the exam is running,
// otherwise no date (all of that exam's days). Same rule as ClientDetections.
const dateFilterForExam = (exam) => {
  if (!exam?.start_date) return '';
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const start = String(exam.start_date).slice(0, 10);
  const end = String(exam.end_date || exam.start_date).slice(0, 10);
  return start <= todayIso && todayIso <= end ? todayDate : '';
};

// "Accepted" pill mirrors the Accept button from ClientDetections. The
// component intentionally has no click handler — this page is read-only.
const AcceptedBadge = ({ sx, fullWidth }) => (
  <Chip
    label="Accepted"
    size="small"
    sx={{
      bgcolor: '#16a34a',
      color: '#fff',
      fontWeight: 700,
      height: 40,
      borderRadius: 2,
      width: fullWidth ? 160 : 120,
      fontSize: 13,
      ...sx,
    }}
  />
);

function DetectionCard({ item, onClick }) {
  const meta = TYPE_META[item.type] || { label: item.type, color: '#94a3b8', bg: '#f1f5f9' };
  const [imgError, setImgError] = useState(false);
  const cameraName = item.cameraName || item.camera_name || item.camera_id || '-';
  const centerName = item.centerName || item.centre_name || '-';
  const city = item.city || '-';
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
      <Box sx={{ position: 'relative', bgcolor: '#f1f5f9' }}>
        {imgError ? (
          <Box sx={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#1e293b' }}>
            <CameraAlt sx={{ fontSize: 48, color: '#475569' }} />
          </Box>
        ) : (
          <CardMedia
            component="img"
            height={380}
            image={item.image_url}
            alt={item.camera_id}
            onError={() => setImgError(true)}
            sx={{ objectFit: 'contain', bgcolor: '#f1f5f9' }}
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

          <Event sx={{ fontSize: 14, color: '#777' }} />
          <Typography noWrap title={getDetectionShiftName(item)} sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
            Shift: {getDetectionShiftName(item)}
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
          <AcceptedBadge />
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
            <Chip label="Accepted" size="small" sx={{ bgcolor: '#16a34a', color: '#fff', fontWeight: 700 }} />
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

function ListViewPanel({ data, selectedIndex, onSelect }) {
  const item = data[selectedIndex];
  const itemRefs = useRef([]);

  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); onSelect(Math.max(0, selectedIndex - 1)); }
      if (e.key === 'ArrowDown') { e.preventDefault(); onSelect(Math.min(data.length - 1, selectedIndex + 1)); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIndex, data.length, onSelect]);

  useEffect(() => {
    const el = itemRefs.current[selectedIndex];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, height: { xs: 'auto', md: 'calc(100vh - 310px)' }, minHeight: { xs: 0, md: 500 } }}>
        <Box
          sx={{
            width: { xs: '100%', md: 300 }, flexShrink: 0, overflowY: 'auto',
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
            return (
              <Box
                key={`${listItem.filename}-${idx}`}
                ref={(el) => (itemRefs.current[idx] = el)}
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

              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2.5, flex: 1, minHeight: 0 }}>
                <Box sx={{
                  flex: 1, position: 'relative', borderRadius: 3, overflow: 'hidden',
                  minHeight: { xs: 240, md: 0 },
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
                  width: { xs: '100%', md: 360 }, flexShrink: 0,
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

                      <Event sx={{ fontSize: 14, color: '#777' }} />
                      <Typography noWrap title={getDetectionShiftName(item)} sx={{ fontSize: 14, lineHeight: 1.5, m: 0, color: '#777' }}>
                        Shift: {getDetectionShiftName(item)}
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
                        color={(TYPE_META[item.type] || {}).color}
                        fontWeight={500}
                      >
                        Conf: {(item.confidence * 100).toFixed(0)}%
                      </Typography>
                    )}
                  </CardContent>

                  <Box sx={{ mt: 2.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5 }}>
                      <AcceptedBadge fullWidth />
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
        <Box sx={{ color: '#1976d2', fontSize: 14, display: 'flex', alignItems: 'center' }}>💡</Box>
        <Typography sx={{ fontSize: 12, color: '#1565c0', fontWeight: 500 }}>
          <strong>Tip:</strong> Use ↑ and ↓ arrow keys to quickly review detections without using your mouse.
        </Typography>
      </Box>
    </Box>
  );
}

const AcceptedDetections = () => {
  const { setUnfilteredCounts, typeFilter, setTypeFilter } = useDetectionCounts();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

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
  const [shiftFilter, setShiftFilter] = useState('');
  const [examShifts, setExamShifts] = useState([]);
  const [dateFilter, setDateFilter] = useState(todayDate);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [appliedStartTime, setAppliedStartTime] = useState('');
  const [appliedEndTime, setAppliedEndTime] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });
  const [listSelectedIndex, setListSelectedIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [keyboardHintShown, setKeyboardHintShown] = useState(false);

  const fetchAcceptedImages = useCallback(async (pg = 1, rpp = rowsPerPage) => {
    setLoading(true);
    try {
      const params = { page: pg, limit: rpp };
      if (typeFilter.length > 0) params.type = typeFilter.join(',');
      if (dateFilter) params.date = parseDateForQuery(dateFilter);
      if (search.trim()) params.search = search.trim();
      if (appliedStartTime) params.start_time = appliedStartTime;
      if (appliedEndTime) params.end_time = appliedEndTime;
      if (examFilter) params.exam_id = examFilter;
      if (shiftFilter) params.shift_id = shiftFilter;

      const res = await clientDetectionsAPI.getAccepted(params);
      if (res.data?.success) {
        // Backend returns relative paths (e.g. /serve-detection-images/...) so
        // prefixing with API_BASE_1 (script-server origin) reaches the real
        // image. Full URLs are passed through untouched as a safety net.
        setImages((res.data.data || []).map((item) => ({
          ...item,
          image_url: item.image_url?.startsWith('http')
            ? item.image_url
            : `${API_BASE_1}${item.image_url || item.imageUrl || ''}`,
        })));
        setTotal(res.data.total || 0);
        setCounts(res.data.counts || {});
        setUnfilteredCounts(res.data.counts || {});
      } else {
        setImages([]);
        setCounts({});
        setTotal(0);
      }
    } catch (err) {
      console.error('Failed to fetch accepted detections:', err);
      setImages([]);
      setCounts({});
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [shiftFilter, typeFilter, dateFilter, search, appliedStartTime, appliedEndTime, examFilter, rowsPerPage, setUnfilteredCounts]);

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const res = await examsAPI.getAll({ is_active: true });
        if (res.data?.data) setExams(res.data.data);
      } catch (err) { console.error('Failed to fetch exams:', err); }
    };
    fetchExams();
  }, []);

  useEffect(() => {
    const examId = searchParams.get('exam_id');
    if (examId) setExamFilter(examId);
  }, [searchParams]);

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

  useEffect(() => {
    setPage(1);
    setListSelectedIndex(0);
    fetchAcceptedImages(1, rowsPerPage);
  }, [fetchAcceptedImages, rowsPerPage]);

  const filteredImages = images;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      {/* Header strip — title + back link to the live detections page */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <Button
          startIcon={<ArrowBack sx={{ fontSize: 16 }} />}
          onClick={() => navigate('/detections')}
          sx={{
            textTransform: 'none', color: '#475569', fontSize: 13,
            '&:hover': { bgcolor: '#f1f5f9' },
          }}
        >
          Back to Detections
        </Button>
        <Chip
          label="Accepted Detections"
          sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.75rem' }}
        />
      </Box>

      {/* ── Filter Bar ── */}
      <Box sx={{
        display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center',
        p: '8px 12px',
        borderRadius: '16px',
        bgcolor: '#ffffff',
        mb: 2,
      }}>
        <TextField
          size="small"
          placeholder="Search accepted detections..."
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

        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel sx={{ fontSize: 13 }}>Exam</InputLabel>
          <Select
            value={examFilter}
            label="Exam"
            onChange={(e) => {
              const id = e.target.value;
              setExamFilter(id);
              if (id) setDateFilter(dateFilterForExam(exams.find((x) => String(x.id) === String(id))));
              setPage(1);
            }}
            sx={{ borderRadius: '8px', bgcolor: '#f8fafc', height: 36, fontSize: 14, '& fieldset': { border: 'none' } }}
          >
            <MenuItem value=""><em>All Exams</em></MenuItem>
            {exams.map((exam) => (
              <MenuItem key={exam.id} value={exam.id}>{exam.exam_name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Shift filter — dependent on the selected exam (same as ClientDetections) */}
        {examFilter && examShifts.length > 0 && (
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel sx={{ fontSize: 13 }}>Shift</InputLabel>
            <Select
              value={shiftFilter}
              label="Shift"
              onChange={(e) => { setShiftFilter(e.target.value); setPage(1); }}
              sx={{ borderRadius: '8px', bgcolor: '#f8fafc', height: 36, fontSize: 14, '& fieldset': { border: 'none' } }}
            >
              <MenuItem value=""><em>All Shifts</em></MenuItem>
              {examShifts.map((sh) => (
                <MenuItem key={sh.id} value={sh.id}>{sh.shift_name || `Shift #${sh.id}`}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

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
            }
          }}
          sx={{ width: 180 }}
        />

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
              fetchAcceptedImages(newPage + 1, rowsPerPage);
            }}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              const newLimit = parseInt(e.target.value, 10);
              setRowsPerPage(newLimit);
              setPage(1);
              fetchAcceptedImages(1, newLimit);
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

          {(typeFilter.length > 0 || dateFilter !== todayDate || search || shiftFilter || startTime || endTime) && (
            <Button
              size="small"
              onClick={() => { setTypeFilter([]); setDateFilter(todayDate); setSearch(''); setShiftFilter(''); setStartTime(''); setEndTime(''); setAppliedStartTime(''); setAppliedEndTime(''); }}
              sx={{ height: 36, borderRadius: '8px', fontSize: 13, textTransform: 'none', color: '#64748b' }}
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
              height: 36, borderRadius: '8px', fontSize: 13, fontWeight: 600, textTransform: 'none', px: 2.5,
              '&:hover': { bgcolor: '#1e40af' }
            }}
          >
            Search
          </Button>
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
          <Typography variant="h6" color="text.secondary" mt={1}>No accepted detections found</Typography>
          <Typography variant="body2" color="text.secondary">
            Detections that the client has accepted will appear here
          </Typography>
        </Box>
      ) : view === 'grid' ? (
        <Grid container spacing={2}>
          {filteredImages.map((item, i) => (
            <Grid item xs={12} sm={6} key={`${item.filename}-${i}`}>
              <DetectionCard item={item} onClick={setSelected} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <ListViewPanel
          data={filteredImages}
          selectedIndex={listSelectedIndex}
          onSelect={setListSelectedIndex}
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

export default AcceptedDetections;
