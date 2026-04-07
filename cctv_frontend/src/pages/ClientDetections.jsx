import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardMedia,
  CardContent,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  Dialog,
  DialogContent,
  IconButton,
  Tooltip,
  Skeleton,
  InputAdornment,
} from '@mui/material';
import {
  Refresh,
  CameraAlt,
  Search,
  FilterList,
  Event,
  LocationCity,
  AccessTime,
  Close,
  GridView,
  ViewList,
  Insights,
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
} from '@mui/icons-material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { enGB } from 'date-fns/locale';
import axios from 'axios';
import { io } from 'socket.io-client';
import { API_BASE_1, SOCKET_URL, SOCKET_PATH } from '../constants/data';

const TYPE_META = {
  proximity:   { label: 'Close Proximity',   color: '#f59e0b', bg: '#fef3c7' },
  crowd:       { label: 'Crowd Detection',    color: '#3b82f6', bg: '#dbeafe' },
  crowd_five:  { label: 'Crowd < 5',          color: '#2563eb', bg: '#dbeafe' },
  crowd_zero:  { label: 'Zero Person',        color: '#0f766e', bg: '#ccfbf1' },
  server:      { label: 'Server Room',        color: '#ef4444', bg: '#fee2e2' },
  intruder:    { label: 'Intruder',           color: '#8b5cf6', bg: '#ede9fe' },
  entry_exit:  { label: 'Entry/Exit',         color: '#10b981', bg: '#d1fae5' },
  phone:       { label: 'Phone',              color: '#6366f1', bg: '#e0e7ff' },
  blind_spot:  { label: 'Blind Spot',         color: '#7c3aed', bg: '#ede9fe' },
  invigilator: { label: 'Invigilator',        color: '#ec4899', bg: '#fce7f3' },
  inversion:   { label: 'Camera Inversion',   color: '#0ea5e9', bg: '#e0f2fe' },
  tamper:      { label: 'Camera Tampering',   color: '#dc2626', bg: '#fef2f2' },
};

const TYPE_ICONS = {
  proximity:   WarningAmber,
  crowd:       Groups,
  crowd_five:  Groups,
  crowd_zero:  PersonOff,
  server:      Dns,
  intruder:    DirectionsWalk,
  entry_exit:  MeetingRoom,
  phone:       Smartphone,
  blind_spot:  VisibilityOff,
  invigilator: Visibility,
  inversion:   FlipCameraAndroid,
  tamper:      SecurityUpdateWarning,
  default:     CameraAlt,
};

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'hls', label: 'HLS' },
  { value: 'rtsp', label: 'RTSP' },
];

const PAGE_SIZE = 200;

const formatDateDDMMYYYY = (dateInput) => {
  const date = typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ? new Date(dateInput)
    : new Date(dateInput);

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

const buildImageKey = (item) => `${item.source}|${item.type}|${item.relativePath}`;

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ typeKey, count, selected, onClick }) {
  const meta = TYPE_META[typeKey] || { label: typeKey, color: '#94a3b8', bg: '#f1f5f9' };
  const IconComp = TYPE_ICONS[meta.iconKey || typeKey] || TYPE_ICONS.default;
  return (
    <Card
      onClick={onClick}
      sx={{
        cursor: 'pointer',
        border: selected ? `2px solid ${meta.color}` : '2px solid transparent',
        background: selected ? meta.bg : '#fff',
        transition: 'all 0.2s',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
        borderRadius: 3,
      }}
    >
      <CardContent sx={{ textAlign: 'center', py: 2.2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 0.5 }}>
          <IconComp sx={{ fontSize: 30, color: meta.color }} />
        </Box>
        <Typography variant="h4" fontWeight={800} color={meta.color}>{count.toLocaleString()}</Typography>
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {meta.label}
        </Typography>
      </CardContent>
    </Card>
  );
}

