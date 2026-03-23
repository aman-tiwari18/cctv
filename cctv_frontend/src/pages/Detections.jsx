import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Card, CardMedia, CardContent, Typography, Chip,
  TextField, Select, MenuItem, FormControl, InputLabel,
  ToggleButtonGroup, ToggleButton, Pagination, CircularProgress,
  Dialog, DialogContent, IconButton, Skeleton, Badge,
  InputAdornment, Button, Tooltip, Snackbar, Alert,
} from '@mui/material';
import {
  GridView, ViewList, Search, Close, CameraAlt,
  AccessTime, Warning, Person, FilterList, Refresh,
} from '@mui/icons-material';
import axios from 'axios';
import { io } from 'socket.io-client';
import { API_BASE_1, IMG_BASE } from '../constants/data';


const TYPE_META = {
  proximity: { label: 'Close Proximity', color: '#f59e0b', bg: '#fef3c7', icon: '⚠️' },
  crowd: { label: 'Crowd Detection', color: '#3b82f6', bg: '#dbeafe', icon: '👥' },
  server: { label: 'Server Room', color: '#ef4444', bg: '#fee2e2', icon: '🖥️' },
  intruder: { label: 'Intruder', color: '#8b5cf6', bg: '#ede9fe', icon: '🚨' },
  entry_exit: { label: 'Entry/Exit', color: '#10b981', bg: '#d1fae5', icon: '🚪' },
  phone: { label: 'Phone', color: '#6366f1', bg: '#e0e7ff', icon: '📱' },
  invigilator: { label: 'Invigilator', color: '#ec4899', bg: '#fce7f3', icon: '👁️' },
};

