import React, { useState, useEffect, useMemo } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Paper,
  FormControl,
  Select,
  MenuItem,
  LinearProgress,
} from '@mui/material';
import {
  CheckCircle,
  Cancel,
  Autorenew,
  MoreHoriz,
  InfoOutlined,
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { examsAPI, executionsAPI, dashboardAPI } from '../services/api';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon';
import { CustomSvgIcon } from '../components/DetectionSvgIcon';
import { ShiftSvgIcon } from '../components/ShiftSvgIcon';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { useAuth } from '../contexts/AuthContext';
import { useDetectionCounts } from '../contexts/DetectionCountsContext';
import { useSocket } from '../contexts/SocketContext';
import { useNavigate } from 'react-router-dom';

const CATEGORY_COLORS = {
  people: '#3b82f6',
  movement: '#ef4444',
  camera: '#f59e0b',
};

const SCRIPT_CATEGORY_MAP = {
  // Script IDs (from scripts table)
  proximity: 'people',
  crowd: 'people',
  crowd_biometric: 'people',
  crowd_five: 'people',
  crowd_zero: 'people',
  invigilator: 'people',
  phone: 'people',
  server: 'people',
  intruder: 'people',
  strongroom: 'movement',
  qp_box: 'movement',
  entry_exit: 'movement',
  inversion: 'camera',
  tamper: 'camera',
  tampering: 'camera',
  blind_spot: 'camera',
  vision: 'camera',
  
  // Folder names (detection_type in database) - ACTUAL VALUES FROM WORKERS
  proximity_detection: 'people',
  crowd_detection: 'people',
  crowd_detection_biometric: 'people',
  crowd_detection_threshold: 'people',
  zero_person_detection: 'people',
  invigilator_detection: 'people',
  phone_detection: 'people',
  server_room_detection: 'people',
  intruder_detection: 'people',
  strongroom_detection: 'movement',
  qp_box_missing: 'movement',
  entry_exit_detection: 'movement',
  camera_inversion_detection: 'camera',
  camera_tampering_detection: 'camera',
  blind_spot_detection: 'camera',
  vision_detection: 'camera',
};

const DETECTION_TYPE_LABELS = {
  // Script IDs
  proximity: 'Close Proximity',
  crowd: 'Crowd Detection (Entry/Exit)',
  crowd_biometric: 'Crowd Detection (Biometric)',
  crowd_five: 'Crowd < 5',
  crowd_zero: 'Zero Person',
  server: 'Server Room',
  intruder: 'Intruder',
  strongroom: 'Strong Room Movement',
  qp_box: 'QP Box Detection',
  entry_exit: 'Entry/Exit',
  phone: 'Phone',
  blind_spot: 'Blind Spot',
  invigilator: 'Invigilator',
  inversion: 'Camera Inversion',
  tamper: 'Camera Tampering',
  tampering: 'Camera Tampering',
  vision: 'Vision Detection',
  
  // Folder names (detection_type in database) - ACTUAL VALUES FROM WORKERS
  proximity_detection: 'Close Proximity',
  crowd_detection: 'Crowd Detection (Entry/Exit)',
  crowd_detection_biometric: 'Crowd Detection (Biometric)',
  crowd_detection_threshold: 'Crowd < 5',
  zero_person_detection: 'Zero Person',
  server_room_detection: 'Server Room',
  intruder_detection: 'Intruder',
  strongroom_detection: 'Strong Room Movement',
  qp_box_missing: 'QP Box Detection',
  entry_exit_detection: 'Entry/Exit',
  phone_detection: 'Phone',
  blind_spot_detection: 'Blind Spot',
  invigilator_detection: 'Invigilator',
  camera_inversion_detection: 'Camera Inversion',
  camera_tampering_detection: 'Camera Tampering',
  vision_detection: 'Vision Detection',
};

const StatCard = ({ title, value, icon, color, loading, onClick }) => (
  <Card
    elevation={0}
    onClick={onClick}
    sx={{
      height: '100%', borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.18s ease',
      '&:hover': onClick ? { boxShadow: '0 4px 20px rgba(59,130,246,0.12)', borderColor: '#3b82f6' } : {},
    }}
  >
    <CardContent sx={{ p: 0, height: '100%', '&:last-child': { pb: 0 } }}>
      <Box display="flex" justifyContent="space-between" alignItems="stretch" height="100%">
        <Box flex={1} display="flex" flexDirection="column" justifyContent="center" sx={{ p: 2 }}>
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
          <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, color: '#0f172a' }}>
            {loading ? <CircularProgress size={24} /> : value}
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pr: 2,
            py: 2,
          }}
        >
          <Box
            sx={{
              backgroundColor: `${color}18`,
              borderRadius: 2,
              width: 70,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {React.cloneElement(icon, { sx: { fontSize: 40, color } })}
          </Box>
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const EXECUTION_DETAIL_ITEMS = [
  {
    key: 'completed',
    label: 'COMPLETED',
    icon: <CheckCircle sx={{ fontSize: 20, color: '#fff' }} />,
    bgColor: '#4caf50',
  },
  {
    key: 'failed',
    label: 'FAILED',
    icon: <Cancel sx={{ fontSize: 20, color: '#fff' }} />,
    bgColor: '#e1464c',
  },
  {
    key: 'running',
    label: 'RUNNING',
    icon: <Autorenew sx={{ fontSize: 20, color: '#fff' }} />,
    bgColor: '#2196f3',
  },
  {
    key: 'pending',
    label: 'PENDING',
    icon: <MoreHoriz sx={{ fontSize: 20, color: '#fff' }} />,
    bgColor: '#90a4ae',
  },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const { unfilteredCounts } = useDetectionCounts();
  const { connected } = useSocket();
  const [stats, setStats] = useState({
    exams: 0,
    upcomingShifts: 0,
    totalCameras: 0,
    executions: null,
    detectionDistribution: [],
    examStatus: { completed: 0, in_progress: 0, pending: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('24h');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Calculate total detections from context
  const totalDetections = useMemo(() => {
    const total = Object.values(unfilteredCounts).reduce((a, b) => a + b, 0);
    console.log('[Dashboard] Total detections updated:', total, unfilteredCounts);
    return total;
  }, [unfilteredCounts]);

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]);

  const loadDashboardData = async () => {
    try {
      const [adminStatsRes, executionsRes] = await Promise.all([
        dashboardAPI.getAdminStats(timeRange),
        executionsAPI.getStatistics(),
      ]);

      const adminData = adminStatsRes.data.data;

      setStats({
        exams: adminData.active_exams || 0,
        upcomingShifts: adminData.total_shifts || 0,
        totalCameras: adminData.total_cameras || 0,
        executions: executionsRes.data.data,
        detectionDistribution: adminData.detection_distribution || [],
        examStatus: adminData.exam_status || { completed: 0, in_progress: 0, pending: 0 },
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter detection data by category
  const filteredDetectionData = selectedCategory === 'all' 
    ? stats.detectionDistribution 
    : stats.detectionDistribution.filter(item => SCRIPT_CATEGORY_MAP[item.type] === selectedCategory);
  
  // Prepare pie chart data
  const pieData = filteredDetectionData.map(item => ({
    name: DETECTION_TYPE_LABELS[item.type] || item.type,
    value: parseFloat(item.accuracy) || 0,
    count: item.count,
    type: item.type,
    category: SCRIPT_CATEGORY_MAP[item.type] || 'camera',
    color: CATEGORY_COLORS[SCRIPT_CATEGORY_MAP[item.type]] || '#94a3b8',
  }));

  // Calculate average accuracy
  const avgAccuracy = pieData.length > 0 
    ? (pieData.reduce((sum, item) => sum + item.value, 0) / pieData.length).toFixed(1)
    : 0;

  const totalExamTasks = stats.examStatus.completed + stats.examStatus.in_progress + stats.examStatus.pending;

  const executionData = stats.executions
    ? [
      { name: 'COMPLETED', value: stats.executions.completed, color: '#4caf50' },
      { name: 'FAILED', value: stats.executions.failed, color: '#e1464c' },
      { name: 'RUNNING', value: stats.executions.running, color: '#2196f3' },
      { name: 'PENDING', value: stats.executions.pending, color: '#e1e9f3' },
    ]
    : [];

  return (
    <Box>
      {/* Header with Time Range Selector */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.9rem' }}>
          Real-time surveillance execution metrics
        </Typography>
        {/* <FormControl size="small" sx={{ minWidth: 150 }}>
          <Select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            startAdornment={<Schedule sx={{ fontSize: 16, mr: 0.5, color: '#64748b' }} />}
            sx={{
              bgcolor: '#f8fafc',
              border: '1px solid #e2e8f0',
              fontWeight: 600,
              fontSize: '0.85rem',
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
            }}
          >
            <MenuItem value="24h">Last 24 Hours</MenuItem>
            <MenuItem value="7d">Last 7 Days</MenuItem>
            <MenuItem value="30d">Last 30 Days</MenuItem>
            <MenuItem value="90d">Last 3 Months</MenuItem>
            <MenuItem value="all">All Time</MenuItem>
          </Select>
        </FormControl> */}
      </Box>

      <Grid container spacing={2} mb={3}>
        {/* Stats Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="All Exams"
            value={stats.exams}
            icon={<ExamsSvgIcon />}
            color="#3b82f6"
            loading={loading}
            onClick={() => navigate('/exams')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Shifts"
            value={stats.upcomingShifts}
            icon={<ShiftSvgIcon />}
            color="#3b82f6"
            loading={loading}
            onClick={() => navigate('/shifts')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Cameras"
            value={stats.totalCameras}
            icon={<CameraAltIcon />}
            color="#3b82f6"
            loading={loading}
            onClick={() => navigate('/cameras')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Detections"
            value={totalDetections.toLocaleString()}
            icon={<CustomSvgIcon />}
            color="#3b82f6"
            loading={loading}
            onClick={() => navigate('/detections')}
          />
        </Grid>

        {/* Detection Distribution & Exam Status */}
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', boxShadow: 'none' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
                Detection Distribution
              </Typography>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <Select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  sx={{ fontSize: '0.85rem' }}
                >
                  <MenuItem value="all">All Categories</MenuItem>
                  <MenuItem value="people">People</MenuItem>
                  <MenuItem value="movement">Movement</MenuItem>
                  <MenuItem value="camera">Camera</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" height={240}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                <Box display="flex" alignItems="center" justifyContent="center" position="relative" height={240}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  
                  <Box
                    position="absolute"
                    top="50%"
                    left="50%"
                    sx={{ transform: 'translate(-50%, -50%)' }}
                    textAlign="center"
                  >
                    <Typography variant="h4" fontWeight={800} sx={{ color: '#0f172a', fontSize: '1.75rem' }}>
                      {avgAccuracy}%
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em' }}>
                      Avg Accuracy
                    </Typography>
                  </Box>
                </Box>

                <Box display="flex" flexDirection="column" gap={1.5} mt={2} maxHeight={140} sx={{ overflowY: 'auto' }}>
                  {pieData.map((item, index) => (
                    <Box key={index} display="flex" alignItems="center" justifyContent="space-between" gap={2}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: item.color,
                            flexShrink: 0,
                          }}
                        />
                        <Typography variant="body2" sx={{ fontSize: '0.85rem', color: '#64748b' }}>
                          {item.name}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                        {item.value}%
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', boxShadow: 'none' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
                All Exam Status
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.75rem' }}>
                TOTAL: {totalExamTasks}
              </Typography>
            </Box>

            {loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" height={200}>
                <CircularProgress />
              </Box>
            ) : (
              <Box display="flex" flexDirection="column" gap={4}>
                <Box>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                      Completed
                    </Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem', color: '#3b82f6' }}>
                      {stats.examStatus.completed}/{totalExamTasks}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={totalExamTasks > 0 ? (stats.examStatus.completed / totalExamTasks) * 100 : 0}
                    sx={{
                      height: 24,
                      borderRadius: 8,
                      bgcolor: '#e2e8f0',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: '#3b82f6',
                        borderRadius: 8,
                      },
                    }}
                  />
                </Box>

                <Box>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                      In Progress
                    </Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem', color: '#f59e0b' }}>
                      {stats.examStatus.in_progress}/{totalExamTasks}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={totalExamTasks > 0 ? (stats.examStatus.in_progress / totalExamTasks) * 100 : 0}
                    sx={{
                      height: 24,
                      borderRadius: 8,
                      bgcolor: '#e2e8f0',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: '#f59e0b',
                        borderRadius: 8,
                      },
                    }}
                  />
                </Box>

                <Box>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                      Pending
                    </Typography>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem', color: '#64748b' }}>
                      {stats.examStatus.pending}/{totalExamTasks}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={totalExamTasks > 0 ? (stats.examStatus.pending / totalExamTasks) * 100 : 0}
                    sx={{
                      height: 24,
                      borderRadius: 8,
                      bgcolor: '#e2e8f0',
                      '& .MuiLinearProgress-bar': {
                        bgcolor: '#94a3b8',
                        borderRadius: 8,
                      },
                    }}
                  />
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Execution Status Chart */}
        <Grid item xs={12} md={8}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              height: '620px',
              borderRadius: 3,
              boxShadow: 'none',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
                  Execution Status Overview
                </Typography>
                <InfoOutlined sx={{ fontSize: 18, color: '#94a3b8', cursor: 'pointer' }} />
              </Box>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {executionData.map((item) => (
                  <Box key={item.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color }} />
                    <Typography variant="caption" sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b' }}>
                      {item.name}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            {loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" height="300px">
                <CircularProgress />
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height="85%">
                <BarChart data={executionData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fontWeight: 600, fill: '#94a3b8' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.02)' }}
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      boxShadow: 'none',
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={160}>
                    {executionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* Execution Details — Sidebar Card */}
        <Grid item xs={12} md={4}>
          <Paper
            elevation={0}
            sx={{
              p: 3,
              height: '620px',
              borderRadius: 3,
              boxShadow: 'none',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                color: '#0f172a',
              }}
            >
              Execution Details
            </Typography>
            <Typography sx={{ color: '#64748b', mb: 3, fontSize: '0.85rem' }}>
              Live cycle monitoring
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, mt: 1 }}>
              {EXECUTION_DETAIL_ITEMS.map((item) => (
                <Box key={item.key} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: '50%',
                      bgcolor: item.bgColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </Box>
                  <Box>
                    <Typography sx={{ color: '#0f172a', lineHeight: 1.2, fontWeight: 700, fontSize: '1.5rem' }}>
                      {loading ? <CircularProgress size={20} /> : (stats.executions?.[item.key] || 0)}
                    </Typography>
                    <Typography
                      sx={{
                        fontWeight: 600,
                        color: '#64748b',
                        fontSize: '0.85rem',
                      }}
                    >
                      {item.label}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
