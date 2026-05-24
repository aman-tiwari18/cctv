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

const UtilizationChart = ({ serverId, gpuId, rangeKey }) => {
  const query = `gpu_utilization_percent{server_id="${serverId}",gpu_id="${gpuId}"}`;
  const { data, error, loading, stepSec } = usePromTimeseries(query, rangeKey);
  const stats = useMemo(() => seriesStats(data, stepSec), [data, stepSec]);

  return (
    <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>GPU Utilization</Typography>
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

const MemoryChart = ({ serverId, gpuId, memoryTotalMb, memoryUsedMb, rangeKey }) => {
  const query = `gpu_memory_used_mb{server_id="${serverId}",gpu_id="${gpuId}"}`;
  const { data, error, loading, stepSec } = usePromTimeseries(query, rangeKey);
  const stats = useMemo(() => seriesStats(data, stepSec, 0), [data, stepSec]);
  const freeGb = memoryTotalMb && memoryUsedMb != null
    ? ((memoryTotalMb - memoryUsedMb) / 1024).toFixed(1) + 'GB'
    : '—';
  const peakGb = (stats.peak / 1024).toFixed(1) + 'GB';
  const avgGb  = (stats.avg / 1024).toFixed(1) + 'GB';

  return (
    <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>Memory / VRAM Usage</Typography>
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

const ChartBody = ({ data, loading, error, color, filled, yDomain, unit, formatY }) => {
  if (error) {
    return (
      <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <Typography variant="caption" color="error" sx={{ mb: 1 }}>
          Prometheus unavailable
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: 11 }}>
          {error.slice(0, 100)}
        </Typography>
      </Box>
    );
  }
  if (loading && !data.length) {
    return <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={24} /></Box>;
  }
  if (!data.length) {
    return <Box sx={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Typography variant="caption" color="text.secondary">No data in range</Typography>
    </Box>;
  }

  const ChartComp = filled ? AreaChart : LineChart;
  const SeriesComp = filled ? Area : Line;

  return (
    <Box sx={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ChartComp data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis dataKey="time" tickFormatter={tickTime} stroke="#94a3b8" fontSize={11} />
          <YAxis
            domain={yDomain}
            tickFormatter={formatY}
            stroke="#94a3b8"
            fontSize={11}
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
const ServerGpuSidebar = ({ servers, selectedKey, onSelect, expanded, onToggle }) => (
  <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
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
                <Storage sx={{ fontSize: 16, color: '#64748b' }} />
                <Typography variant="body2" fontWeight={600}>{server.server_name}</Typography>
              </Box>
              {isOpen ? <ExpandLess sx={{ fontSize: 18, color: '#94a3b8' }} /> : <ExpandMore sx={{ fontSize: 18, color: '#94a3b8' }} />}
            </Box>
            <Collapse in={isOpen}>
              {!isOnline && (
                <Box sx={{ px: 1.5, py: 0.5 }}>
                  <Typography variant="caption" color="error">Offline · {server.error || 'unreachable'}</Typography>
                </Box>
              )}
              {(server.data?.gpus || []).map((gpu) => {
                const key = `${server.server_id}::${gpu.gpu_id}`;
                const selected = key === selectedKey;
                return (
                  <Paper
                    key={key}
                    onClick={() => onSelect(key)}
                    elevation={0}
                    sx={{
                      p: 1.25, ml: 1.5, mt: 0.5, cursor: 'pointer',
                      border: selected ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                      borderRadius: 1.5,
                      '&:hover': { borderColor: selected ? '#3b82f6' : '#cbd5e1' },
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" fontWeight={700}>GPU {gpu.gpu_id}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">{gpu.temperature}°C</Typography>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tempColor(gpu.temperature) }} />
                      </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {gpu.name}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                      <Typography variant="caption" color="text.secondary">{gpu.utilization}% Util</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {gpu.memory_used > 1024 ? `${(gpu.memory_used / 1024).toFixed(0)}GB` : `${gpu.memory_used}MB`} Mem
                      </Typography>
                    </Box>
                  </Paper>
                );
              })}
            </Collapse>
          </Box>
        );
      })}
    </CardContent>
  </Card>
);

// ── selected GPU detail panel ───────────────────────────────────────────────
const GPUDetailPanel = ({ server, gpu, processes, rangeKey, onRangeChange }) => {
  if (!server || !gpu) {
    return (
      <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 4 }}>
        <Typography variant="body2" color="text.secondary" align="center">
          Select a GPU from the sidebar
        </Typography>
      </Card>
    );
  }

  const memPct = gpu.memory_total ? (gpu.memory_used / gpu.memory_total) * 100 : 0;

  return (
    <Stack spacing={2}>
      {/* Header card */}
      <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={7}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="h6" fontWeight={700}>
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
              <Typography variant="caption" color="text.secondary">
                {server.server_name} • {server.ip || server.server_id}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                {server.data?.cuda_version && (
                  <Chip label={`CUDA ${server.data.cuda_version}`} size="small" sx={{ bgcolor: '#f1f5f9', fontWeight: 600 }} />
                )}
                {gpu.driver_version && (
                  <Chip label={`Driver ${gpu.driver_version}`} size="small" sx={{ bgcolor: '#f1f5f9', fontWeight: 600 }} />
                )}
                {gpu.pcie_gen && (
                  <Chip label={`PCIe Gen${gpu.pcie_gen}`} size="small" sx={{ bgcolor: '#f1f5f9', fontWeight: 600 }} />
                )}
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Stack direction="row" spacing={3} justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">GPU Utilization</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                    <Timeline sx={{ fontSize: 18, color: utilColor(gpu.utilization) }} />
                    <Typography variant="h5" fontWeight={700}>{gpu.utilization}%</Typography>
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Memory / {(gpu.memory_total / 1024).toFixed(0)}GB
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                    <Memory sx={{ fontSize: 18, color: '#3b82f6' }} />
                    <Typography variant="h5" fontWeight={700}>
                      {(gpu.memory_used / 1024).toFixed(0)}GB
                    </Typography>
                  </Box>
                </Box>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={memPct}
                sx={{
                  mt: 1, height: 6, borderRadius: 3, bgcolor: '#e2e8f0',
                  '& .MuiLinearProgress-bar': { bgcolor: '#3b82f6', borderRadius: 3 },
                }}
              />
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
        >
          {Object.keys(RANGE_PRESETS).map((k) => (
            <ToggleButton key={k} value={k} sx={{ px: 1.5, py: 0.25, textTransform: 'none' }}>{k}</ToggleButton>
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
      <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>Active Processes</Typography>
            <Chip label={`${processes.length} running`} size="small" sx={{ bgcolor: '#f1f5f9', fontWeight: 600 }} />
          </Box>
          {processes.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              No processes running on this GPU
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: '#64748b', letterSpacing: 0.5 }}>PROCESS</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: '#64748b' }}>PID</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: '#64748b' }}>USER</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: '#64748b' }} align="right">GPU MEM</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: '#64748b' }} align="right">CAMERAS</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: '#64748b' }}>RUNTIME</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: 11, color: '#64748b' }}>STATE</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {processes.map((p) => (
                    <TableRow key={p.pid} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{p.name}</Typography>
                        <Tooltip title={p.cmdline || ''}>
                          <Typography
                            variant="caption" color="text.secondary"
                            sx={{ fontFamily: 'monospace', display: 'block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
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
                        <Typography variant="body2" fontWeight={700} color="primary">
                          {p.camera_count?.toLocaleString() || 0}
                        </Typography>
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

// ── stat cards (top row) ────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, iconColor, label, value, chips }) => (
  <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
          {label}
        </Typography>
        <Icon sx={{ fontSize: 20, color: iconColor }} />
      </Box>
      <Typography variant="h4" fontWeight={700} sx={{ color: '#3b82f6' }}>{value}</Typography>
      {chips && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          {chips}
        </Stack>
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
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} color="#0f172a">GPU Monitor</Typography>
          <Typography variant="body2" color="text.secondary">
            Real-time GPU allocation efficiency across active nodes
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {clusterUtilPct != null && (
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="caption" color="text.secondary">GPU Utilization</Typography>
              <Typography variant="h6" fontWeight={700} color="#3b82f6">{clusterUtilPct}%</Typography>
            </Box>
          )}
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
          <Tooltip title="Refresh">
            <IconButton onClick={fetchGPUStats} size="small"><Refresh sx={{ fontSize: 20 }} /></IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Top stat cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={Computer} iconColor="#3b82f6" label="Total Servers" value={clusterData?.total_servers || 0}
            chips={
              <>
                <Chip label={`${clusterData?.online_servers || 0} Online`}  size="small" sx={{ bgcolor: '#ecfdf5', color: '#059669', fontWeight: 600 }} />
                {clusterData?.offline_servers > 0 && (
                  <Chip label={`${clusterData.offline_servers} Offline`} size="small" sx={{ bgcolor: '#fef2f2', color: '#dc2626', fontWeight: 600 }} />
                )}
              </>
            }
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={Memory} iconColor="#8b5cf6" label="Total GPUs" value={clusterData?.total_gpus || 0}
            chips={<Chip label="Across cluster" size="small" sx={{ bgcolor: '#f1f5f9', color: '#64748b', fontWeight: 600 }} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={Speed} iconColor="#f59e0b" label="Active Processes" value={clusterData?.total_processes || 0}
            chips={<Chip label="Detection pipelines" size="small" sx={{ bgcolor: '#f1f5f9', color: '#64748b', fontWeight: 600 }} />}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            icon={VideoLibrary} iconColor="#06b6d4" label="Total Cameras" value={(clusterData?.total_cameras || 0).toLocaleString()}
            chips={<Chip label="Being monitored" size="small" sx={{ bgcolor: '#f1f5f9', color: '#64748b', fontWeight: 600 }} />}
          />
        </Grid>
      </Grid>

      {/* Server Details */}
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>Server Details</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <ServerGpuSidebar
            servers={clusterData?.servers || []}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            expanded={expanded}
            onToggle={(srvId) => setExpanded((prev) => ({ ...prev, [srvId]: prev[srvId] === false }))}
          />
        </Grid>
        <Grid item xs={12} md={9}>
          <GPUDetailPanel
            server={selectedServer}
            gpu={selectedGPU}
            processes={selectedProcesses || []}
            rangeKey={rangeKey}
            onRangeChange={setRangeKey}
          />
        </Grid>
      </Grid>
    </Box>
  );
};

export default GPUMonitor;
