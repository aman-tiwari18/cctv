import React, { useState, useEffect, useRef } from 'react';
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
  IconButton,
  Menu,
} from '@mui/material';
import {
  Videocam,
  Schedule,
  Event,
  TrendingUp,
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
  Download,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { clientDashboardAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useDetectionCounts } from '../contexts/DetectionCountsContext';
import { useSocket } from '../contexts/SocketContext';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon';
import { CustomSvgIcon } from '../components/DetectionSvgIcon';
import { ShiftSvgIcon } from '../components/ShiftSvgIcon';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { useNavigate } from 'react-router-dom';


const CATEGORY_COLORS = {
  people: '#3b82f6',
  movement: '#ef4444',
  camera: '#f59e0b',
};

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
  tampering: 'camera',
  blind_spot: 'camera',
  vision: 'camera',
};

const SCRIPT_COLORS = {
  proximity: { bg: '#e5f5ed', color: '#5cb88a' },
  crowd: { bg: '#e9e3f8ff', color: '#e24d7b' },
  crowd_five: { bg: '#fce8e6', color: '#e06050' },
  crowd_zero: { bg: '#edeaf3', color: '#6b5b95' },
  server: { bg: '#f3ebe4', color: '#a0623d' },
  intruder: { bg: '#f0dfefff', color: '#d94466' },
  entry_exit: { bg: '#e0f0f0', color: '#1d7a7d' },
  phone: { bg: '#e8ece5', color: '#465a38' },
  blind_spot: { bg: '#f3f2e4', color: '#b0a850' },
  invigilator: { bg: '#cce8fcff', color: '#00bfcf' },
  inversion: { bg: '#eceef5', color: '#7a86b4' },
  tampering: { bg: '#e9f9ffff', color: '#00c8d4' },
  tamper: { bg: '#e9f9ffff', color: '#00c8d4' },
  vision: { bg: '#dbeafe', color: '#3b82f6' },
};

const SCRIPT_ICONS = {
  proximity: WarningAmber,
  crowd: Groups,
  crowd_five: Groups,
  crowd_zero: PersonOff,
  server: Dns,
  intruder: DirectionsWalk,
  entry_exit: MeetingRoom,
  phone: Smartphone,
  blind_spot: VisibilityOff,
  invigilator: Visibility,
  inversion: FlipCameraAndroid,
  tampering: SecurityUpdateWarning,
  tamper: SecurityUpdateWarning,
  vision: Visibility,
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
  tampering: 'Camera Tampering',
  vision: 'Vision Detection',
};

