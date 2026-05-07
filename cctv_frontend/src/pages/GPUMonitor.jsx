import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
import {
  Memory,
  Speed,
  Thermostat,
  CheckCircle,
  Error as ErrorIcon,
  Refresh,
  Computer,
  VideoLibrary,
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const GPUMonitor = () => {
  const [clusterData, setClusterData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchGPUStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${API_BASE_URL}/gpu-monitor/stats`);
      setClusterData(response.data.data);
      setLastUpdate(new Date());
    } catch (err) {
      console.error('Failed to fetch GPU stats:', err);
      setError(err.response?.data?.detail || 'Failed to fetch GPU statistics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGPUStats();
    const interval = setInterval(fetchGPUStats, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const getUtilizationColor = (utilization) => {
    if (utilization >= 80) return '#ef4444';
    if (utilization >= 60) return '#f59e0b';
    if (utilization >= 40) return '#3b82f6';
    return '#10b981';
  };

  const getTemperatureColor = (temp) => {
    if (temp >= 80) return '#ef4444';
    if (temp >= 70) return '#f59e0b';
    return '#10b981';
  };

  if (loading && !clusterData) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !clusterData) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" fontWeight={700} color="#0f172a">
            GPU Cluster Monitor
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Real-time GPU utilization across all worker servers
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
          <Tooltip title="Refresh">
            <IconButton onClick={fetchGPUStats} disabled={loading} size="small">
              <Refresh sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Cluster Overview */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Computer sx={{ fontSize: 20, color: '#3b82f6', mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Total Servers
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={700}>
                {clusterData?.total_servers || 0}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                <Chip
                  label={`${clusterData?.online_servers || 0} Online`}
                  size="small"
                  sx={{ bgcolor: '#ecfdf5', color: '#059669', fontWeight: 600 }}
                />
                {clusterData?.offline_servers > 0 && (
                  <Chip
                    label={`${clusterData.offline_servers} Offline`}
                    size="small"
                    sx={{ bgcolor: '#fef2f2', color: '#dc2626', fontWeight: 600 }}
                  />
                )}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Memory sx={{ fontSize: 20, color: '#8b5cf6', mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Total GPUs
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={700}>
                {clusterData?.total_gpus || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Across all servers
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Speed sx={{ fontSize: 20, color: '#f59e0b', mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Active Processes
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={700}>
                {clusterData?.total_processes || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Detection pipelines
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <VideoLibrary sx={{ fontSize: 20, color: '#06b6d4', mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Total Cameras
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={700}>
                {clusterData?.total_cameras?.toLocaleString() || 0}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Being monitored
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Server Details */}
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        Server Details
      </Typography>

      <Grid container spacing={2}>
        {clusterData?.servers?.map((server) => (
          <Grid item xs={12} key={server.server_id}>
            <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2 }}>
              <CardContent>
                {/* Server Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Computer sx={{ fontSize: 24, color: '#64748b' }} />
                    <Box>
                      <Typography variant="h6" fontWeight={700}>
                        {server.server_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {server.ip} • {server.server_id}
                      </Typography>
                    </Box>
                  </Box>
                  <Chip
                    icon={server.status === 'online' ? <CheckCircle /> : <ErrorIcon />}
                    label={server.status.toUpperCase()}
                    size="small"
                    sx={{
                      bgcolor: server.status === 'online' ? '#ecfdf5' : '#fef2f2',
                      color: server.status === 'online' ? '#059669' : '#dc2626',
                      fontWeight: 600,
                      '& .MuiChip-icon': {
                        color: server.status === 'online' ? '#059669' : '#dc2626',
                      },
                    }}
                  />
                </Box>

                {server.status === 'offline' && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {server.error || 'Server is offline'}
                  </Alert>
                )}

                {server.status === 'online' && server.data && (
                  <>
                    {/* GPU Cards */}
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      {server.data.gpus?.map((gpu) => (
                        <Grid item xs={12} md={6} key={gpu.gpu_id}>
                          <Paper elevation={0} sx={{ p: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                              <Box>
                                <Typography variant="subtitle2" fontWeight={700}>
                                  GPU {gpu.gpu_id}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {gpu.name}
                                </Typography>
                              </Box>
                              <Chip
                                label={`${gpu.temperature}°C`}
                                size="small"
                                sx={{
                                  bgcolor: '#fff',
                                  color: getTemperatureColor(gpu.temperature),
                                  fontWeight: 600,
                                  border: `1px solid ${getTemperatureColor(gpu.temperature)}`,
                                }}
                                icon={<Thermostat sx={{ fontSize: 16 }} />}
                              />
                            </Box>

                            {/* Utilization */}
                            <Box sx={{ mb: 2 }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  Utilization
                                </Typography>
                                <Typography variant="caption" fontWeight={700}>
                                  {gpu.utilization}%
                                </Typography>
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={gpu.utilization}
                                sx={{
                                  height: 8,
                                  borderRadius: 4,
                                  bgcolor: '#e2e8f0',
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: getUtilizationColor(gpu.utilization),
                                    borderRadius: 4,
                                  },
                                }}
                              />
                            </Box>

                            {/* Memory */}
                            <Box>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">
                                  Memory
                                </Typography>
                                <Typography variant="caption" fontWeight={700}>
                                  {gpu.memory_used} / {gpu.memory_total} MB
                                </Typography>
                              </Box>
                              <LinearProgress
                                variant="determinate"
                                value={(gpu.memory_used / gpu.memory_total) * 100}
                                sx={{
                                  height: 8,
                                  borderRadius: 4,
                                  bgcolor: '#e2e8f0',
                                  '& .MuiLinearProgress-bar': {
                                    bgcolor: '#3b82f6',
                                    borderRadius: 4,
                                  },
                                }}
                              />
                            </Box>
                          </Paper>
                        </Grid>
                      ))}
                    </Grid>

                    {/* Processes Table */}
                    {server.data.processes && Object.keys(server.data.processes).length > 0 && (
                      <>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                          Running Processes
                        </Typography>
                        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                <TableCell sx={{ fontWeight: 700 }}>GPU</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>PID</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Process Name</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="right">Memory (MB)</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="right">Cameras</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {Object.entries(server.data.processes).map(([gpuId, processes]) =>
                                processes.map((proc, idx) => (
                                  <TableRow key={`${gpuId}-${idx}`} hover>
                                    <TableCell>
                                      <Chip label={`GPU ${gpuId}`} size="small" sx={{ bgcolor: '#f1f5f9', fontWeight: 600 }} />
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2" fontFamily="monospace">
                                        {proc.pid}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Tooltip title={proc.cmdline || ''}>
                                        <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                                          {proc.name}
                                        </Typography>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell>
                                      <Chip
                                        label={proc.type}
                                        size="small"
                                        sx={{
                                          bgcolor: proc.type === 'master' ? '#dbeafe' : '#f3e8ff',
                                          color: proc.type === 'master' ? '#1e40af' : '#6b21a8',
                                          fontWeight: 600,
                                          fontSize: '0.7rem',
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell align="right">
                                      <Typography variant="body2" fontWeight={600}>
                                        {proc.memory_mb.toLocaleString()}
                                      </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                      <Typography variant="body2" fontWeight={700} color="primary">
                                        {proc.camera_count?.toLocaleString() || 0}
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default GPUMonitor;
