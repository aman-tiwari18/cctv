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
  FormControl,
  Select,
  MenuItem,
  LinearProgress,
} from '@mui/material';
import {
  Description,
  Videocam,
  Schedule,
  Event,
  TrendingUp,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { clientDashboardAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const CATEGORY_COLORS = {
  people: '#3b82f6',
  movement: '#ef4444',
  camera: '#f59e0b',
};

// Script type to category mapping (from ShiftScriptManager)
const SCRIPT_CATEGORY_MAP = {
  proximity: 'people',
  crowd: 'people',
  crowd_five: 'people',
  crowd_zero: 'people',
  invigilator: 'people',
  phone: 'people',
  server: 'people',
  intruder: 'people',
  entry_exit: 'movement',
  inversion: 'camera',
  tamper: 'camera',
  blind_spot: 'camera',
};

const DETECTION_TYPE_LABELS = {
  proximity: 'Close Proximity',
  crowd: 'Crowd Detection',
  crowd_five: 'Crowd < 5',
  crowd_zero: 'Zero Person',
  server: 'Server Room',
  intruder: 'Intruder',
  entry_exit: 'Entry/Exit',
  phone: 'Phone',
  blind_spot: 'Blind Spot',
  invigilator: 'Invigilator',
  inversion: 'Camera Inversion',
  tamper: 'Camera Tampering',
};

const StatCard = ({ title, value, icon, color }) => (
  <Card elevation={0} sx={{ height: '100%', borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
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
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedScriptExam, setSelectedScriptExam] = useState('all');
  const [selectedDate, setSelectedDate] = useState('all');

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Reset date when exam selection changes
  useEffect(() => {
    setSelectedDate('all');
  }, [selectedScriptExam]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await clientDashboardAPI.getStats();
      console.log('[ClientDashboard] API Response:', response.data);
      setDashboardData(response.data.data);
    } catch (error) {
      console.error('[ClientDashboard] Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress size={48} />
      </Box>
    );
  }

  if (!dashboardData) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <Typography variant="h6" color="text.secondary">
          No data available
        </Typography>
      </Box>
    );
  }

  // Helper functions
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };
  
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    return timeStr.substring(0, 5); // HH:MM
  };

  // Get all available scripts from backend
  const allAvailableScripts = dashboardData.all_scripts || [];

  // Prepare detection distribution data
  const detectionData = dashboardData.detection_distribution || [];
  
  // Filter by selected category
  const filteredDetectionData = selectedCategory === 'all' 
    ? detectionData 
    : detectionData.filter(item => SCRIPT_CATEGORY_MAP[item.type] === selectedCategory);
  
  const totalDetections = filteredDetectionData.reduce((sum, item) => sum + item.count, 0);
  
  // Group detections by type for pie chart with accuracy
  const pieData = filteredDetectionData.map(item => ({
    name: DETECTION_TYPE_LABELS[item.type] || item.type,
    value: parseFloat(item.accuracy) || 0,
    count: item.count,
    pushed_count: item.pushed_count,
    removed_count: item.removed_count,
    type: item.type,
    category: SCRIPT_CATEGORY_MAP[item.type] || 'camera',
    color: CATEGORY_COLORS[SCRIPT_CATEGORY_MAP[item.type]] || '#94a3b8',
  }));

  // Calculate average accuracy for center display
  const avgAccuracy = pieData.length > 0 
    ? (pieData.reduce((sum, item) => sum + item.value, 0) / pieData.length).toFixed(1)
    : 0;

  // Prepare exam status data
  const examStatus = dashboardData.exam_status || { completed: 0, in_progress: 0, pending: 0 };
  const totalExamTasks = examStatus.completed + examStatus.in_progress + examStatus.pending;

  // Prepare script distribution data - organize by script instead of by shift
  const scriptDistribution = dashboardData.script_distribution || [];
  
  // Filter by selected exam and date
  const filteredScriptDistribution = scriptDistribution.filter(shift => {
    if (selectedScriptExam !== 'all' && shift.exam_id !== parseInt(selectedScriptExam)) return false;
    if (selectedDate !== 'all') {
      const hasMatchingDate = shift.scripts.some(s => s.assignment_date === selectedDate);
      if (!hasMatchingDate) return false;
    }
    return true;
  });
  
  // Get all scheduled scripts with their details
  const scheduledScripts = filteredScriptDistribution.flatMap(shift => 
    (selectedDate === 'all' 
      ? shift.scripts 
      : shift.scripts.filter(s => s.assignment_date === selectedDate)
    ).map(script => ({
      ...script,
      shift_name: shift.shift_name,
      exam_name: shift.exam_name,
    }))
  );
  
  // Group scripts by script_name and count occurrences per shift
  const scriptShiftMap = {};
  scheduledScripts.forEach(script => {
    if (!scriptShiftMap[script.script_name]) {
      scriptShiftMap[script.script_name] = {
        script_name: script.script_name,
        script_type: script.script_type,
        shifts: {},
        total: 0,
      };
    }
    const shiftKey = script.shift_name;
    if (!scriptShiftMap[script.script_name].shifts[shiftKey]) {
      scriptShiftMap[script.script_name].shifts[shiftKey] = {
        count: 0,
        time_range: null,
      };
    }
    scriptShiftMap[script.script_name].shifts[shiftKey].count++;
    scriptShiftMap[script.script_name].shifts[shiftKey].time_range = 
      `${formatTime(script.custom_start_time)} - ${formatTime(script.custom_end_time)}`;
    scriptShiftMap[script.script_name].total++;
  });
  
  // Get unique shift names for columns
  const uniqueShifts = [...new Set(scheduledScripts.map(s => s.shift_name))].sort();
  
  // Create data for horizontal bar chart (one row per script) - only scheduled scripts
  const scriptBarData = Object.values(scriptShiftMap).map(scriptData => {
    const script = allAvailableScripts.find(s => s.name === scriptData.script_name);
    const category = SCRIPT_CATEGORY_MAP[script?.script_id || scriptData.script_type] || 'camera';
    
    const row = {
      script_name: scriptData.script_name,
      category: category,
      color: CATEGORY_COLORS[category],
      total: scriptData.total,
    };
    
    // Add shift columns
    uniqueShifts.forEach(shift => {
      row[shift] = scriptData.shifts[shift]?.count || 0;
      row[`${shift}_time`] = scriptData.shifts[shift]?.time_range || '';
    });
    
    return row;
  });

  // Get available dates from backend
  const availableDates = dashboardData.exam_dates || [];
  
  // Get date range for selected exam
  const getDateRangeForExam = () => {
    if (selectedScriptExam === 'all') {
      return availableDates;
    }
    
    const selectedExamData = (dashboardData.exams || []).find(e => e.id === parseInt(selectedScriptExam));
    if (!selectedExamData || !selectedExamData.start_date || !selectedExamData.end_date) {
      return availableDates;
    }
    
    // Generate dates between start_date and end_date
    const dates = [];
    const start = new Date(selectedExamData.start_date);
    const end = new Date(selectedExamData.end_date);
    const current = new Date(start);
    
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }
    
    return dates;
  };
  
  const filteredDates = getDateRangeForExam();
  
  // Get date range label for dropdown
  const getDateRangeLabel = () => {
    if (selectedScriptExam === 'all') {
      return 'All Dates';
    }
    
    const selectedExamData = (dashboardData.exams || []).find(e => e.id === parseInt(selectedScriptExam));
    if (!selectedExamData || !selectedExamData.start_date || !selectedExamData.end_date) {
      return 'All Dates';
    }
    
    return `${formatDate(selectedExamData.start_date)} to ${formatDate(selectedExamData.end_date)}`;
  };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ color: '#0f172a', mb: 0.5 }}>
            Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.9rem' }}>
            {user?.role === 'ADMIN' 
              ? 'Deep-dive analysis of behavioral triggers and crowd patterns.'
              : user?.company_name === 'EY'
              ? 'Analytics for SSC and TCS exams'
              : `Analytics for ${user?.company_name || 'your company'}`
            }
          </Typography>
        </Box>
        <Chip
          icon={<Schedule sx={{ fontSize: 16 }} />}
          label="Last 24 Hours"
          sx={{
            bgcolor: '#f8fafc',
            border: '1px solid #e2e8f0',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        />
      </Box>

      {/* Top Stats Cards */}
      <Grid container spacing={2.5} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Exams"
            value={dashboardData.active_exams || 0}
            icon={<Event />}
            color="#3b82f6"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Shifts"
            value={dashboardData.total_shifts || 0}
            icon={<Schedule />}
            color="#8b5cf6"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Camera"
            value={dashboardData.total_cameras || 0}
            icon={<Videocam />}
            color="#06b6d4"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Detection"
            value={(dashboardData.total_detections || 0).toLocaleString()}
            icon={<TrendingUp />}
            color="#10b981"
          />
        </Grid>
      </Grid>

      {/* Middle Section: Detection Distribution & Exam Status */}
      <Grid container spacing={3} mb={4}>
        {/* Detection Distribution */}
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', boxShadow: 'none' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
                Detection Distribution
              </Typography>
              <Box display="flex" gap={1}>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                  <Select
                    value={selectedExam}
                    onChange={(e) => setSelectedExam(e.target.value)}
                    sx={{ fontSize: '0.85rem' }}
                  >
                    <MenuItem value="all">All Exams</MenuItem>
                    {(dashboardData.exams || []).map(exam => (
                      <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
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
            </Box>

            <Box display="flex" alignItems="center" justifyContent="center" position="relative" height={300}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={120}
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
              
              {/* Center Text */}
              <Box
                position="absolute"
                top="50%"
                left="50%"
                sx={{ transform: 'translate(-50%, -50%)' }}
                textAlign="center"
              >
                <Typography variant="h3" fontWeight={700} sx={{ color: '#0f172a' }}>
                  {avgAccuracy}%
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                  Avg Accuracy
                </Typography>
              </Box>
            </Box>

            {/* Legend */}
            <Box display="flex" flexDirection="column" gap={1.5} mt={2} maxHeight={120} sx={{ overflowY: 'auto' }}>
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
          </Paper>
        </Grid>

        {/* All Exam Status */}
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

            <Box display="flex" flexDirection="column" gap={3}>
              {/* Completed */}
              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                    Completed
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem', color: '#3b82f6' }}>
                    {examStatus.completed}/{totalExamTasks}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={totalExamTasks > 0 ? (examStatus.completed / totalExamTasks) * 100 : 0}
                  sx={{
                    height: 16,
                    borderRadius: 8,
                    bgcolor: '#e2e8f0',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: '#3b82f6',
                      borderRadius: 8,
                    },
                  }}
                />
              </Box>

              {/* In Progress */}
              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                    In Progress
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem', color: '#f59e0b' }}>
                    {examStatus.in_progress}/{totalExamTasks}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={totalExamTasks > 0 ? (examStatus.in_progress / totalExamTasks) * 100 : 0}
                  sx={{
                    height: 16,
                    borderRadius: 8,
                    bgcolor: '#e2e8f0',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: '#f59e0b',
                      borderRadius: 8,
                    },
                  }}
                />
              </Box>

              {/* Pending */}
              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>
                    Pending
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem', color: '#64748b' }}>
                    {examStatus.pending}/{totalExamTasks}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={totalExamTasks > 0 ? (examStatus.pending / totalExamTasks) * 100 : 0}
                  sx={{
                    height: 16,
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
          </Paper>
        </Grid>
      </Grid>

      {/* Bottom Section: Script Distribution */}
      <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
            Script Distribution
          </Typography>
          <Box display="flex" gap={1}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select
                value={selectedScriptExam}
                onChange={(e) => setSelectedScriptExam(e.target.value)}
                sx={{ fontSize: '0.85rem' }}
              >
                <MenuItem value="all">All Exams</MenuItem>
                {(dashboardData.exams || []).map(exam => (
                  <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                sx={{ fontSize: '0.85rem' }}
                displayEmpty
              >
                <MenuItem value="all">{getDateRangeLabel()}</MenuItem>
                {filteredDates.map(date => (
                  <MenuItem key={date} value={date}>{formatDate(date)}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </Box>

        {/* Shift Headers */}
        {uniqueShifts.length > 0 && (
          <Box display="flex" mb={2}>
            <Box sx={{ width: 200, flexShrink: 0 }} />
            <Box display="flex" flex={1} gap={2} justifyContent="space-around">
              {uniqueShifts.map((shift, index) => (
                <Typography 
                  key={index} 
                  variant="caption" 
                  sx={{ 
                    fontWeight: 700, 
                    color: '#64748b', 
                    textTransform: 'uppercase',
                    fontSize: '0.7rem',
                    textAlign: 'center',
                    flex: 1,
                  }}
                >
                  {shift}
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {/* Script Rows */}
        <Box sx={{ maxHeight: 500, overflowY: 'auto' }}>
          {scriptBarData.map((script, index) => (
            <Box 
              key={index} 
              display="flex" 
              alignItems="center" 
              mb={1.5}
            >
              {/* Script Name */}
              <Box 
                sx={{ 
                  width: 200, 
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: script.color,
                    flexShrink: 0,
                  }}
                />
                <Typography 
                  sx={{ 
                    fontSize: '0.8rem', 
                    color: '#475569', 
                    fontWeight: 500,
                  }}
                >
                  {script.script_name}
                </Typography>
              </Box>

              {/* Shift Boxes */}
              <Box display="flex" flex={1} gap={2} justifyContent="space-around">
                {uniqueShifts.map((shift, shiftIndex) => {
                  const count = script[shift] || 0;
                  const timeRange = script[`${shift}_time`] || '';
                  const hasValue = count > 0;
                  
                  return (
                    <Box 
                      key={shiftIndex}
                      sx={{
                        flex: 1,
                        minHeight: 50,
                        bgcolor: hasValue ? script.color : '#f1f5f9',
                        borderRadius: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        p: 1,
                        position: 'relative',
                      }}
                    >
                      {hasValue && (
                        <>
                          <Typography 
                            sx={{ 
                              fontSize: '0.65rem', 
                              color: '#fff',
                              fontWeight: 600,
                              mb: 0.3,
                            }}
                          >
                            {timeRange}
                          </Typography>
                          {/* <Typography 
                            sx={{ 
                              fontSize: '0.75rem', 
                              color: '#fff',
                              fontWeight: 700,
                            }}
                          >
                            {count}
                          </Typography> */}
                        </>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>

        {scriptBarData.length === 0 && (
          <Box display="flex" alignItems="center" justifyContent="center" py={8}>
            <Typography variant="body2" color="text.secondary">
              No scripts available
            </Typography>
          </Box>
        )}

        {uniqueShifts.length === 0 && scriptBarData.length > 0 && (
          <Box display="flex" alignItems="center" justifyContent="center" py={8}>
            <Typography variant="body2" color="text.secondary">
              No script assignments for the selected filters
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default ClientDetectionDashboard;
