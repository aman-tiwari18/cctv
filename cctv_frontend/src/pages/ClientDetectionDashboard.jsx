import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  ExpandMore,
  School,
  Videocam,
  Schedule,
  Warning,
  CheckCircle,
  Cancel,
  Event,
  TrendingUp,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { clientDashboardAPI } from '../services/api';

const TYPE_META = {
  proximity: { label: 'Close Proximity', color: '#5cb88a' },
  crowd: { label: 'Crowd Detection', color: '#e24d7b' },
  crowd_five: { label: 'Crowd < 5', color: '#e06050' },
  crowd_zero: { label: 'Zero Person', color: '#6b5b95' },
  server: { label: 'Server Room', color: '#a0623d' },
  intruder: { label: 'Intruder', color: '#d94466' },
  entry_exit: { label: 'Entry/Exit', color: '#1d7a7d' },
  phone: { label: 'Phone', color: '#465a38' },
  blind_spot: { label: 'Blind Spot', color: '#b0a850' },
  invigilator: { label: 'Invigilator', color: '#00bfcf' },
  inversion: { label: 'Camera Inversion', color: '#7a86b4' },
  tamper: { label: 'Camera Tampering', color: '#00c8d4' },
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const StatCard = ({ title, value, icon, color, subtitle }) => (
  <Card elevation={0} sx={{ height: '100%', borderRadius: 3, border: '1px solid #e2e8f0' }}>
    <CardContent sx={{ p: 2.5 }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box flex={1}>
          <Typography
            variant="caption"
            sx={{
              color: '#64748b',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              fontSize: '0.7rem',
            }}
          >
            {title}
          </Typography>
          <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, color: '#0f172a' }}>
            {value}
          </Typography>
          {subtitle && (
            <Typography variant="caption" sx={{ color: '#94a3b8', mt: 0.5, display: 'block' }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            backgroundColor: `${color}18`,
            borderRadius: 2,
            p: 1.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {React.cloneElement(icon, { sx: { fontSize: 28, color } })}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const ClientDetectionDashboard = () => {
  const [dashboardData, setDashboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await clientDashboardAPI.getStats();
      console.log('[ClientDashboard Frontend] API Response:', response.data);
      setDashboardData(response.data.data || []);
      
      if (!response.data.data || response.data.data.length === 0) {
        console.log('[ClientDashboard Frontend] No data received. Message:', response.data.message);
      }
    } catch (error) {
      console.error('[ClientDashboard Frontend] Error loading dashboard data:', error);
      console.error('[ClientDashboard Frontend] Error details:', error.response?.data);
    } finally {
      setLoading(false);
    }
  };

  const handleAccordionChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  // Calculate overall statistics
  const overallStats = dashboardData.reduce(
    (acc, item) => ({
      total_exams: acc.total_exams + item.stats.total_exams,
      total_cameras: acc.total_cameras + item.stats.total_cameras,
      total_shifts: acc.total_shifts + item.stats.total_shifts,
      total_detections: acc.total_detections + item.stats.total_detections,
      accessible_cameras: acc.accessible_cameras + item.stats.camera_status.accessible,
      not_accessible_cameras: acc.not_accessible_cameras + item.stats.camera_status.not_accessible,
    }),
    {
      total_exams: 0,
      total_cameras: 0,
      total_shifts: 0,
      total_detections: 0,
      accessible_cameras: 0,
      not_accessible_cameras: 0,
    }
  );

  const formatDateDDMMYYYY = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={48} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={3} sx={{ fontSize: '0.9rem' }}>
        Client-wise detection analytics grouped by examination body
      </Typography>

      {/* Overall Statistics */}
      <Grid container spacing={2.5} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Exam Bodies"
            value={dashboardData.length}
            icon={<School />}
            color="#3b82f6"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Active Exams"
            value={overallStats.total_exams}
            icon={<Event />}
            color="#10b981"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Cameras"
            value={overallStats.total_cameras}
            icon={<Videocam />}
            color="#f59e0b"
            subtitle={`${overallStats.accessible_cameras} accessible`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Detections"
            value={overallStats.total_detections.toLocaleString()}
            icon={<Warning />}
            color="#ef4444"
          />
        </Grid>
      </Grid>

      {/* Exam Body Breakdown */}
      <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', mb: 3 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 2, color: '#0f172a' }}>
          Exam Body Breakdown
        </Typography>

        {dashboardData.length === 0 ? (
          <Box textAlign="center" py={8}>
            <School sx={{ fontSize: 64, color: '#cbd5e1', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Client Data Available
            </Typography>
            <Typography variant="body2" color="text.secondary">
              No active exams found with exam_body data. Please ensure exams are created with exam_body values.
            </Typography>
          </Box>
        ) : (
          dashboardData.map((item, index) => (
            <Accordion
              key={item.exam_body}
              expanded={expanded === item.exam_body}
              onChange={handleAccordionChange(item.exam_body)}
              elevation={0}
              sx={{
                mb: 1,
                border: '1px solid #e2e8f0',
                borderRadius: '12px !important',
                '&:before': { display: 'none' },
                '&.Mui-expanded': { margin: '0 0 8px 0 !important' },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMore />}
                sx={{
                  borderRadius: '12px',
                  '&.Mui-expanded': { borderRadius: '12px 12px 0 0' },
                }}
              >
                <Box display="flex" alignItems="center" justifyContent="space-between" width="100%" pr={2}>
                  <Box display="flex" alignItems="center" gap={2}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        bgcolor: `${COLORS[index % COLORS.length]}18`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <School sx={{ fontSize: 20, color: COLORS[index % COLORS.length] }} />
                    </Box>
                    <Box>
                      <Typography variant="h6" fontWeight={600} sx={{ fontSize: '1rem' }}>
                        {item.exam_body}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.stats.total_exams} exam{item.stats.total_exams !== 1 ? 's' : ''} • {item.stats.total_cameras} cameras
                      </Typography>
                    </Box>
                  </Box>
                  <Box display="flex" gap={2} alignItems="center">
                    <Chip
                      label={`${item.stats.total_detections.toLocaleString()} detections`}
                      size="small"
                      sx={{
                        bgcolor: '#fef2f2',
                        color: '#ef4444',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                      }}
                    />
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 2, pb: 3 }}>
                <Grid container spacing={3}>
                  {/* Exams List */}
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: '#64748b', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                      Active Exams
                    </Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b' }}>Exam Name</TableCell>
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b' }}>Type</TableCell>
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: '#64748b' }}>Duration</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {item.exams.map((exam) => (
                            <TableRow key={exam.id} hover>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{exam.name}</TableCell>
                              <TableCell>
                                <Chip
                                  label={exam.link_type || 'N/A'}
                                  size="small"
                                  sx={{
                                    height: 20,
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    bgcolor: exam.link_type === 'HLS' ? '#dbeafe' : '#f3e8ff',
                                    color: exam.link_type === 'HLS' ? '#1e40af' : '#6b21a8',
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>
                                {exam.start_date && exam.end_date
                                  ? `${formatDateDDMMYYYY(exam.start_date)} - ${formatDateDDMMYYYY(exam.end_date)}`
                                  : 'N/A'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Statistics */}
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5, color: '#64748b', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                      Statistics Overview
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Paper elevation={0} sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                            Total Shifts
                          </Typography>
                          <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5 }}>
                            {item.stats.total_shifts}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6}>
                        <Paper elevation={0} sx={{ p: 2, bgcolor: '#f0fdf4', borderRadius: 2 }}>
                          <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#16a34a' }}>
                            Accessible
                          </Typography>
                          <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, color: '#16a34a' }}>
                            {item.stats.camera_status.accessible}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6}>
                        <Paper elevation={0} sx={{ p: 2, bgcolor: '#fef2f2', borderRadius: 2 }}>
                          <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#dc2626' }}>
                            Not Accessible
                          </Typography>
                          <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, color: '#dc2626' }}>
                            {item.stats.camera_status.not_accessible}
                          </Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={6}>
                        <Paper elevation={0} sx={{ p: 2, bgcolor: '#f1f5f9', borderRadius: 2 }}>
                          <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>
                            Unknown Status
                          </Typography>
                          <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, color: '#64748b' }}>
                            {item.stats.camera_status.unknown}
                          </Typography>
                        </Paper>
                      </Grid>
                    </Grid>

                    {/* Detection Types */}
                    {Object.keys(item.stats.detection_counts).length > 0 && (
                      <Box mt={2}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: '#64748b', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                          Detection Types
                        </Typography>
                        <Box display="flex" flexWrap="wrap" gap={1}>
                          {Object.entries(item.stats.detection_counts).map(([type, count]) => {
                            const meta = TYPE_META[type] || { label: type, color: '#94a3b8' };
                            return (
                              <Chip
                                key={type}
                                label={`${meta.label}: ${count}`}
                                size="small"
                                sx={{
                                  bgcolor: `${meta.color}18`,
                                  color: meta.color,
                                  fontWeight: 600,
                                  fontSize: '0.7rem',
                                }}
                              />
                            );
                          })}
                        </Box>
                      </Box>
                    )}
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Paper>

      {/* Detection Distribution Chart */}
      {dashboardData.length > 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: 400 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2, color: '#0f172a' }}>
                Detections by Exam Body
              </Typography>
              <ResponsiveContainer width="100%" height="85%">
                <PieChart>
                  <Pie
                    data={dashboardData.map((item, index) => ({
                      name: item.exam_body,
                      value: item.stats.total_detections,
                      color: COLORS[index % COLORS.length],
                    }))}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {dashboardData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>

          <Grid item xs={12} md={6}>
            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: 400 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2, color: '#0f172a' }}>
                Cameras by Exam Body
              </Typography>
              <ResponsiveContainer width="100%" height="85%">
                <BarChart
                  data={dashboardData.map((item) => ({
                    name: item.exam_body,
                    cameras: item.stats.total_cameras,
                    accessible: item.stats.camera_status.accessible,
                    not_accessible: item.stats.camera_status.not_accessible,
                  }))}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="accessible" fill="#10b981" name="Accessible" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="not_accessible" fill="#ef4444" name="Not Accessible" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default ClientDetectionDashboard;