// ─── Client Detection Card ────────────────────────────────────────────────────
function ClientDetectionCard({ item, onClick }) {
  const meta = TYPE_META[item.type] || { label: item.type, color: '#94a3b8', bg: '#f1f5f9' };
  const [imgError, setImgError] = useState(false);
  const cameraName = item.cameraName || item.camera_id || item.filename || '-';
  const centerName = item.centerName || item.centre_name || '-';
  const city = item.city || '-';
  const state = item.state || '-';
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
        '&:hover': { transform: 'translateY(-4px) scale(1.005)', boxShadow: '0 14px 30px rgba(15,23,42,0.14)' },
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
            alt={item.filename}
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
      <CardContent sx={{ p: 2, pb: '14px !important' }}>
        <Typography variant="h6" fontWeight={800} sx={{ color: '#1e293b', lineHeight: 1.25, mb: 1.5 }}>
          {centerName}
        </Typography>

        <Box sx={{ display: 'grid', gridTemplateColumns: '26px 1fr', rowGap: 1.1, columnGap: 1, alignItems: 'center' }}>
          <CameraAlt sx={{ fontSize: 16, color: '#64748b' }} />
          <Typography variant="body1" fontWeight={700} color="#334155">{cameraName}</Typography>

          <Event sx={{ fontSize: 16, color: '#64748b' }} />
          <Typography variant="body1" fontWeight={700} color="#334155">{examDate}</Typography>

          <AccessTime sx={{ fontSize: 16, color: '#64748b' }} />
          <Typography variant="body1" fontWeight={700} color="#334155">{item.detected_at || '-'}</Typography>

          <LocationCity sx={{ fontSize: 16, color: '#64748b' }} />
          <Typography variant="body1" fontWeight={700} color="#334155">{city}</Typography>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {item.cameraId || item.camera_id}
        </Typography>

        {state !== '-' && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {state}
          </Typography>
        )}

        {item.confidence != null && (
          <Typography variant="caption" color={meta.color} fontWeight={600} sx={{ display: 'block', mt: 0.5 }}>
            Conf: {(item.confidence * 100).toFixed(0)}%
          </Typography>
        )}

        {item.tcCode && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            TC: {item.tcCode}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
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
          alt={item.filename}
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
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>{item.cameraName || item.filename}</Typography>
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

// ─── Main Component ───────────────────────────────────────────────────────────
const ClientDetections = () => {
  const [images, setImages] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const fetchClientImages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: PAGE_SIZE });
      if (typeFilter) params.append('type', typeFilter);
      if (sourceFilter) params.append('source', sourceFilter);

      const res = await axios.get(`${API_BASE_1}/client-detections?${params}`);
      if (res.data.success) {
        setImages((res.data.data || []).map((item) => ({
          ...item,
        //   image_url: item.image_url || item.imageUrl,
        image_url: item.image_url
  ? `${window.location.origin}${item.image_url}`
  : item.imageUrl,
        })));
        setTotal(res.data.total || 0);
        setCounts(res.data.counts || {});
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
  }, [sourceFilter, typeFilter]);

  useEffect(() => {
    fetchClientImages();
  }, [fetchClientImages]);

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

    socket.on('client-detection:new', (item) => {
      const newItem = { ...item,
          image_url: item.image_url
      ? `${window.location.origin}${item.image_url}`
      : item.imageUrl, };
      setImages((prev) => {
        const key = buildImageKey(newItem);
        if (prev.some((existing) => buildImageKey(existing) === key)) {
          return prev;
        }
        return [newItem, ...prev].slice(0, PAGE_SIZE);
      });
      setTotal((prev) => prev + 1);
      setCounts((prev) => ({ ...prev, [item.type]: (prev[item.type] || 0) + 1 }));
    });

    return () => socket.disconnect();
  }, []);

  const matchesFilters = useCallback((item) => {
    if (typeFilter && item.type !== typeFilter) return false;
    if (sourceFilter && item.source !== sourceFilter) return false;
    if (dateFilter) {
      const normalized = parseDateForQuery(dateFilter);
      if (item.date && item.date !== normalized) return false;
      if (item.examDate && item.examDate !== dateFilter) return false;
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = [
        item.filename,
        item.type,
        item.source,
        item.cameraName,
        item.centerName,
        item.city,
        item.state,
        item.tcCode,
      ].filter(Boolean).join(' ').toLowerCase();

      if (!haystack.includes(q)) return false;
    }

    return true;
  }, [search, typeFilter, sourceFilter, dateFilter]);

  const filteredImages = useMemo(() => images.filter(matchesFilters), [images, matchesFilters]);
  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', fontFamily: 'Manrope, Segoe UI, sans-serif' }}>

      {/* ── Header ── */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight={800} color="#1e293b">Client Detection Images</Typography>
          <Typography variant="body2" color="text.secondary">
            {total.toLocaleString()} images pushed from detections
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            size="small"
            label={socketConnected ? 'Live connected' : 'Live disconnected'}
            color={socketConnected ? 'success' : 'default'}
            variant={socketConnected ? 'filled' : 'outlined'}
          />
          <Tooltip title="Refresh">
            <IconButton onClick={() => fetchClientImages()} color="primary" sx={{ bgcolor: '#ede9fe' }}>
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* ── Stat Cards ── */}
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={6} sm={4} md={2}>
            <Card
              onClick={() => setTypeFilter('')}
              sx={{
                cursor: 'pointer',
                border: !typeFilter ? '2px solid #667eea' : '2px solid transparent',
                background: !typeFilter ? 'linear-gradient(135deg, #667eea, #764ba2)' : '#fff',
                color: !typeFilter ? '#fff' : 'inherit',
                borderRadius: 3,
                transition: 'all 0.2s',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
              }}
            >
              <CardContent sx={{ textAlign: 'center', py: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', mb: 0.5 }}>
                  <Insights sx={{ fontSize: 30 }} />
                </Box>
                <Typography variant="h4" fontWeight={800}>{totalAll.toLocaleString()}</Typography>
                <Typography variant="caption" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.85 }}>
                  Total
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {Object.entries(TYPE_META).map(([key]) => (
            <Grid item xs={6} sm={4} md={2} key={key}>
              <StatCard
                typeKey={key}
                count={counts[key] || 0}
                selected={typeFilter === key}
                onClick={() => setTypeFilter(typeFilter === key ? '' : key)}
              />
            </Grid>
          ))}
        </Grid>
      </Box>

      {/* ── Filters ── */}
      <Card sx={{ p: 2, mb: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterList color="action" />
          <TextField
            size="medium"
            placeholder="Search camera, center, city or TC..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 240 }}
          />
          <FormControl size="medium" sx={{ minWidth: 140 }}>
            <InputLabel>Source</InputLabel>
            <Select value={sourceFilter} label="Source" onChange={(e) => setSourceFilter(e.target.value)}>
              {SOURCE_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="medium" sx={{ minWidth: 180 }}>
            <InputLabel>Detection Type</InputLabel>
            <Select value={typeFilter} label="Detection Type" onChange={(e) => setTypeFilter(e.target.value)}>
              <MenuItem value="">All Types</MenuItem>
              {Object.entries(TYPE_META).map(([k, m]) => (
                <MenuItem key={k} value={k}>{m.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
            <DatePicker
              label="Date"
              value={parseDDMMYYYYToDate(dateFilter)}
              onChange={(date) => setDateFilter(formatDateDDMMYYYY(date))}
              inputFormat="dd-MM-yyyy"
              mask="__-__-____"
              renderInput={(params) => (
                <TextField
                  {...params}
                  size="small"
                  placeholder="dd-mm-yyyy"
                  sx={{ minWidth: 150 }}
                />
              )}
            />
          </LocalizationProvider>
          {(typeFilter || dateFilter || search || sourceFilter) && (
            <Button size="medium" onClick={() => { setTypeFilter(''); setDateFilter(''); setSearch(''); setSourceFilter(''); }}>
              Clear Filters
            </Button>
          )}
          <Box sx={{ ml: 'auto' }}>
            <ToggleButtonGroup value={view} exclusive onChange={(_, v) => v && setView(v)} size="small">
              <ToggleButton value="grid" id="view-grid"><GridView /></ToggleButton>
              <ToggleButton value="list" id="view-list"><ViewList /></ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </Card>

      {/* ── Result count ── */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Showing {filteredImages.length} of {total.toLocaleString()} results
      </Typography>

      {/* ── Grid / List ── */}
      {loading ? (
        <Grid container spacing={2}>
          {[...Array(12)].map((_, i) => (
            <Grid item xs={12} sm={6} md={view === 'list' ? 12 : 3} key={i}>
              <Skeleton variant="rounded" height={view === 'list' ? 120 : 260} sx={{ borderRadius: 3 }} />
            </Grid>
          ))}
        </Grid>
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
            <Grid item xs={12} sm={6} md={3} key={`${item.source}-${item.filename}-${i}`}>
              <ClientDetectionCard item={item} onClick={setSelected} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredImages.map((item, i) => (
            <ClientDetectionCard key={`${item.source}-${item.filename}-${i}`} item={item} onClick={setSelected} />
          ))}
        </Box>
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
