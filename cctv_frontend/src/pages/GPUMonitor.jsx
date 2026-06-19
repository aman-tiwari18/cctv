import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  Tooltip,
  IconButton,
  Stack,
  Collapse,
  Avatar,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  FormControl,
  Select,
  MenuItem,
} from '@mui/material';
import {
  Memory,
  Speed,
  CheckCircle,
  Error as ErrorIcon,
  Refresh,
  Computer,
  VideoLibrary,
  ExpandLess,
  ExpandMore,
  Storage,
  Timeline,
  DeviceThermostat,
  KeyboardArrowRight,
  Add,
  Close,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from 'recharts';
import axios from 'axios';
import { API_BASE_1 } from '../constants/data';

const API_BASE_URL = API_BASE_1;
const PROM_BASE = `${API_BASE_1}/prometheus-api`;

const RANGE_PRESETS = {
  '15m': { seconds: 15 * 60, step: 15, stepStr: '15s' },
  '1h':  { seconds: 60 * 60, step: 30, stepStr: '30s' },
  '6h':  { seconds: 6 * 60 * 60, step: 120, stepStr: '2m' },
  '24h': { seconds: 24 * 60 * 60, step: 300, stepStr: '5m' },
};

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

// ── Dashboard design tokens (reused for visual consistency) ─────────────────
const CARD_SX = { bgcolor: '#fff', borderRadius: '8px', border: '1px solid #eef0f3', boxShadow: 'none' };
const COLOR = {
  value: '#2E68C9', accent: '#3c81f6', accentDark: '#1e40af',
  title: '#191B23', sub: '#303336', muted: '#5C5F61', faint: '#94A3B8',
  iconBoxBg: 'rgba(0, 74, 198, 0.10)', iconColor: '#004AC6',
  gridLine: '#e2e8f0',
};
const CHIP_TONES = {
  amber:  { bg: '#FFEEE0', text: '#5C5F61' },
  violet: { bg: '#dbeafe', text: '#5C5F61' },
};
const INTER = 'Inter, sans-serif';

// ── helpers ─────────────────────────────────────────────────────────────────
const utilColor = (u) => (u >= 80 ? '#ef4444' : u >= 60 ? '#f59e0b' : u >= 40 ? '#3b82f6' : '#10b981');
const tempColor = (t) => (t >= 80 ? '#ef4444' : t >= 70 ? '#f59e0b' : '#10b981');

const formatRuntime = (seconds) => {
  if (!seconds || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const formatMb = (mb) => {
  if (mb == null) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`;
  return `${mb}MB`;
};

const userColor = (username) => {
  if (!username) return '#94a3b8';
  let h = 0;
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

// ── Prometheus query hook ───────────────────────────────────────────────────
// Pivots Prometheus's matrix response into recharts-friendly rows:
//   [{ time: ms, value: number }, ...]
const usePromTimeseries = (query, rangeKey, enabled = true) => {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const preset = RANGE_PRESETS[rangeKey];

  useEffect(() => {
    if (!enabled || !query) {
      setData([]);
      return;
    }
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const end = Math.floor(Date.now() / 1000);
        const start = end - preset.seconds;
        const r = await axios.get(`${PROM_BASE}/query_range`, {
          params: { query, start, end, step: preset.stepStr },
          timeout: 6000,
        });
        if (!active) return;
        const series = r.data?.data?.result || [];
        // We expect a single series per query (already filtered by server_id+gpu_id).
        const points = series[0]?.values || [];
        const rows = points.map(([t, v]) => ({ time: t * 1000, value: parseFloat(v) }));
        setData(rows);
        setError(null);
      } catch (e) {
        if (!active) return;
        setError(e?.response?.data?.detail || e.message || 'Failed to load metrics');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    const id = setInterval(fetchData, 30000);
    return () => { active = false; clearInterval(id); };
  }, [query, rangeKey, enabled, preset.seconds, preset.stepStr]);

  return { data, error, loading, stepSec: preset.step };
};

// peak / avg / idle minutes (idle = samples where value < threshold)
const seriesStats = (data, stepSec, idleThreshold = 5) => {
  if (!data?.length) return { peak: 0, avg: 0, idleMin: 0, min: 0 };
  const vals = data.map((d) => d.value).filter((v) => Number.isFinite(v));
  if (!vals.length) return { peak: 0, avg: 0, idleMin: 0, min: 0 };
  const peak = Math.max(...vals);
  const min = Math.min(...vals);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const idleSamples = vals.filter((v) => v < idleThreshold).length;
  const idleMin = Math.round((idleSamples * stepSec) / 60);
  return { peak: Math.round(peak), avg: Math.round(avg), idleMin, min: Math.round(min) };
};

// ── chart components ────────────────────────────────────────────────────────
const tickTime = (ms) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const COMPACT_LABEL_SX = { fontFamily: INTER, fontWeight: 700, fontSize: 11, letterSpacing: '0.5px', color: COLOR.faint, textTransform: 'uppercase', mb: 0.5 };

const UtilizationChart = ({ serverId, gpuId, rangeKey, compact }) => {
  const query = `gpu_utilization_percent{server_id="${serverId}",gpu_id="${gpuId}"}`;
  const { data, error, loading, stepSec } = usePromTimeseries(query, rangeKey);
  const stats = useMemo(() => seriesStats(data, stepSec), [data, stepSec]);

  if (compact) {
    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
          <Typography sx={{ ...COMPACT_LABEL_SX, mb: 0 }}>GPU Utilization</Typography>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Stat label="Peak" value={`${stats.peak}%`} />
            <Stat label="Avg"  value={`${stats.avg}%`} />
            <Stat label="Idle" value={`${stats.idleMin}min`} />
          </Stack>
        </Box>
        <ChartBody data={data} loading={loading} error={error} color="#3b82f6" yDomain={[0, 100]} unit="%" compact />
      </Box>
    );
  }

  return (
    <Card elevation={0} sx={{ ...CARD_SX, height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: { xs: '15px', sm: '17px' }, color: COLOR.title }}>GPU Utilization</Typography>
            <Typography variant="caption" color="text.secondary">Last {rangeKey}</Typography>
          </Box>
          <Stack direction="row" spacing={2}>
            <Stat label="Peak" value={`${stats.peak}%`} />
            <Stat label="Avg"  value={`${stats.avg}%`} />
            <Stat label="Idle" value={`${stats.idleMin}min`} />
          </Stack>
        </Box>
        <ChartBody data={data} loading={loading} error={error} color="#3b82f6" yDomain={[0, 100]} unit="%" />
      </CardContent>
    </Card>
  );
};

const MemoryChart = ({ serverId, gpuId, memoryTotalMb, memoryUsedMb, rangeKey, compact }) => {
  const query = `gpu_memory_used_mb{server_id="${serverId}",gpu_id="${gpuId}"}`;
  const { data, error, loading, stepSec } = usePromTimeseries(query, rangeKey);
  const stats = useMemo(() => seriesStats(data, stepSec, 0), [data, stepSec]);
  const freeGb = memoryTotalMb && memoryUsedMb != null
    ? ((memoryTotalMb - memoryUsedMb) / 1024).toFixed(1) + 'GB'
    : '—';
  const peakGb = (stats.peak / 1024).toFixed(1) + 'GB';
  const avgGb  = (stats.avg / 1024).toFixed(1) + 'GB';

  if (compact) {
    return (
      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
          <Typography sx={{ ...COMPACT_LABEL_SX, mb: 0 }}>Memory / VRAM Usage</Typography>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap' }}>
            <Stat label="Peak" value={peakGb} />
            <Stat label="Avg"  value={avgGb} />
            <Stat label="Free" value={freeGb} />
          </Stack>
        </Box>
        <ChartBody data={data} loading={loading} error={error} color="#10b981" filled yDomain={[0, memoryTotalMb || 'auto']} unit="MB" formatY={(v) => `${Math.round(v / 1024)}`} compact />
      </Box>
    );
  }

  return (
    <Card elevation={0} sx={{ ...CARD_SX, height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, flexWrap: 'wrap', gap: 1 }}>
          <Box>
            <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: { xs: '15px', sm: '17px' }, color: COLOR.title }}>Memory / VRAM Usage</Typography>
            <Typography variant="caption" color="text.secondary">Memory allocation over time</Typography>
          </Box>
          <Stack direction="row" spacing={2}>
            <Stat label="Peak" value={peakGb} />
            <Stat label="Avg"  value={avgGb} />
            <Stat label="Free" value={freeGb} />
          </Stack>
        </Box>
        <ChartBody
          data={data} loading={loading} error={error}
          color="#10b981" filled
          yDomain={[0, memoryTotalMb || 'auto']}
          unit="MB"
          formatY={(v) => `${Math.round(v / 1024)}`}
        />
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value }) => (
  <Box sx={{ textAlign: 'right' }}>
    <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>{label}:</Typography>
    <Typography component="span" variant="caption" fontWeight={700} color="#0f172a">{value}</Typography>
  </Box>
);

const ChartBody = ({ data, loading, error, color, filled, yDomain, unit, formatY, compact, height }) => {
  const h = height || (compact ? 170 : 220);
  if (error) {
    return (
      <Box sx={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <Typography variant="caption" color="error" sx={{ mb: 1 }}>
          Prometheus unavailable
        </Typography>
        {!compact && (
          <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
            {error.slice(0, 100)}
          </Typography>
        )}
      </Box>
    );
  }
  if (loading && !data.length) {
    return <Box sx={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={24} /></Box>;
  }
  if (!data.length) {
    return <Box sx={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography variant="caption" color="text.secondary">No data in range</Typography>
    </Box>;
  }

  const ChartComp = filled ? AreaChart : LineChart;
  const SeriesComp = filled ? Area : Line;

  return (
    <Box sx={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartComp data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="time" tickFormatter={tickTime} stroke="#94a3b8" fontSize={11} />
          <YAxis
            domain={yDomain}
            tickFormatter={formatY}
            stroke="#94a3b8"
            fontSize={11}
            width={compact ? 28 : undefined}
          />
          <ChartTooltip
            labelFormatter={(ms) => new Date(ms).toLocaleString()}
            formatter={(v) => [`${v}${unit === '%' ? '%' : ' ' + unit}`, '']}
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
          />
          <SeriesComp
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={false}
            {...(filled ? { fill: color, fillOpacity: 0.15 } : {})}
          />
        </ChartComp>
      </ResponsiveContainer>
    </Box>
  );
};

// ── sidebar ─────────────────────────────────────────────────────────────────
// Small dashboard-styled select used for the (placeholder) sidebar filters.
const FilterSelect = ({ value, onChange, options }) => (
  <FormControl size="small" sx={{ flex: 1, minWidth: 0 }}>
    <Select
      value={value}
      onChange={onChange}
      sx={{
        borderRadius: '8px', bgcolor: '#f8fafc', height: 36, fontSize: 13, fontFamily: INTER,
        '& fieldset': { border: '1px solid #E5E7EB' },
        '&:hover fieldset': { borderColor: '#CBD5E1 !important' },
      }}
    >
      {options.map((o) => <MenuItem key={o} value={o} sx={{ fontSize: 13 }}>{o}</MenuItem>)}
    </Select>
  </FormControl>
);

const ServerGpuSidebar = ({ servers, selectedKey, onSelect, expanded, onToggle, compareMode = false, compareKeys = [], onAdd }) => {
  // Placeholder filters (visual only for now — wire to sort/filter later).
  const [sortBy, setSortBy] = useState('Utilization');
  const [nodeFilter, setNodeFilter] = useState('All Nodes');
  return (
    <Card elevation={0} sx={{ ...CARD_SX, height: { md: '100%' }, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexShrink: 0 }}>
          <FilterSelect value={sortBy} onChange={(e) => setSortBy(e.target.value)} options={['Utilization', 'Temperature', 'Memory']} />
          <FilterSelect value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)} options={['All Nodes', ...servers.map((s) => s.server_name)]} />
        </Stack>
        {/* Server list scrolls independently; filters above stay pinned */}
        <Box sx={{
          flex: 1, minHeight: 0, overflowY: 'auto', mx: -0.5, px: 0.5,
          scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent',
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { backgroundColor: '#cbd5e1', borderRadius: '3px' },
          '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
        }}>
        {servers.map((server) => {
          const isOpen = expanded[server.server_id] !== false;
          const isOnline = server.status === 'online';
          return (
            <Box key={server.server_id} sx={{ mb: 1 }}>
              <Box
                onClick={() => onToggle(server.server_id)}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  px: 1, py: 0.75, borderRadius: 1, cursor: 'pointer',
                  '&:hover': { bgcolor: '#f8fafc' },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Storage sx={{ fontSize: 16, color: COLOR.muted }} />
                  <Typography sx={{ fontFamily: INTER, fontWeight: 600, fontSize: 14, color: COLOR.title }}>{server.server_name}</Typography>
                </Box>
                {isOpen ? <ExpandLess sx={{ fontSize: 18, color: COLOR.faint }} /> : <ExpandMore sx={{ fontSize: 18, color: COLOR.faint }} />}
              </Box>
              <Collapse in={isOpen}>
                {!isOnline && (
                  /* Offline node → greyed placeholder card (like mockup's GPU 3) */
                  <Paper elevation={0} sx={{ p: 1.25, ml: 1.5, mt: 0.5, borderRadius: 1.5, border: '1px solid #e5e7eb', bgcolor: '#f1f5f9' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: 13, color: COLOR.faint }}>Offline</Typography>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#94a3b8' }} />
                    </Box>
                    <Typography sx={{ fontFamily: INTER, fontSize: 12, color: COLOR.faint, mt: 0.25 }}>
                      {server.error || 'Timeout'}
                    </Typography>
                  </Paper>
                )}
                {(server.data?.gpus || []).map((gpu) => {
                  const key = `${server.server_id}::${gpu.gpu_id}`;
                  const inGrid = compareKeys.includes(key);
                  const selected = compareMode ? inGrid : key === selectedKey;
                  const showAdd = compareMode && !inGrid;
                  return (
                    <Box key={key} sx={{ display: 'flex', alignItems: 'stretch', gap: 0.75, ml: 1.5, mt: 0.5 }}>
                      <Paper
                        elevation={0}
                        draggable={compareMode}
                        onDragStart={compareMode ? (e) => { e.dataTransfer.setData('text/plain', key); e.dataTransfer.effectAllowed = 'copy'; } : undefined}
                        onClick={() => (compareMode ? onAdd(key) : onSelect(key))}
                        sx={{
                          flex: 1, minWidth: 0, p: 1.25, cursor: compareMode ? 'grab' : 'pointer',
                          border: selected ? `2px solid ${COLOR.accent}` : '1px solid #e2e8f0',
                          borderRadius: 1.5,
                          '&:hover': { borderColor: selected ? COLOR.accent : '#cbd5e1' },
                        }}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: 14, color: selected ? COLOR.accent : COLOR.title }}>GPU {gpu.gpu_id}</Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography sx={{ fontFamily: INTER, fontSize: 12, color: COLOR.muted }}>{gpu.temperature}°C</Typography>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tempColor(gpu.temperature) }} />
                          </Box>
                        </Box>
                        <Typography sx={{ fontFamily: INTER, fontSize: 12, color: COLOR.muted, display: 'block' }}>
                          {gpu.name}
                        </Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                          <Typography sx={{ fontFamily: INTER, fontSize: 12, color: COLOR.muted }}>{gpu.utilization}% Util</Typography>
                          <Typography sx={{ fontFamily: INTER, fontSize: 12, color: COLOR.muted }}>
                            {gpu.memory_used > 1024 ? `${(gpu.memory_used / 1024).toFixed(0)}GB` : `${gpu.memory_used}MB`} Mem
                          </Typography>
                        </Box>
                      </Paper>
                      {showAdd && (
                        <Tooltip title="Add to comparison">
                          <IconButton
                            onClick={(e) => { e.stopPropagation(); onAdd(key); }}
                            sx={{ alignSelf: 'center', border: '1px solid #e2e8f0', borderRadius: 1.5, p: 0.75, color: COLOR.accent, '&:hover': { bgcolor: '#eff6ff', borderColor: COLOR.accent } }}
                          >
                            <Add sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  );
                })}
              </Collapse>
            </Box>
          );
        })}
        </Box>
      </CardContent>
    </Card>
  );
};

// ── selected GPU detail panel ───────────────────────────────────────────────
const GPUDetailPanel = ({ server, gpu, processes, rangeKey, onRangeChange, onRefresh }) => {
  if (!server || !gpu) {
    return (
      <Card elevation={0} sx={{ ...CARD_SX, p: 4 }}>
        <Typography variant="body2" sx={{ color: COLOR.muted }} align="center">
          Select a GPU from the sidebar
        </Typography>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      {/* Header card */}
      <Card elevation={0} sx={{ ...CARD_SX }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={7}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: { xs: '17px', sm: '20px' }, color: COLOR.title }}>
                  GPU {gpu.gpu_id} — {gpu.name}
                </Typography>
                <Chip
                  icon={server.status === 'online' ? <CheckCircle /> : <ErrorIcon />}
                  label={server.status.toUpperCase()}
                  size="small"
                  sx={{
                    bgcolor: server.status === 'online' ? '#ecfdf5' : '#fef2f2',
                    color: server.status === 'online' ? '#059669' : '#dc2626',
                    fontWeight: 600,
                    '& .MuiChip-icon': { color: 'inherit' },
                  }}
                />
              </Box>
              <Typography sx={{ fontFamily: INTER, fontSize: 13, color: COLOR.muted }}>
                {server.server_name} • {server.ip || server.server_id}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap rowGap={1}>
                {server.data?.cuda_version && (
                  <Chip label={`CUDA ${server.data.cuda_version}`} size="small" sx={{ bgcolor: '#f1f5f9', color: COLOR.muted, fontWeight: 600 }} />
                )}
                {gpu.driver_version && (
                  <Chip label={`Driver ${gpu.driver_version}`} size="small" sx={{ bgcolor: '#f1f5f9', color: COLOR.muted, fontWeight: 600 }} />
                )}
                {gpu.pcie_gen && (
                  <Chip label={`PCIe Gen${gpu.pcie_gen}`} size="small" sx={{ bgcolor: '#f1f5f9', color: COLOR.muted, fontWeight: 600 }} />
                )}
                {/* Placeholder — backend doesn't report NVLink yet */}
                <Chip label="NVLink Enabled" size="small" sx={{ bgcolor: '#f1f5f9', color: COLOR.muted, fontWeight: 600 }} />
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Stack direction="row" spacing={{ xs: 2.5, sm: 3 }} justifyContent={{ xs: 'flex-start', md: 'flex-end' }} sx={{ flexWrap: 'wrap' }} useFlexGap>
                <Box>
                  <Typography sx={{ fontFamily: INTER, fontSize: 12, color: COLOR.faint }}>Temperature</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DeviceThermostat sx={{ fontSize: 18, color: tempColor(gpu.temperature) }} />
                    <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: 22, color: COLOR.title }}>{gpu.temperature}°C</Typography>
                  </Box>
                </Box>
                <Box>
                  <Typography sx={{ fontFamily: INTER, fontSize: 12, color: COLOR.faint }}>GPU Utilization</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Timeline sx={{ fontSize: 18, color: utilColor(gpu.utilization) }} />
                    <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: 22, color: COLOR.title }}>{gpu.utilization}%</Typography>
                  </Box>
                </Box>
                <Box>
                  <Typography sx={{ fontFamily: INTER, fontSize: 12, color: COLOR.faint }}>
                    Memory / {(gpu.memory_total / 1024).toFixed(0)}GB
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Memory sx={{ fontSize: 18, color: COLOR.accent }} />
                    <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: 22, color: COLOR.title }}>
                      {(gpu.memory_used / 1024).toFixed(0)}GB
                    </Typography>
                  </Box>
                </Box>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Range selector */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={rangeKey}
          onChange={(_, v) => v && onRangeChange(v)}
          sx={{
            bgcolor: '#fff', border: '1px solid #E5E7EB', borderRadius: '8px', p: '2px',
            '& .MuiToggleButton-root': {
              border: 'none', borderRadius: '6px !important', textTransform: 'none',
              px: 1.5, py: 0.25, fontFamily: INTER, fontSize: 13, color: COLOR.muted,
              '&.Mui-selected': { bgcolor: '#f1f5f9', color: COLOR.title, fontWeight: 600 },
            },
          }}
        >
          {Object.keys(RANGE_PRESETS).map((k) => (
            <ToggleButton key={k} value={k}>{k}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Two charts side-by-side */}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <UtilizationChart serverId={server.server_id} gpuId={String(gpu.gpu_id)} rangeKey={rangeKey} />
        </Grid>
        <Grid item xs={12} md={6}>
          <MemoryChart
            serverId={server.server_id}
            gpuId={String(gpu.gpu_id)}
            memoryTotalMb={gpu.memory_total}
            memoryUsedMb={gpu.memory_used}
            rangeKey={rangeKey}
          />
        </Grid>
      </Grid>

      {/* Active processes for this GPU */}
      <Card elevation={0} sx={{ ...CARD_SX }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
            <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: { xs: '17px', sm: '20px' }, color: COLOR.title }}>
              Active Processes
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                startIcon={<Refresh sx={{ fontSize: 16 }} />}
                onClick={onRefresh}
                sx={{ textTransform: 'none', fontFamily: INTER, fontWeight: 600, fontSize: 13, color: COLOR.title, border: '1px solid #E5E7EB', borderRadius: '8px', px: 1.5, '&:hover': { borderColor: '#CBD5E1', bgcolor: '#f8fafc' } }}
              >
                Refresh List
              </Button>
              {/* Placeholder — no kill endpoint yet */}
              <Button
                size="small"
                onClick={() => {}}
                sx={{ textTransform: 'none', fontFamily: INTER, fontWeight: 600, fontSize: 13, color: '#dc2626', bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', px: 1.5, '&:hover': { bgcolor: '#fee2e2' } }}
              >
                Kill All
              </Button>
            </Box>
          </Box>
          {processes.length === 0 ? (
            <Typography variant="body2" sx={{ color: COLOR.muted, py: 2, textAlign: 'center' }}>
              No processes running on this GPU
            </Typography>
          ) : (
            <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ width: 36, p: 0, border: 'none' }} />
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: COLOR.muted, letterSpacing: 0.5 }}>PROCESS</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: COLOR.muted }}>PID</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: COLOR.muted }}>USER</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: COLOR.muted }} align="right">GPU MEM</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: COLOR.muted }} align="right">CAMERAS</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: COLOR.muted, minWidth: 110 }}>GPU %</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: COLOR.muted }}>RUNTIME</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: COLOR.muted }}>STATE</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {processes.map((p) => (
                    <TableRow key={p.pid} hover>
                      <TableCell sx={{ width: 36, p: 0 }}>
                        <KeyboardArrowRight sx={{ fontSize: 18, color: COLOR.faint }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} sx={{ color: COLOR.title }}>{p.name}</Typography>
                        <Tooltip title={p.cmdline || ''}>
                          <Typography
                            variant="caption" sx={{ color: COLOR.muted, fontFamily: 'monospace', display: 'block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          >
                            {p.cmdline || `pid ${p.pid}`}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">{p.pid}</Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 22, height: 22, fontSize: 11, bgcolor: userColor(p.username) }}>
                            {(p.username || '?').charAt(0).toUpperCase()}
                          </Avatar>
                          <Typography variant="body2">{p.username || '—'}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>{formatMb(p.memory_mb)}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={700} sx={{ color: COLOR.value }}>
                          {p.camera_count?.toLocaleString() || 0}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {/* Placeholder — backend has no per-process GPU% yet */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 90 }}>
                          <LinearProgress
                            variant="determinate"
                            value={0}
                            sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: '#eef0f3', '& .MuiLinearProgress-bar': { bgcolor: COLOR.accent, borderRadius: 3 } }}
                          />
                          <Typography variant="caption" sx={{ color: COLOR.faint }}>—</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{formatRuntime(p.runtime_seconds)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={(p.status || 'running').toUpperCase()}
                          size="small"
                          sx={{
                            bgcolor: p.status === 'running' ? '#ecfdf5' : '#fef3c7',
                            color:   p.status === 'running' ? '#059669' : '#92400e',
                            fontWeight: 700, fontSize: 10, height: 20,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
};

// ── compare view: one GPU's comparison card (real compact charts) ───────────
const CompareGpuCard = ({ server, gpu, rangeKey, onRemove }) => (
  <Card elevation={0} sx={{ ...CARD_SX }}>
    <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
          <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: { xs: '15px', sm: '17px' }, color: COLOR.title }} noWrap>
            GPU {gpu.gpu_id} — {gpu.name}
          </Typography>
          <Chip
            icon={server.status === 'online' ? <CheckCircle /> : <ErrorIcon />}
            label={server.status.toUpperCase()}
            size="small"
            sx={{ bgcolor: server.status === 'online' ? '#ecfdf5' : '#fef2f2', color: server.status === 'online' ? '#059669' : '#dc2626', fontWeight: 600, '& .MuiChip-icon': { color: 'inherit' } }}
          />
        </Box>
        <Tooltip title="Remove">
          <IconButton size="small" onClick={onRemove}><Close sx={{ fontSize: 18, color: COLOR.faint }} /></IconButton>
        </Tooltip>
      </Box>
      <Stack direction="row" spacing={4} sx={{ mt: 0.5 }}>
        <Box>
          <Typography sx={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', color: COLOR.faint, textTransform: 'uppercase' }}>Utilization</Typography>
          <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: 20, color: COLOR.title }}>{gpu.utilization}%</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontFamily: INTER, fontSize: 11, fontWeight: 600, letterSpacing: '0.5px', color: COLOR.faint, textTransform: 'uppercase' }}>Memory</Typography>
          <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: 20, color: COLOR.title }}>{(gpu.memory_used / 1024).toFixed(0)}GB</Typography>
        </Box>
      </Stack>
      <Box sx={{ height: '2px', bgcolor: COLOR.accent, borderRadius: 1, mt: 1.5, mb: 2 }} />
      <Stack spacing={2}>
        <UtilizationChart compact serverId={server.server_id} gpuId={String(gpu.gpu_id)} rangeKey={rangeKey} />
        <MemoryChart compact serverId={server.server_id} gpuId={String(gpu.gpu_id)} memoryTotalMb={gpu.memory_total} memoryUsedMb={gpu.memory_used} rangeKey={rangeKey} />
      </Stack>
    </CardContent>
  </Card>
);

// ── compare view: empty dashed "add a GPU" slot + drop target ───────────────
const AddGpuSlot = ({ onAdd }) => {
  const [over, setOver] = useState(false);
  return (
    <Box
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const key = e.dataTransfer.getData('text/plain');
        if (key) onAdd(key);
      }}
      sx={{
        height: '100%', minHeight: 220, borderRadius: '8px',
        border: `2px dashed ${over ? COLOR.accent : '#E5E7EB'}`,
        bgcolor: over ? '#eff6ff' : 'transparent',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', p: 3, transition: 'all 0.15s ease',
      }}
    >
      <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: 15, color: COLOR.muted }}>
        Click + or drag and drop to add a GPU for comparison
      </Typography>
      <Typography sx={{ fontFamily: INTER, fontSize: 13, color: COLOR.faint, mt: 0.5, maxWidth: 320 }}>
        Drag a GPU from the sidebar list, or click its + button, to see side-by-side performance metrics.
      </Typography>
    </Box>
  );
};

// ── stat cards (top row) — dashboard KPI-tile look ──────────────────────────
// `chips`: array of { label, value, tone } → two-line tone chips (Servers/GPUs).
// `subLabel`: plain gray caption under the value (Processes/Cameras).
const StatCard = ({ icon: Icon, label, value, chips, subLabel }) => (
  <Card elevation={0} sx={{ ...CARD_SX, height: '100%' }}>
    <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Typography sx={{ color: COLOR.muted, fontFamily: INTER, fontWeight: 700, fontSize: '12px', letterSpacing: '1px', lineHeight: '16px', textTransform: 'uppercase' }}>
          {label}
        </Typography>
        <Box sx={{ bgcolor: COLOR.iconBoxBg, borderRadius: '8px', width: { xs: 32, sm: 36, md: 40 }, height: { xs: 32, sm: 36, md: 40 }, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon sx={{ fontSize: { xs: 16, sm: 18 }, color: COLOR.iconColor }} />
        </Box>
      </Box>
      <Typography sx={{ color: COLOR.value, fontFamily: INTER, fontWeight: 700, fontSize: { xs: '28px', sm: '32px', md: '38px' }, lineHeight: { xs: '34px', sm: '38px', md: '44px' } }}>
        {value}
      </Typography>
      {chips && chips.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }} useFlexGap rowGap={1}>
          {chips.map((c) => {
            const tone = CHIP_TONES[c.tone] || CHIP_TONES.violet;
            return (
              <Box key={c.label} sx={{ flex: 1, minWidth: 0, bgcolor: tone.bg, borderRadius: '8px', px: 1, py: 0.5, textAlign: 'center' }}>
                <Typography sx={{ color: tone.text, fontFamily: INTER, fontWeight: 600, fontSize: '11px', lineHeight: '15px' }} noWrap>{c.label}</Typography>
                <Typography sx={{ color: tone.text, fontFamily: INTER, fontWeight: 700, fontSize: '13px', lineHeight: '17px' }}>{c.value}</Typography>
              </Box>
            );
          })}
        </Stack>
      )}
      {subLabel && (
        <Typography sx={{ mt: 1.5, color: COLOR.muted, fontFamily: INTER, fontSize: '12px', fontWeight: 500 }}>
          {subLabel}
        </Typography>
      )}
    </CardContent>
  </Card>
);

// ── main page ───────────────────────────────────────────────────────────────
const GPUMonitor = () => {
  const [clusterData, setClusterData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [rangeKey, setRangeKey] = useState('1h');
  const [viewMode, setViewMode] = useState('inspect'); // 'inspect' | 'compare'
  const [compareKeys, setCompareKeys] = useState([]);  // GPUs in the compare grid ("server::gpu")
  const addCompare = useCallback((key) => setCompareKeys((prev) => (prev.includes(key) ? prev : [...prev, key])), []);
  const removeCompare = useCallback((key) => setCompareKeys((prev) => prev.filter((k) => k !== key)), []);

  const fetchGPUStats = useCallback(async () => {
    try {
      setError(null);
      const res = await axios.get(`${API_BASE_URL}/gpu-monitor/stats`);
      setClusterData(res.data.data);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch GPU statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGPUStats();
    const id = setInterval(fetchGPUStats, 10000);
    return () => clearInterval(id);
  }, [fetchGPUStats]);

  // Auto-select first online GPU once data lands
  useEffect(() => {
    if (selectedKey || !clusterData?.servers) return;
    for (const s of clusterData.servers) {
      if (s.status === 'online' && s.data?.gpus?.length) {
        setSelectedKey(`${s.server_id}::${s.data.gpus[0].gpu_id}`);
        return;
      }
    }
  }, [clusterData, selectedKey]);

  // Derived: which server + GPU is currently selected
  const { selectedServer, selectedGPU, selectedProcesses } = useMemo(() => {
    if (!selectedKey || !clusterData?.servers) return {};
    const [srvId, gpuIdStr] = selectedKey.split('::');
    const server = clusterData.servers.find((s) => s.server_id === srvId);
    const gpu = server?.data?.gpus?.find((g) => String(g.gpu_id) === gpuIdStr);
    const processes = server?.data?.processes?.[gpuIdStr] || [];
    return { selectedServer: server, selectedGPU: gpu, selectedProcesses: processes };
  }, [selectedKey, clusterData]);

  // Resolve each compare key → { key, server, gpu } (skip any that no longer exist)
  const compareItems = useMemo(() => {
    if (!clusterData?.servers) return [];
    return compareKeys.map((key) => {
      const [srvId, gpuIdStr] = key.split('::');
      const server = clusterData.servers.find((s) => s.server_id === srvId);
      const gpu = server?.data?.gpus?.find((g) => String(g.gpu_id) === gpuIdStr);
      return server && gpu ? { key, server, gpu } : null;
    }).filter(Boolean);
  }, [compareKeys, clusterData]);

  // Cluster-wide live utilization for the header pill
  const clusterUtilPct = useMemo(() => {
    if (!clusterData?.servers) return null;
    const utilVals = [];
    for (const s of clusterData.servers) {
      if (s.status === 'online' && s.data?.gpus) {
        s.data.gpus.forEach((g) => utilVals.push(g.utilization));
      }
    }
    if (!utilVals.length) return null;
    return (utilVals.reduce((a, b) => a + b, 0) / utilVals.length).toFixed(1);
  }, [clusterData]);

  // Derived: active vs inactive GPUs (active = currently utilized) for the Total GPUs tile
  const { activeGpus, inactiveGpus } = useMemo(() => {
    const total = clusterData?.total_gpus || 0;
    let active = 0;
    (clusterData?.servers || []).forEach((s) => {
      if (s.status === 'online' && s.data?.gpus) {
        s.data.gpus.forEach((g) => { if ((g.utilization || 0) > 0) active += 1; });
      }
    });
    return { activeGpus: active, inactiveGpus: Math.max(0, total - active) };
  }, [clusterData]);

  if (loading && !clusterData) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }
  if (error && !clusterData) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: { md: 'calc(100vh - 120px)' }, overflow: { md: 'hidden' } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'flex-start' }, mb: 3, gap: 2, flexShrink: 0 }}>
        <Box>
          <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: { xs: '22px', sm: '26px' }, lineHeight: { xs: '28px', sm: '32px' }, color: COLOR.title, letterSpacing: '0.2px' }}>
            GPU Monitor
          </Typography>
          <Typography sx={{ mt: 0.25, fontFamily: INTER, fontWeight: 400, fontSize: { xs: '13px', sm: '14px' }, lineHeight: '20px', color: COLOR.sub }}>
            Real-Time GPU Allocation Efficiency Across Active Nodes
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          {clusterUtilPct != null && (
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontFamily: INTER, fontSize: '12px', fontWeight: 600, color: COLOR.faint }}>GPU Utilization</Typography>
              <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: '20px', color: COLOR.value }}>{clusterUtilPct}%</Typography>
            </Box>
          )}
          {lastUpdate && (
            <Typography sx={{ fontFamily: INTER, fontSize: '12px', color: COLOR.faint }}>
              {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
          <Tooltip title="Refresh">
            <IconButton onClick={fetchGPUStats} size="small"><Refresh sx={{ fontSize: 20, color: COLOR.muted }} /></IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Top stat cards */}
      <Grid container spacing={{ xs: 1.5, sm: 2, lg: 2.5 }} sx={{ mb: 3, flexShrink: 0 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            icon={Computer} label="Total Servers" value={clusterData?.total_servers || 0}
            chips={[
              { label: 'Online', value: clusterData?.online_servers || 0, tone: 'amber' },
              { label: 'Offline', value: clusterData?.offline_servers || 0, tone: 'violet' },
            ]}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            icon={Memory} label="Total GPUs" value={clusterData?.total_gpus || 0}
            chips={[
              { label: 'Active', value: activeGpus, tone: 'amber' },
              { label: 'Inactive', value: inactiveGpus, tone: 'violet' },
            ]}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            icon={Speed} label="Total Active Processes" value={clusterData?.total_processes || 0}
            subLabel="Per GPU"
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <StatCard
            icon={VideoLibrary} label="Total Cameras" value={(clusterData?.total_cameras || 0).toLocaleString()}
            subLabel="Accessible"
          />
        </Grid>
      </Grid>

      {/* Server Details */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5, flexShrink: 0 }}>
        <Typography sx={{ fontFamily: INTER, fontWeight: 700, fontSize: { xs: '17px', sm: '20px' }, color: COLOR.title }}>
          Server Details
        </Typography>
        {/* Inspect / Compare */}
        <Box sx={{ display: 'flex', bgcolor: '#fff', border: '1px solid #E5E7EB', borderRadius: '10px', p: '3px' }}>
          {['inspect', 'compare'].map((m) => {
            const active = viewMode === m;
            return (
              <Box
                key={m}
                component="button"
                type="button"
                onClick={() => {
                  setViewMode(m);
                  // Seed the compare grid with the GPU you were inspecting.
                  if (m === 'compare' && compareKeys.length === 0 && selectedKey) setCompareKeys([selectedKey]);
                }}
                sx={{
                  border: 'none', cursor: 'pointer', borderRadius: '8px',
                  px: 2, py: 0.5, fontFamily: INTER, fontSize: '13px', fontWeight: 600, textTransform: 'capitalize',
                  bgcolor: active ? '#f1f5f9' : 'transparent',
                  color: active ? COLOR.title : COLOR.muted,
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                }}
              >
                {m}
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, flex: { md: 1 }, minHeight: 0, overflow: { md: 'hidden' } }}>
        <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0, height: { md: '100%' } }}>
          <ServerGpuSidebar
            servers={clusterData?.servers || []}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            expanded={expanded}
            onToggle={(srvId) => setExpanded((prev) => ({ ...prev, [srvId]: prev[srvId] === false }))}
            compareMode={viewMode === 'compare'}
            compareKeys={compareKeys}
            onAdd={addCompare}
          />
        </Box>
        <Box sx={{
          flex: 1, minWidth: 0, height: { md: '100%' }, overflowY: { md: 'auto' },
          scrollbarWidth: 'thin', scrollbarColor: '#cbd5e1 transparent',
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { backgroundColor: '#cbd5e1', borderRadius: '3px' },
          '&::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
        }}>
          {viewMode === 'inspect' ? (
            <GPUDetailPanel
              server={selectedServer}
              gpu={selectedGPU}
              processes={selectedProcesses || []}
              rangeKey={rangeKey}
              onRangeChange={setRangeKey}
              onRefresh={fetchGPUStats}
            />
          ) : (
            /* Compare grid — also a drop target so a GPU can be dropped anywhere */
            <Box
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const key = e.dataTransfer.getData('text/plain');
                if (key) addCompare(key);
              }}
            >
              <Grid container spacing={2}>
                {compareItems.map(({ key, server, gpu }) => (
                  <Grid item xs={12} md={6} key={key}>
                    <CompareGpuCard server={server} gpu={gpu} rangeKey={rangeKey} onRemove={() => removeCompare(key)} />
                  </Grid>
                ))}
                <Grid item xs={12} md={6}>
                  <AddGpuSlot onAdd={addCompare} />
                </Grid>
              </Grid>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default GPUMonitor;