const PAGE_SIZE = 50;
const socketBase = (() => {
  try {
    return new URL(API_BASE_1);
  } catch {
    return new URL(window.location.origin);
  }
})();
const SOCKET_URL = socketBase.origin;
const SOCKET_PATH = `${socketBase.pathname.replace(/\/$/, '') || ''}/socket.io`;

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ typeKey, count, selected, onClick }) {
  const meta = TYPE_META[typeKey] || { label: typeKey, color: '#94a3b8', bg: '#f1f5f9', icon: '📷' };
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
      <CardContent sx={{ textAlign: 'center', py: 2 }}>
        <Typography fontSize={28}>{meta.icon}</Typography>
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

  return (
    <Card
      onClick={() => onClick(item)}
      sx={{
        cursor: 'pointer',
        borderRadius: 3,
        overflow: 'hidden',
        transition: 'all 0.2s',
        '&:hover': { transform: 'translateY(-3px)', boxShadow: 6 },
        border: '1px solid #e2e8f0',
      }}
    >
      <Box sx={{ position: 'relative', bgcolor: '#0f172a' }}>
        {imgError ? (
          <Box sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#1e293b' }}>
            <CameraAlt sx={{ fontSize: 48, color: '#475569' }} />
          </Box>
        ) : (
          <CardMedia
            component="img"
            height={180}
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
        {item.count != null && (
          <Chip
            icon={<Warning sx={{ fontSize: 12, color: '#fff !important' }} />}
            label={item.type === 'proximity' ? `${item.count} violation${item.count > 1 ? 's' : ''}` : `${item.count} person${item.count > 1 ? 's' : ''}`}
            size="small"
            sx={{
              position: 'absolute', top: 8, left: 8,
              bgcolor: 'rgba(0,0,0,0.65)', color: '#fff',
              fontSize: '0.65rem',
            }}
          />
        )}
      </Box>
      <CardContent sx={{ p: 1.5, pb: '12px !important' }}>
        <Typography variant="subtitle2" fontWeight={700} noWrap title={item.camera_id}>
          {item.camera_id}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          <AccessTime sx={{ fontSize: 12, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">{item.detected_at}</Typography>
        </Box>
        {item.confidence != null && (
          <Typography variant="caption" color={meta.color} fontWeight={600}>
            Conf: {(item.confidence * 100).toFixed(0)}%
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
            {item.count != null && <Chip label={`Count: ${item.count}`} size="small" sx={{ bgcolor: '#334155', color: '#fff' }} />}
            {item.confidence != null && <Chip label={`Confidence: ${(item.confidence * 100).toFixed(1)}%`} size="small" sx={{ bgcolor: '#334155', color: '#fff' }} />}
          </Box>
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>{item.camera_id}</Typography>
          <Typography variant="body2" color="#94a3b8">{item.detected_at}</Typography>
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
    if (search.trim() && !item.camera_id.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  }, [typeFilter, dateFilter, search]);

  useEffect(() => {
    setPage(1);
    fetchDetections(1);
  }, [fetchDetections]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      path: SOCKET_PATH,
      transports: ['polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      setSocketConnected(true);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    socket.on('detection:new', (item) => {
      setLiveAlert(item);

      if (!matchesFilters(item)) {
        return;
      }

      setTotal((prev) => prev + 1);
      setCounts((prev) => ({
        ...prev,
        [item.type]: (prev[item.type] || 0) + 1,
      }));

      if (page === 1) {
        setData((prev) => [item, ...prev].slice(0, PAGE_SIZE));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [matchesFilters, page]);

  const handlePageChange = (_, pg) => {
    setPage(pg);
    fetchDetections(pg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc' }}>
      {/* Header */}
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

      {/* Stat Cards */}
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2}>
          {/* Total card */}
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
                <Typography fontSize={28}>📊</Typography>
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

      {/* Filters */}
      <Card sx={{ p: 2, mb: 3, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <FilterList color="action" />
          <TextField
            size="small"
            placeholder="Search camera ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
            sx={{ minWidth: 220 }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Detection Type</InputLabel>
            <Select value={typeFilter} label="Detection Type" onChange={e => setTypeFilter(e.target.value)}>
              <MenuItem value="">All Types</MenuItem>
              {Object.entries(TYPE_META).map(([k, m]) => (
                <MenuItem key={k} value={k}>{m.icon} {m.label}</MenuItem>
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

      {/* Count */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Showing {data.length} of {total.toLocaleString()} results (Page {page} of {Math.ceil(total / PAGE_SIZE)})
      </Typography>

      {/* Grid / List */}
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
          <Typography fontSize={64}>📂</Typography>
          <Typography variant="h6" color="text.secondary" mt={1}>No detections found</Typography>
          <Typography variant="body2" color="text.secondary">Try changing your filters or run a script to generate detections</Typography>
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
            const meta = TYPE_META[item.type] || {};
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
                    sx={{ width: 80, height: 56, objectFit: 'cover', borderRadius: 1.5, bgcolor: '#1e293b', flexShrink: 0 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" fontWeight={700} noWrap>{item.camera_id}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.detected_at}</Typography>
                  </Box>
                  <Chip label={meta.label} size="small" sx={{ bgcolor: meta.color, color: '#fff', fontWeight: 700, fontSize: '0.65rem' }} />
                  {item.count != null && (
                    <Chip icon={<Person sx={{ fontSize: 12 }} />} label={item.count} size="small" variant="outlined" />
                  )}
                  {item.confidence != null && (
                    <Typography variant="caption" color={meta.color} fontWeight={600} sx={{ minWidth: 50, textAlign: 'right' }}>
                      {(item.confidence * 100).toFixed(0)}%
                    </Typography>
                  )}
                </Box>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Pagination */}
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

      {/* Lightbox */}
      <Lightbox item={selected} onClose={() => setSelected(null)} />

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
            if (liveAlert) {
              setSelected(liveAlert);
              setLiveAlert(null);
            }
          }}
        >
          {liveAlert ? `New ${TYPE_META[liveAlert.type]?.label || liveAlert.type} alert from ${liveAlert.camera_id}` : ''}
        </Alert>
      </Snackbar>
    </Box>
  );
}
