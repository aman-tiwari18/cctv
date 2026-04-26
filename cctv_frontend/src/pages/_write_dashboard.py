import os

with open("/home/aman/Desktop/cctv/cctv_frontend/src/pages/ClientDetectionDashboard.jsx", "w") as f:
    f.write("""import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Menu,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  TextField,
  InputAdornment,
  Tooltip,
  IconButton,
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
  Search,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  ChevronRight,
} from '@mui/icons-material';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartTooltip } from 'recharts';
import { clientDashboardAPI, examsAPI, camerasAPI, shiftsAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useDetectionCounts } from '../contexts/DetectionCountsContext';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon';
import { CustomSvgIcon } from '../components/DetectionSvgIcon';
import { ShiftSvgIcon } from '../components/ShiftSvgIcon';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarTodayOutlined } from '@mui/icons-material';

// ─── Constants ───────────────────────────────────────────────

const CATEGORY_COLORS = {
  people: '#3b82f6',
  movement: '#ef4444',
  camera: '#f59e0b',
};

const SCRIPT_CATEGORY_MAP = {
  proximity: 'people', crowd: 'people', crowd_five: 'people',
  crowd_zero: 'people', invigilator: 'people', phone: 'people',
  server: 'people', intruder: 'people', entry_exit: 'movement',
  inversion: 'camera', tamper: 'camera', tampering: 'camera',
  blind_spot: 'camera', vision: 'camera',
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
  proximity: WarningAmber, crowd: Groups, crowd_five: Groups,
  crowd_zero: PersonOff, server: Dns, intruder: DirectionsWalk,
  entry_exit: MeetingRoom, phone: Smartphone, blind_spot: VisibilityOff,
  invigilator: Visibility, inversion: FlipCameraAndroid,
  tampering: SecurityUpdateWarning, tamper: SecurityUpdateWarning, vision: Visibility,
};

const DETECTION_TYPE_LABELS = {
  proximity: 'Close Proximity', crowd: 'Crowd Detection', crowd_five: 'Crowd < 5',
  crowd_zero: 'Zero Person', server: 'Server Room', intruder: 'Intruder',
  entry_exit: 'Entry/Exit', phone: 'Phone', blind_spot: 'Blind Spot',
  invigilator: 'Invigilator', inversion: 'Camera Inversion',
  tamper: 'Camera Tampering', tampering: 'Camera Tampering', vision: 'Vision Detection',
};

// ─── Helpers ─────────────────────────────────────────────────

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const formatDateV1 = (date) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const formatTime = (timeStr) => (timeStr ? timeStr.substring(0, 5) : '');

const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const truncate = (str, n = 40) => str && str.length > n ? str.slice(0, n) + '…' : str;

const parseDDMMYYYYToISO = (value) => {
  if (!value) return '';
  const match = /^([0-3]\d)-([0-1]\d)-(\d{4})$/.exec(value);
  if (!match) return value;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
};

// ─── StatCard ────────────────────────────────────────────────

const StatCard = ({ title, value, icon, color, onClick }) => (
  <Card
    elevation={0}
    sx={{
      height: '100%', borderRadius: 3, border: '1px solid #e2e8f0',
      boxShadow: 'none', cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.18s ease',
      '&:hover': onClick ? { boxShadow: '0 4px 20px rgba(59,130,246,0.12)', borderColor: '#3b82f6' } : {},
    }}
    onClick={onClick}
  >
    <CardContent sx={{ p: 0, height: '100%', '&:last-child': { pb: 0 } }}>
      <Box display="flex" justifyContent="space-between" alignItems="stretch" height="100%">
        <Box flex={1} display="flex" flexDirection="column" justifyContent="center" sx={{ p: 2 }}>
          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: '0.7rem' }}>
            {title}
          </Typography>
          <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, color: '#0f172a' }}>
            {value}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', pr: 2, py: 2 }}>
          <Box sx={{ backgroundColor: `${color}18`, borderRadius: 2, width: 70, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {React.cloneElement(icon, { sx: { fontSize: 40, color } })}
          </Box>
        </Box>
      </Box>
    </CardContent>
  </Card>
);

// ─── ExamCard (view-only) ─────────────────────────────────────

const ViewOnlyExamCard = ({ exam, examCounts, navigate }) => {
  const isHLS = exam.link_type === 'HLS';
  const now = new Date();
  const examStart = exam.start_date ? new Date(exam.start_date) : null;
  const examEnd = exam.end_date ? new Date(exam.end_date) : null;
  const isLive = examStart && examEnd && now >= examStart && now <= examEnd;

  const skipDays = exam.skip_days || [];
  const skipDates = (exam.skip_dates || []).map(d => d.toString());
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let totalDays = 0, validDays = 0;
  if (exam.start_date && exam.end_date) {
    const current = new Date(exam.start_date);
    const end = new Date(exam.end_date);
    while (current <= end) {
      totalDays++;
      const dateStr = current.toISOString().split('T')[0];
      const dayName = dayNames[current.getDay()];
      if (!skipDays.includes(dayName) && !skipDates.includes(dateStr)) validDays++;
      current.setDate(current.getDate() + 1);
    }
  }

  return (
    <Box
      sx={{
        bgcolor: '#fff', border: '1px solid #f8fafc',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)', borderRadius: 4,
        p: 3, py: 3.5, height: '100%', minHeight: 380, maxWidth: 530,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Typography sx={{ fontWeight: 600, fontSize: '1.5rem', color: '#0f172a', lineHeight: 1.25, pr: 1, flex: 1 }}>
          {exam.exam_name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Chip
            label={exam.link_type}
            size="small"
            sx={{ fontWeight: 800, fontSize: '0.75rem', height: 26, px: 0.5, borderRadius: '16px', flexShrink: 0, bgcolor: isHLS ? '#3c81f6' : '#e0e7ff', color: isHLS ? '#fff' : '#3c81f6' }}
          />
          {isLive && (
            <Chip
              icon={<Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#10b981', animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } } }} />}
              label="LIVE"
              size="small"
              sx={{ fontWeight: 800, fontSize: '0.7rem', height: 26, px: 1, borderRadius: '16px', flexShrink: 0, bgcolor: '#fff', color: '#06875eff', '& .MuiChip-icon': { ml: 0.5 } }}
            />
          )}
        </Box>
      </Box>

      <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, letterSpacing: '0.01em', textTransform: 'uppercase', color: '#94a3b8', mb: 1 }}>
        Exam Body: {exam.exam_body}
      </Typography>

      <Box sx={{ bgcolor: '#f1f5f9', borderRadius: 3, p: 2, mb: 2.5 }}>
        {exam.start_date && exam.end_date && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.2 }}>
            <CalendarTodayOutlined sx={{ fontSize: 18, color: '#676e80', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.97rem', fontWeight: 600, color: '#676e80' }}>
              {formatDateV1(exam.start_date)} - {formatDateV1(exam.end_date)}
            </Typography>
          </Box>
        )}
        {totalDays > 0 && (
          <>
            <Box sx={{ display: 'flex', gap: 2.5, mb: 0.9 }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8' }}>Total Days-{totalDays}</Typography>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8' }}>Skipped Days-{totalDays - validDays}</Typography>
            </Box>
            {(exam.skip_days?.length > 0 || exam.skip_dates?.length > 0) && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.7 }}>
                {exam.skip_days?.map((day) => (
                  <Chip key={day} label={day.substring(0, 3)} size="small" sx={{ height: 24, fontSize: '0.72rem', fontWeight: 700, color: '#676e80', bgcolor: '#fff', borderRadius: '8px' }} />
                ))}
                {exam.skip_dates?.length > 0 && (
                  <Chip label={`+${exam.skip_dates.length} dates`} size="small" sx={{ height: 24, fontSize: '0.72rem', fontWeight: 700, color: '#1d4ed8', bgcolor: '#dbeafe', borderRadius: '8px' }} />
                )}
              </Box>
            )}
          </>
        )}
      </Box>

      {exam.examShifts?.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {exam.examShifts.map((shift) => (
            <Chip
              key={shift.id}
              icon={<ShiftSvgIcon sx={{ fontSize: '15px !important' }} />}
              label={`${shift.shift_name} (${shift.start_time?.substring(0, 5)} - ${shift.end_time?.substring(0, 5)})`}
              sx={{ bgcolor: '#fff', color: '#3c81f6', borderRadius: '12px', fontWeight: 600, fontSize: '0.68rem', border: '1px solid #e2e8f0', height: 30, px: 0.5, '& .MuiChip-icon': { color: '#2563eb' } }}
            />
          ))}
        </Box>
      )}

      <Box sx={{ flex: 1 }} />

      {/* Bottom row: only camera + detection icons */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, pt: 2, mt: 2 }}>
        <Box
          onClick={() => navigate(`/client-dashboard?tab=cameras&exam=${exam.id}`)}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.8, cursor: 'pointer', '&:hover': { opacity: 0.75, color: '#3c81f6' } }}
        >
          <CameraAltIcon sx={{ fontSize: 20, color: '#8b929cff' }} />
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: '#475569', '&:hover': { color: '#3c81f6' } }}>
            {String(exam.camera_count || 0).padStart(2, '0')}
          </Typography>
        </Box>
        <Box
          onClick={() => navigate(`/client-detections?exam_id=${exam.id}`)}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.8, cursor: 'pointer', '&:hover': { opacity: 0.75, color: '#3c81f6' } }}
        >
          <ReportProblemIcon sx={{ fontSize: 20, color: '#8b929cff' }} />
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#333', '&:hover': { color: '#3c81f6' } }}>
            {String(examCounts[exam.id]?.detections || 0).padStart(2, '0')}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

// ─── Main Component ───────────────────────────────────────────

const ClientDetectionDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { unfilteredCounts } = useDetectionCounts();

  // Tab
  const initialTab = searchParams.get('tab') === 'exams' ? 1 : searchParams.get('tab') === 'cameras' ? 2 : 0;
  const [activeTab, setActiveTab] = useState(initialTab);

  // ── Dashboard data ──
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState('all');
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedCameraDate, setSelectedCameraDate] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDetectionExam, setSelectedDetectionExam] = useState('all');
  const [selectedScriptExam, setSelectedScriptExam] = useState('all');
  const [selectedDate, setSelectedDate] = useState('all');
  const [timeRange] = useState('24h');
  const [cameraAccessibility, setCameraAccessibility] = useState(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [availableShifts, setAvailableShifts] = useState([]);
  const [availableCameraDates, setAvailableCameraDates] = useState([]);
  const [downloadMenuAnchor, setDownloadMenuAnchor] = useState(null);
  const liveDetectionCount = Object.values(unfilteredCounts).reduce((sum, count) => sum + count, 0);

  // ── Exams tab ──
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examCounts, setExamCounts] = useState({});

  // ── Cameras tab ──
  const [camSidebarOpen, setCamSidebarOpen] = useState(true);
  const [camExams, setCamExams] = useState([]);
  const [selectedCamExamId, setSelectedCamExamId] = useState(searchParams.get('exam') || '');
  const [cameras, setCameras] = useState([]);
  const [camLoading, setCamLoading] = useState(false);
  const [camExamLinkType, setCamExamLinkType] = useState(null);
  const [camStatusCounts, setCamStatusCounts] = useState({ accessible: 0, notAccessible: 0, unknown: 0 });
  const [camSearchQuery, setCamSearchQuery] = useState('');
  const [camDebouncedSearch, setCamDebouncedSearch] = useState('');
  const [camOrderBy, setCamOrderBy] = useState('');
  const [camOrder, setCamOrder] = useState('asc');
  const [camPage, setCamPage] = useState(0);
  const [camRowsPerPage, setCamRowsPerPage] = useState(50);
  const [camTotal, setCamTotal] = useState(0);
  const [camFilterShiftId, setCamFilterShiftId] = useState('');
  const [camFilterExamDate, setCamFilterExamDate] = useState('');

  // ── Load dashboard ──
  useEffect(() => { loadDashboardData(); }, [timeRange]);

  useEffect(() => {
    if (dashboardData?.exams?.length > 0 && selectedScriptExam === 'all') {
      setSelectedScriptExam(dashboardData.exams[0].id);
    }
  }, [dashboardData]);

  useEffect(() => { loadCameraAccessibility(); }, [selectedExam, selectedShift, selectedCameraDate]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await clientDashboardAPI.getStats(timeRange);
      setDashboardData(response.data.data);
    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  };

  const loadCameraAccessibility = async () => {
    try {
      setCameraLoading(true);
      const params = {};
      if (selectedExam !== 'all') params.exam_id = selectedExam;
      if (selectedShift !== 'all') params.shift_id = selectedShift;
      if (selectedCameraDate !== 'all') params.exam_date = selectedCameraDate;
      const response = await clientDashboardAPI.getCameraAccessibility(params);
      setCameraAccessibility(response.data.data);
      setAvailableShifts(response.data.data.available_shifts || []);
      setAvailableCameraDates(response.data.data.available_dates || []);
    } catch (error) { console.error(error); }
    finally { setCameraLoading(false); }
  };

  // ── Load exams tab ──
  const loadExams = useCallback(async () => {
    try {
      setExamsLoading(true);
      const response = await examsAPI.getAll({ is_active: true });
      const examsList = response.data.data;
      setExams(examsList);

      const countsPromises = examsList.map(async (exam) => {
        let detectionCount = 0;
        try {
          const detectionResponse = await examsAPI.getDetectionCount(exam.id);
          detectionCount = detectionResponse.data?.data?.detection_count || 0;
        } catch (err) { /* ignore */ }
        return { examId: exam.id, detectionCount };
      });
      const counts = await Promise.all(countsPromises);
      const countsMap = counts.reduce((acc, item) => {
        acc[item.examId] = { detections: item.detectionCount };
        return acc;
      }, {});
      setExamCounts(countsMap);
    } catch (error) { console.error('Error loading exams:', error); }
    finally { setExamsLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 1) loadExams();
  }, [activeTab, loadExams]);

  // ── Cameras tab ──
  const loadCamExams = useCallback(async () => {
    try {
      const res = await examsAPI.getAll({ is_active: true });
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setCamExams(list);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (activeTab === 2) loadCamExams();
  }, [activeTab, loadCamExams]);

  // Debounce camera search
  useEffect(() => {
    const timer = setTimeout(() => setCamDebouncedSearch(camSearchQuery), 500);
    return () => clearTimeout(timer);
  }, [camSearchQuery]);

  const loadCameras = useCallback(async () => {
    if (!selectedCamExamId) return;
    setCamLoading(true);
    try {
      const params = { is_active: true, page: camPage + 1, limit: camRowsPerPage };
      if (camFilterShiftId) params.shift_id = camFilterShiftId;
      if (camFilterExamDate) params.exam_date = parseDDMMYYYYToISO(camFilterExamDate);
      if (camDebouncedSearch.trim()) params.search = camDebouncedSearch.trim();
      const res = await camerasAPI.getByExam(selectedCamExamId, params);
      setCameras(res.data.data || []);
      setCamTotal(res.data.totalCount || (res.data.data || []).length);
      setCamExamLinkType(res.data.linkType);
      setCamStatusCounts(res.data.statusCounts || { accessible: 0, notAccessible: 0, unknown: 0 });
    } catch (e) { console.error(e); }
    finally { setCamLoading(false); }
  }, [selectedCamExamId, camPage, camRowsPerPage, camFilterShiftId, camFilterExamDate, camDebouncedSearch]);

  useEffect(() => {
    if (selectedCamExamId) loadCameras();
    else { setCameras([]); setCamTotal(0); }
    setCamFilterShiftId('');
    setCamFilterExamDate('');
    setCamSearchQuery('');
    setCamDebouncedSearch('');
    setCamPage(0);
  }, [selectedCamExamId]);

  useEffect(() => {
    if (selectedCamExamId) loadCameras();
  }, [camPage, camRowsPerPage, camFilterShiftId, camFilterExamDate, camDebouncedSearch]);

  const selectedCamExamData = camExams.find(e => String(e.id) === String(selectedCamExamId));
  const isHLS = camExamLinkType === 'HLS' || selectedCamExamData?.link_type?.toUpperCase() === 'HLS';
  const camShifts = selectedCamExamData?.examShifts || [];

  const handleCamSort = (property) => {
    const isAsc = camOrderBy === property && camOrder === 'asc';
    setCamOrder(isAsc ? 'desc' : 'asc');
    setCamOrderBy(property);
  };

  const sortedCameras = useMemo(() => {
    if (!camOrderBy) return cameras;
    return [...cameras].sort((a, b) => {
      let aVal = a[camOrderBy], bVal = b[camOrderBy];
      if (camOrderBy === 'shift_name') {
        aVal = camShifts.find(s => s.id === a.shift_id)?.shift_name || '';
        bVal = camShifts.find(s => s.id === b.shift_id)?.shift_name || '';
      }
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return camOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return camOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [cameras, camOrderBy, camOrder, camShifts]);

  // Handle tab change + URL sync
  const handleTabChange = (_, newValue) => {
    setActiveTab(newValue);
    const tabNames = ['dashboard', 'exams', 'cameras'];
    setSearchParams({ tab: tabNames[newValue] });
  };

  // ── Dashboard helpers ──
  const getDefaultDateForExam = () => {
    const today = new Date().toISOString().split('T')[0];
    const availableDates = dashboardData?.exam_dates || [];
    if (selectedScriptExam === 'all') {
      return availableDates.includes(today) ? today : (availableDates[0] || 'all');
    }
    const selectedExamData = (dashboardData?.exams || []).find(e => e.id === parseInt(selectedScriptExam));
    if (!selectedExamData?.start_date || !selectedExamData?.end_date) return 'all';
    const start = new Date(selectedExamData.start_date);
    const end = new Date(selectedExamData.end_date);
    const todayDate = new Date(today);
    if (todayDate >= start && todayDate <= end) return today;
    return selectedExamData.start_date;
  };

  useEffect(() => {
    if (!dashboardData) return;
    setSelectedDate(getDefaultDateForExam());
  }, [selectedScriptExam, dashboardData]);

  const getDateRangeForExam = () => {
    const availableDates = dashboardData?.exam_dates || [];
    if (selectedScriptExam === 'all') return availableDates;
    const selectedExamData = (dashboardData?.exams || []).find(e => e.id === parseInt(selectedScriptExam));
    if (!selectedExamData?.start_date || !selectedExamData?.end_date) return availableDates;
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

  const filteredDates = dashboardData ? getDateRangeForExam() : [];

  const allAvailableScripts = dashboardData?.all_scripts || [];
  const detectionData = dashboardData?.detection_distribution || [];
  const examFilteredDetectionData = selectedDetectionExam === 'all' ? detectionData : detectionData;
  const filteredDetectionData = selectedCategory === 'all'
    ? examFilteredDetectionData
    : examFilteredDetectionData.filter(item => SCRIPT_CATEGORY_MAP[item.type] === selectedCategory);

  const pieData = filteredDetectionData.map(item => ({
    name: DETECTION_TYPE_LABELS[item.type] || item.type,
    value: parseFloat(item.accuracy) || 0,
    count: item.count, type: item.type,
    category: SCRIPT_CATEGORY_MAP[item.type] || 'camera',
    color: CATEGORY_COLORS[SCRIPT_CATEGORY_MAP[item.type]] || '#94a3b8',
  }));
  const avgAccuracy = pieData.length > 0 ? (pieData.reduce((sum, item) => sum + item.value, 0) / pieData.length).toFixed(1) : 0;
  const examStatus = dashboardData?.exam_status || { completed: 0, in_progress: 0, pending: 0 };
  const totalExamTasks = examStatus.completed + examStatus.in_progress + examStatus.pending;

  const scriptDistribution = dashboardData?.script_distribution || [];
  const filteredScriptDistribution = scriptDistribution.filter(shift => {
    if (selectedScriptExam !== 'all' && shift.exam_id !== parseInt(selectedScriptExam)) return false;
    if (selectedDate !== 'all') {
      const hasMatchingDate = shift.scripts.some(s => s.assignment_date === selectedDate);
      if (!hasMatchingDate) return false;
    }
    return true;
  });
  const scheduledScripts = filteredScriptDistribution.flatMap(shift =>
    (selectedDate === 'all' ? shift.scripts : shift.scripts.filter(s => s.assignment_date === selectedDate))
      .map(script => ({ ...script, shift_name: shift.shift_name, exam_name: shift.exam_name }))
  );
  const scriptShiftMap = {};
  scheduledScripts.forEach(script => {
    if (!scriptShiftMap[script.script_name]) {
      scriptShiftMap[script.script_name] = { script_name: script.script_name, script_type: script.script_type, shifts: {}, total: 0 };
    }
    const shiftKey = script.shift_name;
    if (!scriptShiftMap[script.script_name].shifts[shiftKey]) {
      scriptShiftMap[script.script_name].shifts[shiftKey] = { count: 0, time_range: null };
    }
    scriptShiftMap[script.script_name].shifts[shiftKey].count++;
    scriptShiftMap[script.script_name].shifts[shiftKey].time_range =
      `${formatTime(script.custom_start_time)} - ${formatTime(script.custom_end_time)}`;
    scriptShiftMap[script.script_name].total++;
  });
  const uniqueShifts = [...new Set(scheduledScripts.map(s => s.shift_name))].sort();
  const scriptBarData = Object.values(scriptShiftMap).map(scriptData => {
    const script = allAvailableScripts.find(s => s.name === scriptData.script_name);
    const scriptId = script?.script_id || scriptData.script_type;
    const category = SCRIPT_CATEGORY_MAP[scriptId] || 'camera';
    const scriptMainColor = SCRIPT_COLORS[scriptId]?.color || CATEGORY_COLORS[category];
    const scriptBgColor = SCRIPT_COLORS[scriptId]?.bg || '#f1f5f9';
    const ScriptIcon = SCRIPT_ICONS[scriptId] || null;
    const row = { script_name: scriptData.script_name, category, color: scriptMainColor, bgColor: scriptBgColor, icon: ScriptIcon, total: scriptData.total };
    uniqueShifts.forEach(shift => {
      row[shift] = scriptData.shifts[shift]?.count || 0;
      row[`${shift}_time`] = scriptData.shifts[shift]?.time_range || '';
    });
    return row;
  });

  const handleDownloadCameraAccessibility = (event) => setDownloadMenuAnchor(event.currentTarget);
  const handleCloseDownloadMenu = () => setDownloadMenuAnchor(null);
  const handleDownloadOption = async (type) => {
    try {
      const params = { type };
      if (selectedExam !== 'all') params.exam_id = selectedExam;
      if (selectedShift !== 'all') params.shift_id = selectedShift;
      if (selectedCameraDate !== 'all') params.exam_date = selectedCameraDate;
      await clientDashboardAPI.downloadCameraAccessibility(params);
    } catch (error) { console.error(error); }
    finally { handleCloseDownloadMenu(); }
  };

  if (loading) return <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh"><CircularProgress size={48} /></Box>;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ color: '#0f172a', mb: 0.5 }}>Overview</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.9rem' }}>
            {user?.company_name ? `Analytics for ${user.company_name}` : 'Analytics overview'}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ borderBottom: '1px solid #e2e8f0', mb: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange} sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.92rem', minHeight: 44 }, '& .MuiTabs-indicator': { bgcolor: '#3b82f6', height: 3, borderRadius: '3px 3px 0 0' } }}>
          <Tab label="Dashboard" />
          <Tab label="Exams" />
          <Tab label="Cameras" />
        </Tabs>
      </Box>

      {/* ════ TAB 0: DASHBOARD ════ */}
      {activeTab === 0 && dashboardData && (
        <>
          <Grid container spacing={2} mb={3}>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard title="All Exams" value={dashboardData.active_exams || 0} icon={<ExamsSvgIcon />} color="#3b82f6" onClick={() => handleTabChange(null, 1)} />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard title="Total Cameras" value={dashboardData.total_cameras || 0} icon={<CameraAltIcon />} color="#3b82f6" />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <StatCard title="Total Detections" value={liveDetectionCount.toLocaleString()} icon={<CustomSvgIcon />} color="#3b82f6" />
            </Grid>
          </Grid>

          <Grid container spacing={3} mb={3}>
            <Grid item xs={12} md={5}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', boxShadow: 'none' }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Box>
                    <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>Camera Accessibility</Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>Live operational status monitoring</Typography>
                  </Box>
                  <Box onClick={handleDownloadCameraAccessibility} sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2, px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer', '&:hover': { bgcolor: '#f1f5f9' } }}>
                    <Download sx={{ fontSize: 18, color: '#64748b' }} />
                    <Typography variant="body2" sx={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Download</Typography>
                  </Box>
                  <Menu anchorEl={downloadMenuAnchor} open={Boolean(downloadMenuAnchor)} onClose={handleCloseDownloadMenu} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                    <MenuItem onClick={() => handleDownloadOption('accessible')}><Box display="flex" alignItems="center" gap={1}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981' }} /><Typography variant="body2">Download Accessible</Typography></Box></MenuItem>
                    <MenuItem onClick={() => handleDownloadOption('non_accessible')}><Box display="flex" alignItems="center" gap={1}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#ef4444' }} /><Typography variant="body2">Download Non-accessible</Typography></Box></MenuItem>
                    <MenuItem onClick={() => handleDownloadOption('all')}><Box display="flex" alignItems="center" gap={1}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#64748b' }} /><Typography variant="body2">Download All</Typography></Box></MenuItem>
                  </Menu>
                </Box>

                <Box display="flex" gap={1} mb={3}>
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', mb: 0.5, textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 600 }}>EXAM</Typography>
                    <Select value={selectedExam} onChange={(e) => { setSelectedExam(e.target.value); setSelectedShift('all'); setSelectedCameraDate('all'); }} sx={{ fontSize: '0.85rem', bgcolor: '#f8fafc' }} MenuProps={{ PaperProps: { sx: { maxHeight: 250 } } }}>
                      <MenuItem value="all">All Exams</MenuItem>
                      {(dashboardData?.exams || []).map(exam => <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', mb: 0.5, textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 600 }}>SHIFT</Typography>
                    <Select value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)} sx={{ fontSize: '0.85rem', bgcolor: '#f8fafc' }} disabled={selectedExam === 'all'}>
                      <MenuItem value="all">All Shifts</MenuItem>
                      {availableShifts.map(shift => <MenuItem key={shift.id} value={shift.id}>{shift.shift_name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', mb: 0.5, textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 600 }}>DATE</Typography>
                    <Select value={selectedCameraDate} onChange={(e) => setSelectedCameraDate(e.target.value)} sx={{ fontSize: '0.85rem', bgcolor: '#f8fafc' }} disabled={selectedExam === 'all'}>
                      <MenuItem value="all">All Dates</MenuItem>
                      {availableCameraDates.map(date => <MenuItem key={date} value={date}>{formatDate(date)}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Box>

                {cameraLoading ? (
                  <Box display="flex" justifyContent="center" alignItems="center" height={250}><CircularProgress /></Box>
                ) : (
                  <>
                    <Box display="flex" alignItems="center" justifyContent="center" position="relative" height={250}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={[{ name: 'Accessible', value: cameraAccessibility?.accessible_percent || 0 }, { name: 'Non-accessible', value: cameraAccessibility?.non_accessible_percent || 0 }]} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={0} dataKey="value" startAngle={90} endAngle={450}>
                            <Cell fill="#10b981" />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <RechartTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                      <Box position="absolute" top="50%" left="50%" sx={{ transform: 'translate(-50%, -50%)' }} textAlign="center">
                        <Typography variant="h5" fontWeight={700} sx={{ color: '#0f172a' }}>{cameraAccessibility?.total_cameras || 0}</Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem', fontWeight: 600 }}>TOTAL UNITS</Typography>
                      </Box>
                    </Box>
                    <Grid container spacing={2} mt={1}>
                      <Grid item xs={6}>
                        <Box sx={{ bgcolor: '#f0fdf4', borderRadius: 2, p: 2, border: '1px solid #bbf7d0' }}>
                          <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#10b981' }} />
                            <Typography variant="body2" fontWeight={600} sx={{ color: '#10b981', fontSize: '0.85rem' }}>Accessible</Typography>
                          </Box>
                          <Typography variant="body2" sx={{ color: '#059669', fontSize: '0.85rem', fontWeight: 600 }}>
                            {cameraAccessibility?.accessible || 0} Units ({cameraAccessibility?.accessible_percent || 0}%)
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box sx={{ bgcolor: '#fef2f2', borderRadius: 2, p: 2, border: '1px solid #fecaca' }}>
                          <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: '#ef4444' }} />
                            <Typography variant="body2" fontWeight={600} sx={{ color: '#ef4444', fontSize: '0.85rem' }}>Non-accessible</Typography>
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
                  <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>All Exam Status</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.75rem' }}>TOTAL: {totalExamTasks}</Typography>
                </Box>
                <Box display="flex" flexDirection="column" gap={4}>
                  {[{ label: 'Completed', value: examStatus.completed, color: '#3b82f6' },
                    { label: 'In Progress', value: examStatus.in_progress, color: '#f59e0b' },
                    { label: 'Pending', value: examStatus.pending, color: '#94a3b8' }].map(({ label, value, color }) => (
                    <Box key={label}>
                      <Box display="flex" justifyContent="space-between" mb={1}>
                        <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem' }}>{label}</Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.85rem', color }}>{value}/{totalExamTasks}</Typography>
                      </Box>
                      <LinearProgress variant="determinate" value={totalExamTasks > 0 ? (value / totalExamTasks) * 100 : 0} sx={{ height: 24, borderRadius: 8, bgcolor: '#e2e8f0', '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 8 } }} />
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            {/* Script Distribution */}
            <Grid item xs={12} md={7}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', boxShadow: 'none' }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>Script Distribution</Typography>
                  <Box display="flex" gap={1}>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <Select value={selectedScriptExam} onChange={(e) => setSelectedScriptExam(e.target.value)} sx={{ fontSize: '0.85rem' }} MenuProps={{ PaperProps: { sx: { maxHeight: 250 } } }}>
                        <MenuItem value="all">All Exams</MenuItem>
                        {(dashboardData.exams || []).map(exam => <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                      <Select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} sx={{ fontSize: '0.85rem' }} MenuProps={{ PaperProps: { sx: { maxHeight: 250 } } }}>
                        <MenuItem value="all">All Dates</MenuItem>
                        {filteredDates.map((date, index) => <MenuItem key={index} value={date}>{formatDate(date)}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Box>
                </Box>

                {uniqueShifts.length > 0 && (
                  <Box display="flex" mb={2}>
                    <Box sx={{ width: 200, flexShrink: 0 }} />
                    <Box display="flex" flex={1} gap={2} justifyContent="space-around">
                      {uniqueShifts.map((shift, i) => (
                        <Typography key={i} variant="caption" sx={{ fontWeight: 700, color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem', textAlign: 'center', flex: 1 }}>{shift}</Typography>
                      ))}
                    </Box>
                  </Box>
                )}

                <Box sx={{ maxHeight: 380, overflowY: 'auto' }}>
                  {scriptBarData.map((script, index) => (
                    <Box key={index} display="flex" alignItems="center" mb={1.5}>
                      <Box sx={{ width: 200, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1 }}>
                        {script.icon && React.createElement(script.icon, { sx: { fontSize: 16, color: script.color, flexShrink: 0 } })}
                        <Typography sx={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>
                          {script.script_name.replace(/\s*detection\s*/gi, '').trim()}
                        </Typography>
                      </Box>
                      <Box display="flex" flex={1} gap={2} justifyContent="space-around">
                        {uniqueShifts.map((shift, shiftIndex) => {
                          const count = script[shift] || 0;
                          const timeRange = script[`${shift}_time`] || '';
                          const hasValue = count > 0;
                          return (
                            <Box key={shiftIndex} sx={{ flex: 1, minHeight: 50, bgcolor: hasValue ? script.bgColor : '#f1f5f9', borderRadius: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 1, border: hasValue ? `1px solid ${script.color}20` : '1px solid transparent' }}>
                              {hasValue && <Typography sx={{ fontSize: '0.65rem', color: script.color, fontWeight: 700, mb: 0.3 }}>{timeRange}</Typography>}
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>
                  ))}
                  {scriptBarData.length === 0 && <Box display="flex" alignItems="center" justifyContent="center" py={8}><Typography variant="body2" color="text.secondary">No scripts available</Typography></Box>}
                </Box>
              </Paper>
            </Grid>

            {/* Detection Distribution */}
            <Grid item xs={12} md={5}>
              <Paper elevation={0} sx={{ p: 3, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%', boxShadow: 'none' }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" fontWeight={700} sx={{ color: '#0f172a' }}>Detection Distribution</Typography>
                  <Box display="flex" gap={1}>
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <Select value={selectedDetectionExam} onChange={(e) => setSelectedDetectionExam(e.target.value)} sx={{ fontSize: '0.85rem' }} MenuProps={{ PaperProps: { sx: { maxHeight: 250 } } }}>
                        <MenuItem value="all">All Exams</MenuItem>
                        {(dashboardData.exams || []).map(exam => <MenuItem key={exam.id} value={exam.id}>{exam.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                      <Select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} sx={{ fontSize: '0.85rem' }} MenuProps={{ PaperProps: { sx: { maxHeight: 250 } } }}>
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
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} paddingAngle={2} dataKey="value">
                        {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <RechartTooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <Box position="absolute" top="50%" left="50%" sx={{ transform: 'translate(-50%, -50%)' }} textAlign="center">
                    <Typography variant="h3" fontWeight={700} sx={{ color: '#0f172a' }}>{avgAccuracy}%</Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem' }}>Avg Accuracy</Typography>
                  </Box>
                </Box>

                <Box display="flex" flexDirection="column" gap={1.5} mt={2} maxHeight={140} sx={{ overflowY: 'auto' }}>
                  {pieData.map((item, index) => (
                    <Box key={index} display="flex" alignItems="center" justifyContent="space-between" gap={2}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ fontSize: '0.85rem', color: '#64748b' }}>{item.name}</Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{item.value}%</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}

      {/* ════ TAB 1: EXAMS ════ */}
      {activeTab === 1 && (
        <Box>
          {examsLoading ? (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px"><CircularProgress /></Box>
          ) : exams.length === 0 ? (
            <Box textAlign="center" py={8}><Typography variant="h6" color="text.secondary">No exams found</Typography></Box>
          ) : (
            <Grid container spacing={3}>
              {exams.map((exam) => (
                <Grid item xs={12} sm={6} md={3} key={exam.id}>
                  <ViewOnlyExamCard exam={exam} examCounts={examCounts} navigate={navigate} />
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      )}

      {/* ════ TAB 2: CAMERAS ════ */}
      {activeTab === 2 && (
        <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 220px)', bgcolor: '#f8fafc', borderRadius: 2, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <Box sx={{ width: camSidebarOpen ? 260 : 52, flexShrink: 0, borderRight: '1px solid #e8ecf1', bgcolor: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)' }}>
            <Box sx={{ px: camSidebarOpen ? 2.5 : 1, pt: 2.5, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: camSidebarOpen ? 'space-between' : 'center' }}>
              {camSidebarOpen && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ExamsSvgIcon sx={{ fontSize: 17, color: '#64748b' }} />
                  <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155' }}>Available Exams</Typography>
                </Box>
              )}
              <Tooltip title={camSidebarOpen ? 'Collapse' : 'Expand'} placement="right">
                <IconButton size="small" onClick={() => setCamSidebarOpen(!camSidebarOpen)} sx={{ color: '#fff', bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' }, borderRadius: 2, width: 32, height: 32 }}>
                  {camSidebarOpen ? <KeyboardArrowLeft sx={{ fontSize: 20 }} /> : <KeyboardArrowRight sx={{ fontSize: 20 }} />}
                </IconButton>
              </Tooltip>
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
              {camExams.map((exam) => {
                const active = String(exam.id) === String(selectedCamExamId);
                return (
                  <Tooltip key={exam.id} title={!camSidebarOpen ? `${exam.exam_name} (${exam.exam_body})` : ''} placement="right">
                    <Box onClick={() => setSelectedCamExamId(String(exam.id))} sx={{ display: 'flex', alignItems: 'center', justifyContent: camSidebarOpen ? 'space-between' : 'center', px: camSidebarOpen ? 2.5 : 0, py: 1.8, cursor: 'pointer', borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent', bgcolor: active ? '#f0f6ff' : 'transparent', transition: 'all 0.15s ease', '&:hover': { bgcolor: active ? '#f0f6ff' : '#f8fafc' } }}>
                      {camSidebarOpen ? (
                        <>
                          <Typography sx={{ fontSize: '0.88rem', fontWeight: active ? 600 : 400, color: active ? '#3b82f6' : '#334155', lineHeight: 1.4, pr: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {exam.exam_name} ({exam.exam_body})
                          </Typography>
                          <ChevronRight sx={{ fontSize: 20, color: active ? '#3b82f6' : '#94a3b8', flexShrink: 0 }} />
                        </>
                      ) : (
                        <Box sx={{ width: 34, height: 34, borderRadius: 2, bgcolor: active ? '#2563eb' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', border: active ? 'none' : '1px solid #e2e8f0' }}>
                          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: active ? '#fff' : '#64748b', textTransform: 'uppercase' }}>{exam.exam_name.charAt(0)}</Typography>
                        </Box>
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
              {camExams.length === 0 && camSidebarOpen && <Typography sx={{ px: 2.5, py: 2, fontSize: '0.82rem', color: '#94a3b8' }}>No exams found.</Typography>}
            </Box>
          </Box>

          <Box sx={{ flex: 1, p: 3, overflowY: 'auto', minWidth: 0 }}>
            {!selectedCamExamId ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
                <Box sx={{ width: 96, height: 96, borderRadius: '50%', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                  <CameraAltIcon sx={{ fontSize: 40, color: '#3b82f6' }} />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>Select an exam to view cameras</Typography>
                <Typography sx={{ fontSize: '0.92rem', color: '#64748b', maxWidth: 420, lineHeight: 1.6 }}>Choose an exam from the sidebar to view its CCTV camera links.</Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', fontSize: '1.5rem' }}>
                        {selectedCamExamData ? `${selectedCamExamData.exam_name} (${selectedCamExamData.exam_body})` : 'Cameras'}
                      </Typography>
                      {selectedCamExamData && <Chip label={camExamLinkType || selectedCamExamData.link_type} size="small" sx={{ fontWeight: 700, fontSize: '0.7rem', height: 20, borderRadius: '6px', bgcolor: isHLS ? '#3b82f6' : '#a4b5fe', color: isHLS ? '#fff' : '#384b91' }} />}
                    </Box>
                    <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>{camTotal} camera{camTotal !== 1 ? 's' : ''} • {isHLS ? 'HLS streams' : 'RTSP streams'}</Typography>
                  </Box>

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', flexShrink: 0 }}>
                    <TextField
                      size="small" placeholder="Search center, state..." value={camSearchQuery} onChange={(e) => setCamSearchQuery(e.target.value)}
                      InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: '#94a3b8' }} /></InputAdornment>, endAdornment: camSearchQuery !== camDebouncedSearch ? <InputAdornment position="end"><CircularProgress size={16} sx={{ color: '#94a3b8' }} /></InputAdornment> : null, sx: { borderRadius: '8px', bgcolor: '#f8fafc', height: 40, fontSize: 14, '& fieldset': { border: '1px solid #e2e8f0' } } }}
                      sx={{ minWidth: 240 }}
                    />
                    {isHLS && (
                      <>
                        <FormControl size="small" sx={{ minWidth: 130 }}>
                          <Select value={camFilterShiftId} onChange={(e) => { setCamFilterShiftId(e.target.value); setCamPage(0); }} displayEmpty sx={{ borderRadius: 2, fontSize: '0.85rem', bgcolor: '#f1f5f9', height: 40, '& fieldset': { border: '1px solid #e2e8f0' } }} renderValue={(v) => v ? camShifts.find(s => s.id === v)?.shift_name || v : 'All shifts'}>
                            <MenuItem value="">All shifts</MenuItem>
                            {camShifts.map(s => <MenuItem key={s.id} value={s.id}>{s.shift_name}</MenuItem>)}
                          </Select>
                        </FormControl>
                        <Box sx={{ position: 'relative', minWidth: 150 }}>
                          <TextField type="date" size="small" value={camFilterExamDate ? camFilterExamDate.split('-').reverse().join('-') : ''} onChange={(e) => { const val = e.target.value; if (val) { const [y, m, d] = val.split('-'); setCamFilterExamDate(`${d}-${m}-${y}`); } else setCamFilterExamDate(''); setCamPage(0); }} InputProps={{ sx: { borderRadius: '8px', bgcolor: '#f1f5f9', height: 40, fontSize: 14, color: camFilterExamDate ? 'transparent' : '#94a3b8', paddingRight: '6px', '& fieldset': { border: '1px solid #e2e8f0' } } }} sx={{ width: '100%' }} />
                          {camFilterExamDate && <Box sx={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#334155', pointerEvents: 'none' }}>{camFilterExamDate}</Box>}
                        </Box>
                      </>
                    )}
                  </Box>
                </Box>

                {cameras.length > 0 && cameras.some(cam => cam.status !== null && cam.status !== undefined) && (
                  <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', justifyContent: 'end' }}>
                    <Box sx={{ height: 30, px: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, border: '1px solid #3c81f6' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600 }}>Accessible</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#3b82f6' }}>{camStatusCounts.accessible}</Typography>
                    </Box>
                    <Box sx={{ height: 30, px: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, border: '1px solid #333' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: '#777', fontWeight: 600 }}>Not Accessible</Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#777' }}>{camStatusCounts.notAccessible}</Typography>
                    </Box>
                    {camStatusCounts.unknown > 0 && (
                      <Box sx={{ height: 30, px: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, border: '1px solid #e5e7eb', bgcolor: '#f9fafb' }}>
                        <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', fontWeight: 600 }}>Unknown</Typography>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>{camStatusCounts.unknown}</Typography>
                      </Box>
                    )}
                  </Box>
                )}

                {camLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
                ) : sortedCameras.length > 0 ? (
                  <>
                    <TableContainer component={Paper} sx={{ borderRadius: 2.5, border: '1px solid #e8ecf1', boxShadow: 'none' }}>
                      <Table size="small">
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                          <TableRow>
                            {isHLS ? (
                              <>
                                {['centre_name', 'tc_code', 'state', 'camera_name', 'ch_code', 'camera_category', 'classification', 'exam_date', 'shift_name'].map((col) => (
                                  <TableCell key={col} sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>
                                    <TableSortLabel active={camOrderBy === col} direction={camOrderBy === col ? camOrder : 'asc'} onClick={() => handleCamSort(col)}>
                                      {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                    </TableSortLabel>
                                  </TableCell>
                                ))}
                              </>
                            ) : (
                              <>
                                {['device_id', 'camera_no', 'tc_code', 'camera_name', 'centre_name', 'state', 'classification'].map((col) => (
                                  <TableCell key={col} sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>
                                    <TableSortLabel active={camOrderBy === col} direction={camOrderBy === col ? camOrder : 'asc'} onClick={() => handleCamSort(col)}>
                                      {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                    </TableSortLabel>
                                  </TableCell>
                                ))}
                              </>
                            )}
                            <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 200 }}>CCTV URL</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sortedCameras.map((cam) => (
                            <TableRow key={cam.id} hover sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                              {isHLS ? (
                                <>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.centre_name || '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.tc_code || '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.state || '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.camera_name || '-'}</TableCell>
                                  <TableCell>{cam.ch_code ? <Chip label={cam.ch_code} size="small" variant="outlined" /> : '-'}</TableCell>
                                  <TableCell><Chip label={cam.camera_category || 'N/A'} size="small" /></TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.classification || '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{formatDateDDMMYYYY(cam.exam_date) || '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>
                                    {cam.shift_id ? (camShifts.find(s => s.id === cam.shift_id)?.shift_name || `#${cam.shift_id}`) : <Chip label="All shifts" size="small" variant="outlined" />}
                                  </TableCell>
                                </>
                              ) : (
                                <>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.device_id || '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.camera_no ?? '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.tc_code || '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.camera_name || '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.centre_name || cam.tc_name || '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.state || '-'}</TableCell>
                                  <TableCell sx={{ fontSize: '0.85rem' }}>{cam.classification || '-'}</TableCell>
                                </>
                              )}
                              <TableCell sx={{ maxWidth: 200 }}>
                                <Tooltip title={cam.cctv_url || cam.url}>
                                  <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.75rem' }}>
                                    {truncate(cam.cctv_url || cam.url, 40)}
                                  </Typography>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <TablePagination component="div" count={camTotal} page={camPage} onPageChange={(e, newPage) => setCamPage(newPage)} rowsPerPage={camRowsPerPage} onRowsPerPageChange={(e) => { setCamRowsPerPage(parseInt(e.target.value, 10)); setCamPage(0); }} rowsPerPageOptions={[10, 25, 50, 100, 200]} />
                  </>
                ) : (
                  <Box sx={{ textAlign: 'center', py: 8, bgcolor: '#fff', borderRadius: 3, border: '1px solid #e8ecf1' }}><Typography sx={{ fontSize: '0.95rem', color: '#64748b' }}>No cameras found for this exam.</Typography></Box>
                )}
              </>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
};

export default ClientDetectionDashboard;
""")
