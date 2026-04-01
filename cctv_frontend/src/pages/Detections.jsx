import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardMedia, CardContent, Typography, Chip,
  TextField, Select, MenuItem, FormControl, InputLabel,
  ToggleButtonGroup, ToggleButton, Pagination,
  Dialog, DialogContent, IconButton, Skeleton,
  InputAdornment, Button, Tooltip, Snackbar, Alert,
} from '@mui/material';
import {
  GridView, ViewList, Search, Close, CameraAlt,
  AccessTime, Warning, Person, FilterList, Refresh, Event, LocationCity,
  Groups, Dns, DirectionsWalk, MeetingRoom, Smartphone, Visibility,
  WarningAmber, Insights, ImageNotSupported, FlipCameraAndroid, SecurityUpdateWarning,
  VisibilityOff, PersonOff,
} from '@mui/icons-material';
import axios from 'axios';
import { io } from 'socket.io-client';
import { API_BASE_1, IMG_BASE, SOCKET_URL, SOCKET_PATH } from '../constants/data';


const TYPE_META = {
  proximity:   { label: 'Close Proximity',   color: '#f59e0b', bg: '#fef3c7', iconKey: 'proximity' },
  crowd:       { label: 'Crowd Detection',    color: '#3b82f6', bg: '#dbeafe', iconKey: 'crowd' },
  crowd_five:  { label: 'Crowd < 5',          color: '#2563eb', bg: '#dbeafe', iconKey: 'crowd_five' },
  crowd_zero:  { label: 'Zero Person',        color: '#0f766e', bg: '#ccfbf1', iconKey: 'crowd_zero' },
  server:      { label: 'Server Room',        color: '#ef4444', bg: '#fee2e2', iconKey: 'server' },
  intruder:    { label: 'Intruder',           color: '#8b5cf6', bg: '#ede9fe', iconKey: 'intruder' },
  entry_exit:  { label: 'Entry/Exit',         color: '#10b981', bg: '#d1fae5', iconKey: 'entry_exit' },
  phone:       { label: 'Phone',              color: '#6366f1', bg: '#e0e7ff', iconKey: 'phone' },
  blind_spot:  { label: 'Blind Spot',         color: '#7c3aed', bg: '#ede9fe', iconKey: 'blind_spot' },
  invigilator: { label: 'Invigilator',        color: '#ec4899', bg: '#fce7f3', iconKey: 'invigilator' },
  inversion:   { label: 'Camera Inversion',   color: '#0ea5e9', bg: '#e0f2fe', iconKey: 'inversion' },
  tamper:      { label: 'Camera Tampering',   color: '#dc2626', bg: '#fef2f2', iconKey: 'tamper' },
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

const PAGE_SIZE = 50;

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ typeKey, count, selected, onClick }) {
  const meta = TYPE_META[typeKey] || { label: typeKey, color: '#94a3b8', bg: '#f1f5f9', iconKey: 'default' };
  const IconComp = TYPE_ICONS[meta.iconKey] || TYPE_ICONS.default;
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

// ─── Detection Card ───────────────────────────────────────────────────────────
function DetectionCard({ item, onClick }) {
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

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Detections() {
  const [data, setData] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [liveAlert, setLiveAlert] = useState(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const fetchDetections = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pg, limit: PAGE_SIZE });
      if (typeFilter) params.append('type', typeFilter);
      if (dateFilter) params.append('date', dateFilter);
      if (search.trim()) params.append('search', search.trim());

      const res = await axios.get(`${API_BASE_1}/detections?${params}`);
      if (res.data.success) {
        setData(res.data.data);
        setTotal(res.data.total);
        setCounts(res.data.counts || {});
      }
    } catch (err) {
      console.error('Failed to fetch detections:', err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, dateFilter, search]);

  const matchesFilters = useCallback((item) => {
    if (typeFilter && item.type !== typeFilter) return false;
    if (dateFilter && item.date !== dateFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const haystack = [
        item.camera_id,
        item.cameraId,
        item.cameraName,
        item.centerName,
        item.city,
        item.state,
        item.tcCode,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  }, [typeFilter, dateFilter, search]);

  useEffect(() => {
    setPage(1);
    fetchDetections(1);
  }, [fetchDetections]);

  useEffect(() => {
    // Backend root_path="/cctv_dev" + socketio_path="socket.io"
    // → full Socket.IO path must be /cctv_dev/socket.io
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

    socket.on('detection:new', (item) => {
      setLiveAlert(item);
      if (!matchesFilters(item)) return;

      setTotal((prev) => prev + 1);
      setCounts((prev) => ({ ...prev, [item.type]: (prev[item.type] || 0) + 1 }));

      if (page === 1) {
        setData((prev) => [item, ...prev].slice(0, PAGE_SIZE));
      }
    });

    return () => socket.disconnect();
  }, [matchesFilters, page]);

  const handlePageChange = (_, pg) => {
    setPage(pg);
    fetchDetections(pg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', fontFamily: 'Manrope, Segoe UI, sans-serif' }}>

      {/* ── Header ── */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" fontWeight={800} color="#1e293b">Detection Results</Typography>
          <Typography variant="body2" color="text.secondary">
            {total.toLocaleString()} detections across all cameras
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
            <IconButton onClick={() => fetchDetections(page)} color="primary" sx={{ bgcolor: '#ede9fe' }}>
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
            size="small"
            placeholder="Search camera, center, city or TC..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 240 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Detection Type</InputLabel>
            <Select value={typeFilter} label="Detection Type" onChange={e => setTypeFilter(e.target.value)}>
              <MenuItem value="">All Types</MenuItem>
              {Object.entries(TYPE_META).map(([k, m]) => (
                <MenuItem key={k} value={k}>{m.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            type="date"
            size="small"
            label="Date"
            InputLabelProps={{ shrink: true }}
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            sx={{ minWidth: 150 }}
          />
          {(typeFilter || dateFilter || search) && (
            <Button size="small" onClick={() => { setTypeFilter(''); setDateFilter(''); setSearch(''); }}>
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
        Showing {data.length} of {total.toLocaleString()} results (Page {page} of {Math.ceil(total / PAGE_SIZE) || 1})
      </Typography>

      {/* ── Grid / List ── */}
      {loading ? (
        <Grid container spacing={2}>
          {[...Array(12)].map((_, i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rounded" height={260} sx={{ borderRadius: 3 }} />
            </Grid>
          ))}
        </Grid>
      ) : data.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 10 }}>
          <ImageNotSupported sx={{ fontSize: 60, color: '#94a3b8' }} />
          <Typography variant="h6" color="text.secondary" mt={1}>No detections found</Typography>
          <Typography variant="body2" color="text.secondary">
            Try changing your filters or run a script to generate detections
          </Typography>
        </Box>
      ) : view === 'grid' ? (
        <Grid container spacing={2}>
          {data.map((item, i) => (
            <Grid item xs={12} sm={6} md={3} key={`${item.filename}-${i}`}>
              <DetectionCard item={item} onClick={setSelected} />
            </Grid>
          ))}
        </Grid>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {data.map((item, i) => {
            const meta = TYPE_META[item.type] || { label: item.type, color: '#94a3b8', bg: '#f1f5f9', iconKey: 'default' };
            const IconComp = TYPE_ICONS[meta.iconKey] || TYPE_ICONS.default;
            const centerName = item.centerName || item.centre_name || '-';
            const city = item.city || '-';
            const examDate = item.examDate || (item.date ? item.date.split('-').reverse().join('-') : '-');
            const invigilatorEventLabel = item.type === 'invigilator'
              ? (item.issueLabel || (item.issueType ? String(item.issueType).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : ''))
              : '';

            return (
              <Card
                key={`${item.filename}-${i}`}
                onClick={() => setSelected(item)}
                sx={{ cursor: 'pointer', borderRadius: 2, '&:hover': { boxShadow: 3 }, border: '1px solid #e2e8f0' }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5 }}>
                  <Box
                    component="img"
                    src={`${IMG_BASE}${item.image_url}`}
                    onError={e => { e.target.style.display = 'none'; }}
                    sx={{ width: 110, height: 74, objectFit: 'cover', borderRadius: 1.5, bgcolor: '#1e293b', flexShrink: 0 }}
                  />

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={800} noWrap color="#1e293b">
                      {centerName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {item.cameraName || item.camera_id}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1.5, mt: 0.4, flexWrap: 'wrap' }}>
                      <Typography variant="caption" color="text.secondary">📅 {examDate}</Typography>
                      <Typography variant="caption" color="text.secondary">🕐 {item.detected_at || '-'}</Typography>
                      <Typography variant="caption" color="text.secondary">📍 {city}</Typography>
                      {item.tcCode && (
                        <Typography variant="caption" color="text.secondary">TC: {item.tcCode}</Typography>
                      )}
                    </Box>
                  </Box>

                  <Chip
                    icon={<IconComp sx={{ fontSize: '14px !important', color: '#fff !important' }} />}
                    label={meta.label}
                    size="small"
                    sx={{ bgcolor: meta.color, color: '#fff', fontWeight: 700, fontSize: '0.65rem' }}
                  />

                  {invigilatorEventLabel && (
                    <Chip label={invigilatorEventLabel} size="small" sx={{ bgcolor: '#e2e8f0', color: '#0f172a', fontWeight: 700, fontSize: '0.65rem' }} />
                  )}

                  {item.count != null && (
                    <Chip icon={<Person sx={{ fontSize: 12 }} />} label={item.count} size="small" variant="outlined" />
                  )}

                  {item.confidence != null && (
                    <Typography variant="caption" color={meta.color} fontWeight={700} sx={{ minWidth: 44, textAlign: 'right' }}>
                      {(item.confidence * 100).toFixed(0)}%
                    </Typography>
                  )}
                </Box>
              </Card>
            );
          })}
        </Box>
      )}

      {/* ── Pagination ── */}
      {total > PAGE_SIZE && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Pagination
            count={Math.ceil(total / PAGE_SIZE)}
            page={page}
            onChange={handlePageChange}
            color="primary"
            size="large"
          />
        </Box>
      )}

      <Lightbox item={selected} onClose={() => setSelected(null)} />

      {/* ── Live alert snackbar ── */}
      <Snackbar
        open={Boolean(liveAlert)}
        autoHideDuration={5000}
        onClose={() => setLiveAlert(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setLiveAlert(null)}
          severity="warning"
          variant="filled"
          sx={{ width: '100%', cursor: liveAlert ? 'pointer' : 'default' }}
          onClick={() => {
            if (liveAlert) { setSelected(liveAlert); setLiveAlert(null); }
          }}
        >
          {liveAlert
            ? `New ${TYPE_META[liveAlert.type]?.label || liveAlert.type}${liveAlert.issueLabel ? ` (${liveAlert.issueLabel})` : ''} alert from ${liveAlert.cameraName || liveAlert.camera_id}`
            : ''}
        </Alert>
      </Snackbar>
    </Box>
  );
}