const StatCard = ({ title, value, icon, color, onClick }) => (
  <Card 
    elevation={0} 
    sx={{ 
      height: '100%', 
      borderRadius: 3, 
      border: '1px solid #e2e8f0', 
      boxShadow: 'none',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.18s ease',
      '&:hover': onClick ? { boxShadow: '0 4px 20px rgba(59,130,246,0.12)', borderColor: '#3b82f6' } : {},
    }}
    onClick={onClick}
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
            {value}
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

const ClientDetectionDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unfilteredCounts } = useDetectionCounts();
  const { connected, setClientExams } = useSocket();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState('all');
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedCameraDate, setSelectedCameraDate] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDetectionExam, setSelectedDetectionExam] = useState('all');
  const [selectedScriptExam, setSelectedScriptExam] = useState('all');
  const [selectedDate, setSelectedDate] = useState('all');
  const [timeRange, setTimeRange] = useState('24h');
  const [cameraAccessibility, setCameraAccessibility] = useState(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [availableShifts, setAvailableShifts] = useState([]);
  const [availableCameraDates, setAvailableCameraDates] = useState([]);
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState(null);

  // Calculate total detections from context
  const totalDetections = Object.values(unfilteredCounts).reduce((a, b) => a + b, 0);

  // Set client exams when dashboard data loads
  useEffect(() => {
    if (dashboardData?.exams) {
      setClientExams(dashboardData.exams.map(e => e.id));
    }
  }, [dashboardData, setClientExams]);

  useEffect(() => {
    loadDashboardData();
  }, [timeRange]); // Reload when time range changes

  // Set default exam to first available exam when data loads
  useEffect(() => {
    if (dashboardData?.exams && dashboardData.exams.length > 0) {
      // Only set default if currently on 'all'
      if (selectedScriptExam === 'all') {
        setSelectedScriptExam(dashboardData.exams[0].id);
      }
    }
  }, [dashboardData]);

  // Get available dates from backend
  const availableDates = dashboardData?.exam_dates || [];
  
  // Get date range for selected exam - show only today or first day
  const getDefaultDateForExam = () => {
    const today = new Date().toISOString().split('T')[0];
    
    if (selectedScriptExam === 'all') {
      // For "All Exams", check if today is in any exam's date range
      const todayInRange = availableDates.includes(today);
      return todayInRange ? today : (availableDates[0] || 'all');
    }
    
    const selectedExamData = (dashboardData?.exams || []).find(e => e.id === parseInt(selectedScriptExam));
    if (!selectedExamData || !selectedExamData.start_date || !selectedExamData.end_date) {
      return 'all';
    }
    
    const start = new Date(selectedExamData.start_date);
    const end = new Date(selectedExamData.end_date);
    const todayDate = new Date(today);
    
    // If today is within the exam date range, return today
    if (todayDate >= start && todayDate <= end) {
      return today;
    }
    
    // Otherwise return the first day of the exam
    return selectedExamData.start_date;
  };

  // Set default date when exam changes
  useEffect(() => {
    const defaultDate = getDefaultDateForExam();
    setSelectedDate(defaultDate);
  }, [selectedScriptExam, dashboardData]);

  useEffect(() => {
    loadCameraAccessibility();
  }, [selectedExam, selectedShift, selectedCameraDate]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await clientDashboardAPI.getStats(timeRange);
      console.log('[ClientDashboard] API Response:', response.data);
      setDashboardData(response.data.data);
    } catch (error) {
      console.error('[ClientDashboard] Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCameraAccessibility = async () => {
    try {
      setCameraLoading(true);
      const params = {};
      if (selectedExam !== 'all') params.exam_id = selectedExam;
      if (selectedShift !== 'all') params.shift_id = selectedShift;
      if (selectedCameraDate !== 'all') params.exam_date = selectedCameraDate;

      const response = await clientDashboardAPI.getCameraAccessibility(params);
      console.log('[CameraAccessibility] API Response:', response.data);
      setCameraAccessibility(response.data.data);
      setAvailableShifts(response.data.data.available_shifts || []);
      setAvailableCameraDates(response.data.data.available_dates || []);
    } catch (error) {
      console.error('[CameraAccessibility] Error:', error);
    } finally {
      setCameraLoading(false);
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
  
  // Filter by selected exam first
  const examFilteredDetectionData = selectedDetectionExam === 'all'
    ? detectionData
    : detectionData.filter(item => {
        // Find which exams have this detection type
        const examHasDetection = (dashboardData.exams || []).some(exam => {
          if (exam.id !== parseInt(selectedDetectionExam)) return false;
          // Check if this exam has detections of this type
          // This is a simplified check - you may need to adjust based on your data structure
          return true;
        });
        return examHasDetection;
      });
  
  // Then filter by selected category
  const filteredDetectionData = selectedCategory === 'all' 
    ? examFilteredDetectionData 
    : examFilteredDetectionData.filter(item => SCRIPT_CATEGORY_MAP[item.type] === selectedCategory);
  
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
    const scriptId = script?.script_id || scriptData.script_type;
    const category = SCRIPT_CATEGORY_MAP[scriptId] || 'camera';
    
    // Use actual script color from SCRIPT_COLORS (main color for dot, bg for boxes)
    const scriptMainColor = SCRIPT_COLORS[scriptId]?.color || CATEGORY_COLORS[category];
    const scriptBgColor = SCRIPT_COLORS[scriptId]?.bg || '#f1f5f9';
    const ScriptIcon = SCRIPT_ICONS[scriptId] || null;
    
    const row = {
      script_name: scriptData.script_name,
      category: category,
      color: scriptMainColor, // for the dot indicator
      bgColor: scriptBgColor, // for the shift boxes
      icon: ScriptIcon, // for the icon before name
      total: scriptData.total,
    };
    
    // Add shift columns
    uniqueShifts.forEach(shift => {
      row[shift] = scriptData.shifts[shift]?.count || 0;
      row[`${shift}_time`] = scriptData.shifts[shift]?.time_range || '';
    });
    
    return row;
  });

  // Get date range for selected exam
  const getDateRangeForExam = () => {
    if (selectedScriptExam === 'all') {
      return availableDates;
    }
    
    const selectedExamData = (dashboardData?.exams || []).find(e => e.id === parseInt(selectedScriptExam));
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

  // Handle camera accessibility download
  const handleDownloadCameraAccessibility = (event) => {
    setDownloadMenuAnchor(event.currentTarget);
  };

  const handleCloseDownloadMenu = () => {
    setDownloadMenuAnchor(null);
  };

  const handleDownloadOption = async (type) => {
    try {
      const params = {
        type, // 'accessible', 'non_accessible', or 'all'
      };
      if (selectedExam !== 'all') params.exam_id = selectedExam;
      if (selectedShift !== 'all') params.shift_id = selectedShift;
      if (selectedCameraDate !== 'all') params.exam_date = selectedCameraDate;

      await clientDashboardAPI.downloadCameraAccessibility(params);
    } catch (error) {
      console.error('[CameraAccessibility] Download error:', error);
    } finally {
      handleCloseDownloadMenu();
    }
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

      {/* Top Stats Cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="All Exams"
            value={dashboardData.active_exams || 0}
            icon={<ExamsSvgIcon />}
            color="#3b82f6"
            onClick={() => navigate('/exams')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Total Cameras"
            value={dashboardData.total_cameras || 0}
            icon={<CameraAltIcon />}
            color="#3b82f6"
            onClick={() => navigate('/cameras')}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <StatCard
            title="Total Detections"
            value={totalDetections.toLocaleString()}
            icon={<CustomSvgIcon />}
            color="#3b82f6"
            onClick={() => navigate('/detections')}
          />
        </Grid>
      </Grid>

      {/* First Row: Camera Accessibility & Exam Status */}
      <Grid container spacing={3} mb={3}>
        {/* Camera Accessibility */}
        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', boxShadow: 'none' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Box>
                <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
                  Camera Accessibility
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                  Live operational status monitoring
                </Typography>
              </Box>
              <Box
                onClick={handleDownloadCameraAccessibility}
                sx={{
                  bgcolor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 2,
                  px: 2,
                  py: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  cursor: 'pointer',
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                <Download sx={{ fontSize: 18, color: '#64748b' }} />
                <Typography variant="body2" sx={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>
                  Download
                </Typography>
              </Box>
              <Menu
                anchorEl={downloadMenuAnchor}
                open={Boolean(downloadMenuAnchor)}
                onClose={handleCloseDownloadMenu}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'right',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'right',
                }}
                PaperProps={{
                  sx: {
                    maxHeight: 200,
                    overflowY: 'auto',
                  }
                }}
              >
                <MenuItem onClick={() => handleDownloadOption('accessible')}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} />
                    <Typography variant="body2">Download Accessible</Typography>
                  </Box>
                </MenuItem>
                <MenuItem onClick={() => handleDownloadOption('non_accessible')}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef4444' }} />
                    <Typography variant="body2">Download Non-accessible</Typography>
                  </Box>
                </MenuItem>
                <MenuItem onClick={() => handleDownloadOption('all')}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#64748b' }} />
                    <Typography variant="body2">Download All</Typography>
                  </Box>
                </MenuItem>
              </Menu>
            </Box>

            <Box display="flex" gap={1} mb={3}>
              <FormControl size="small" sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: '#64748b', mb: 0.5, textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 600 }}>
                  EXAM
                </Typography>
                <Select
                  value={selectedExam}
                  onChange={(e) => {
                    setSelectedExam(e.target.value);
                    setSelectedShift('all');
                    setSelectedCameraDate('all');
                  }}
                  sx={{ fontSize: '0.85rem', bgcolor: '#f8fafc' }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        maxHeight: 250,
                        overflowY: 'auto',
                      }
                    }
                  }}
                >
                  <MenuItem value="all">All Exams</MenuItem>
                  {(dashboardData?.exams || []).map(exam => (
                    <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: '#64748b', mb: 0.5, textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 600 }}>
                  SHIFT
                </Typography>
                <Select
                  value={selectedShift}
                  onChange={(e) => setSelectedShift(e.target.value)}
                  sx={{ fontSize: '0.85rem', bgcolor: '#f8fafc' }}
                  disabled={selectedExam === 'all'}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        maxHeight: 250,
                        overflowY: 'auto',
                      }
                    }
                  }}
                >
                  <MenuItem value="all">All Shifts</MenuItem>
                  {availableShifts.map(shift => (
                    <MenuItem key={shift.id} value={shift.id}>{shift.shift_name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ flex: 1 }}>
                <Typography variant="caption" sx={{ color: '#64748b', mb: 0.5, textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 600 }}>
                  DATE
                </Typography>
                <Select
                  value={selectedCameraDate}
                  onChange={(e) => setSelectedCameraDate(e.target.value)}
                  sx={{ fontSize: '0.85rem', bgcolor: '#f8fafc' }}
                  disabled={selectedExam === 'all'}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        maxHeight: 250,
                        overflowY: 'auto',
                      }
                    }
                  }}
                >
                  <MenuItem value="all">All Dates</MenuItem>
                  {availableCameraDates.map(date => (
                    <MenuItem key={date} value={date}>{formatDate(date)}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            {cameraLoading ? (
              <Box display="flex" justifyContent="center" alignItems="center" height={250}>
                <CircularProgress />
              </Box>
            ) : (
              <>
                <Box display="flex" alignItems="center" justifyContent="center" position="relative" height={250}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Accessible', value: cameraAccessibility?.accessible_percent || 0, color: '#10b981' },
                          { name: 'Non-accessible', value: cameraAccessibility?.non_accessible_percent || 0, color: '#ef4444' }
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={100}
                        paddingAngle={0}
                        dataKey="value"
                        startAngle={90}
                        endAngle={450}
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#ef4444" />
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
                    <Typography variant="h5" fontWeight={700} sx={{ color: '#0f172a' }}>
                      {cameraAccessibility?.total_cameras || 0}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 600 }}>
                      TOTAL UNITS
                    </Typography>
                  </Box>
                </Box>

                <Grid container spacing={2} mt={1}>
                  <Grid item xs={6}>
                    <Box
                      sx={{
                        bgcolor: '#f0fdf4',
                        borderRadius: 2,
                        p: 2,
                        border: '1px solid #bbf7d0',
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: '#10b981',
                          }}
                        />
                        <Typography variant="body2" fontWeight={600} sx={{ color: '#10b981', fontSize: '0.85rem' }}>
                          Accessible
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: '#059669', fontSize: '0.85rem', fontWeight: 600 }}>
                        {cameraAccessibility?.accessible || 0} Units ({cameraAccessibility?.accessible_percent || 0}%)
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={6}>
                    <Box
                      sx={{
                        bgcolor: '#fef2f2',
                        borderRadius: 2,
                        p: 2,
                        border: '1px solid #fecaca',
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <Box
                          sx={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            bgcolor: '#ef4444',
                          }}
                        />
                        <Typography variant="body2" fontWeight={600} sx={{ color: '#ef4444', fontSize: '0.85rem' }}>
                          Non-accessible
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>
                        {cameraAccessibility?.non_accessible || 0} Units ({cameraAccessibility?.non_accessible_percent || 0}%)
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </>
            )}
          </Paper>
        </Grid>

        {/* Exam Status */}
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', boxShadow: 'none' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
                All Exam Status
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.75rem' }}>
                TOTAL: {totalExamTasks}
              </Typography>
            </Box>

            <Box display="flex" flexDirection="column" gap={4}>
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
                    {examStatus.in_progress}/{totalExamTasks}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={totalExamTasks > 0 ? (examStatus.in_progress / totalExamTasks) * 100 : 0}
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
                    {examStatus.pending}/{totalExamTasks}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={totalExamTasks > 0 ? (examStatus.pending / totalExamTasks) * 100 : 0}
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
          </Paper>
        </Grid>
      </Grid>

      {/* Second Row: Script Distribution & Detection Distribution */}
      <Grid container spacing={3}>
        {/* Script Distribution */}
        <Grid item xs={12} md={7}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', boxShadow: 'none' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
            Script Distribution
          </Typography>
          <Box display="flex" gap={1}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <Select
                value={selectedScriptExam}
                onChange={(e) => setSelectedScriptExam(e.target.value)}
                sx={{ fontSize: '0.85rem' }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      maxHeight: 250,
                      overflowY: 'auto',
                    }
                  }
                }}
              >
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
                MenuProps={{
                  PaperProps: {
                    sx: {
                      maxHeight: 250,
                      overflowY: 'auto',
                    }
                  }
                }}
              >
                <MenuItem value="all">All Dates</MenuItem>
                {filteredDates.map((date, index) => (
                  <MenuItem key={index} value={date}>
                    {formatDate(date)}
                  </MenuItem>
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
        <Box sx={{ maxHeight: 380, overflowY: 'auto' }}>
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
                {script.icon && React.createElement(script.icon, {
                  sx: { fontSize: 16, color: script.color, flexShrink: 0 }
                })}
                <Typography 
                  sx={{ 
                    fontSize: '0.8rem', 
                    color: '#475569', 
                    fontWeight: 500,
                  }}
                >
                  {script.script_name.replace(/\s*detection\s*/gi, '').trim()}
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
                        bgcolor: hasValue ? script.bgColor : '#f1f5f9',
                        borderRadius: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        p: 1,
                        position: 'relative',
                        border: hasValue ? `1px solid ${script.color}20` : '1px solid transparent',
                      }}
                    >
                      {hasValue && (
                        <>
                          <Typography 
                            sx={{ 
                              fontSize: '0.65rem', 
                              color: script.color,
                              fontWeight: 700,
                              mb: 0.3,
                            }}
                          >
                            {timeRange}
                          </Typography>
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
        </Grid>

        {/* Detection Distribution */}
        <Grid item xs={12} md={5}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', boxShadow: 'none' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>
                Detection Distribution
              </Typography>
              <Box display="flex" gap={1}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <Select
                    value={selectedDetectionExam}
                    onChange={(e) => setSelectedDetectionExam(e.target.value)}
                    sx={{ fontSize: '0.85rem' }}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          maxHeight: 250,
                          overflowY: 'auto',
                        }
                      }
                    }}
                  >
                    <MenuItem value="all">All Exams</MenuItem>
                    {(dashboardData.exams || []).map(exam => (
                      <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <Select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    sx={{ fontSize: '0.85rem' }}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          maxHeight: 250,
                          overflowY: 'auto',
                        }
                      }
                    }}
                  >
                    <MenuItem value="all">All Categories</MenuItem>
                    <MenuItem value="people">People</MenuItem>
                    <MenuItem value="movement">Movement</MenuItem>
                    <MenuItem value="camera">Camera</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>

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
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default ClientDetectionDashboard;
