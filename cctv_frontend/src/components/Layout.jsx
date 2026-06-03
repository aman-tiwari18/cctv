import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Avatar,
  Menu,
  MenuItem,
  Collapse,
  Chip,
  Button,
  Snackbar,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  Analytics,
  Logout,
  Slideshow,
  AccountCircle,
  Visibility,
  ExpandLess,
  ExpandMore,
  WarningAmber,
  Groups,
  PersonOff,
  Dns,
  DirectionsWalk,
  MeetingRoom,
  Smartphone,
  VisibilityOff,
  FlipCameraAndroid,
  SecurityUpdateWarning,
  Download,
  TrendingUp,
  VerifiedUser,
  Memory,
  DeleteSweep,
} from '@mui/icons-material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { useAuth } from '../contexts/AuthContext';
import { useDetectionCounts } from '../contexts/DetectionCountsContext';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon';
import { CustomSvgIcon } from './DetectionSvgIcon';
import { ShiftSvgIcon } from './ShiftSvgIcon';
import CameraIcon from './CameraIcon';
import { dashboardAPI } from '../services/api';

const DRAWER_WIDTH = 260;
const APPBAR_HEIGHT = 64;

const sidebarPalette = {
  bg: '#ffffff',
  border: 'rgba(71, 85, 105, 0.18)',
  itemText: '#0f172a',
  itemIcon: '#64748b',
  itemHoverBg: '#f1f5f9',
  itemActiveBg: '#dbeafe',
  itemActiveText: '#1e3a8a',
  subItemText: '#475569',
  subItemActiveText: '#2563eb',
  subItemActiveBg: '#eff6ff',
  subItemActiveBorder: '#2563eb',
};

// Subtle, cohesive icon colors — all within the blue-slate-indigo range to match the app
const TYPE_META = {
  proximity: { label: 'Close Proximity', icon: WarningAmber, iconColor: '#5cb88a' },
  crowd: { label: 'Crowd Detection (Entry/Exit)', icon: Groups, iconColor: '#e24d7b' },
  crowd_biometric: { label: 'Crowd Detection (Biometric)', icon: Groups, iconColor: '#9333ea' },
  crowd_five: { label: 'Crowd < 5', icon: Groups, iconColor: '#e06050' },
  crowd_zero: { label: 'Zero Person', icon: PersonOff, iconColor: '#6b5b95' },
  server: { label: 'Server Room', icon: Dns, iconColor: '#a0623d' },
  intruder: { label: 'Intruder', icon: DirectionsWalk, iconColor: '#d94466' },
  entry_exit: { label: 'Entry/Exit', icon: MeetingRoom, iconColor: '#1d7a7d' },
  phone: { label: 'Phone', icon: Smartphone, iconColor: '#465a38' },
  blind_spot: { label: 'Blind Spot', icon: VisibilityOff, iconColor: '#b0a850' },
  invigilator: { label: 'Invigilator', icon: Visibility, iconColor: '#00bfcf' },
  inversion: { label: 'Camera Inversion', icon: FlipCameraAndroid, iconColor: '#7a86b4' },
  tamper: { label: 'Camera Tampering', icon: SecurityUpdateWarning, iconColor: '#00c8d4' },
  // tampering: { label: 'Camera Tampering', icon: SecurityUpdateWarning, iconColor: '#00c8d4' },
  strongroom: { label: 'Strong Room Movement', icon: SecurityUpdateWarning, iconColor: '#b91c1c' },
  qp_box: { label: 'QP Box Detection', icon: SecurityUpdateWarning, iconColor: '#dc2626' },
  vision: { label: 'Vision Detection', icon: Visibility, iconColor: '#3b82f6' },
};

const menuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/' },
  { text: 'Exams', icon: <ExamsSvgIcon />, path: '/exams' },
  { text: 'Cameras', icon: <CameraAltIcon />, path: '/cameras' },
  { text: 'Schedule Analysis', icon: <Analytics />, path: '/analytics' },
  { text: 'Executions', icon: <Slideshow />, path: '/executions' },
  { text: 'Detections', icon: <CustomSvgIcon />, path: '/detections', hasSubItems: true },
  { text: 'Client Detections', icon: <Visibility />, path: '/client-detections', hasSubItems: true },
  { text: 'Client Dashboard', icon: <Dashboard />, path: '/client-dashboard' },
];

// Menu items for VIEWER role (reordered with Client Dashboard first)
// Menu items for VIEWER role
const viewerMenuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/' },
  { text: 'Exams', icon: <ExamsSvgIcon />, path: '/exams' },
  { text: 'Cameras', icon: <CameraAltIcon />, path: '/cameras' },
  { text: 'Detections', icon: <CustomSvgIcon />, path: '/detections', hasSubItems: true },
];

// Menu items for OPERATOR role
const operatorMenuItems = [
  { text: 'Cameras', icon: <CameraAltIcon />, path: '/cameras' },
  { text: 'Detections', icon: <CustomSvgIcon />, path: '/detections', hasSubItems: true },
];

/* ── Detection Sub-Items (multi-select) ── */
function DetectionSubItems({ counts, typeFilter, onTypeSelect }) {
  // Log when counts change
  React.useEffect(() => {
    console.log('[DetectionSubItems] Counts updated:', counts);
  }, [counts]);

  return (
    <List component="div" disablePadding sx={{ pb: 0.5 }}>
      {Object.entries(TYPE_META).map(([key, meta]) => {
        const count = counts[key] || 0;
        const isActive = typeFilter.includes(key);
        const IconComp = meta.icon;

        return (
          <ListItem key={key} disablePadding sx={{ px: 1 }}>
            <ListItemButton
              selected={isActive}
              onClick={() => {
                if (isActive) {
                  onTypeSelect(typeFilter.filter((t) => t !== key));
                } else {
                  onTypeSelect([...typeFilter, key]);
                }
              }}
              sx={{
                minHeight: 34,
                pl: 5,
                pr: 1.5,
                borderRadius: 1,
                position: 'relative',
                ...(isActive && {
                  bgcolor: sidebarPalette.subItemActiveBg,
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 16,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 18,
                    borderRadius: 2,
                    bgcolor: sidebarPalette.subItemActiveBorder,
                  },
                }),
                '&.Mui-selected': {
                  bgcolor: sidebarPalette.subItemActiveBg,
                  '&:hover': { bgcolor: sidebarPalette.subItemActiveBg },
                },
                '&:hover': { bgcolor: sidebarPalette.itemHoverBg },
              }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                <IconComp sx={{ fontSize: 16, color: isActive ? sidebarPalette.subItemActiveText : (meta.iconColor || sidebarPalette.itemIcon) }} />
              </ListItemIcon>
              <ListItemText
                primary={meta.label}
                primaryTypographyProps={{
                  fontSize: '0.8rem',
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? sidebarPalette.subItemActiveText : sidebarPalette.subItemText,
                  noWrap: true,
                }}
              />
              <Typography variant="caption" fontWeight={700} color={isActive ? sidebarPalette.subItemActiveText : 'text.secondary'}>
                {count}
              </Typography>
            </ListItemButton>
          </ListItem>
        );
      })}
    </List>
  );
}

const adminFooterItems = [
  { text: 'GPU Monitor', icon: <Memory />, path: '/gpu-monitor' },
  { text: 'User Verification', icon: <VerifiedUser />, path: '/user-verification' },
];

/* ── Sidebar Content ── */
function SidebarContent({ items, currentPath, onNavigate, user }) {
  const { unfilteredCounts, typeFilter, setTypeFilter, } = useDetectionCounts();
  const [detectionsOpen, setDetectionsOpen] = useState(false);

  const isDetectionPage = currentPath === '/detections' || currentPath === '/client-detections' || currentPath === '/detections/removed';

  useEffect(() => {
    if (isDetectionPage) setDetectionsOpen(true);
  }, [isDetectionPage]);

  const footerItems = user?.role === 'ADMIN' ? adminFooterItems : [];

  return (
    <Box
      sx={{
        width: DRAWER_WIDTH,
        height: '100%',
        bgcolor: sidebarPalette.bg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Toolbar
        sx={{
          height: APPBAR_HEIGHT,
          borderBottom: `1px solid ${sidebarPalette.border}`,
          justifyContent: 'flex-start',
          px: 2,
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          <Box component="img" src="/logo cctv-14.png" sx={{ height: 28, mr: 1 }} />
          <Typography variant="h6" fontWeight={700} color="#0f172a" noWrap>
            CCTV Monitor
          </Typography>
        </Box>
      </Toolbar>

      <Divider sx={{ borderColor: sidebarPalette.border }} />

      <List sx={{ flex: 1, py: 1, overflowY: 'auto' }}>
        {items.map((item) => {
          // /detections/removed is a sub-route of the Detections page — keep
          // the Detections sidebar item active so the user has visual anchor
          // and the type sub-items stay accessible.
          const isActive = currentPath === item.path
            || (item.path === '/detections' && currentPath === '/detections/removed');
          const isDetectionItem = item.hasSubItems;

          return (
            <React.Fragment key={item.text}>
              <ListItem disablePadding sx={{ px: 1, py: 0.3 }}>
                <ListItemButton
                  selected={isActive}
                  onClick={() => {
                    onNavigate(item.path);
                    if (isDetectionItem) setDetectionsOpen(true);
                  }}
                  sx={{
                    minHeight: 44,
                    px: 1.5,
                    borderRadius: 1.5,
                    justifyContent: 'flex-start',
                    '& .MuiListItemIcon-root': {
                      minWidth: 36,
                      mr: 1.5,
                      color: isActive ? sidebarPalette.itemActiveText : sidebarPalette.itemIcon,
                    },
                    '&.Mui-selected': {
                      backgroundColor: sidebarPalette.itemActiveBg,
                      '&:hover': { backgroundColor: sidebarPalette.itemActiveBg },
                    },
                    '&:hover': {
                      backgroundColor: isActive ? sidebarPalette.itemActiveBg : sidebarPalette.itemHoverBg,
                    },
                  }}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{
                      fontSize: '0.875rem',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? sidebarPalette.itemActiveText : sidebarPalette.itemText,
                      whiteSpace: 'nowrap',
                    }}
                  />
                  {isDetectionItem && isActive && (
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetectionsOpen(!detectionsOpen);
                      }}
                      sx={{ color: sidebarPalette.itemIcon }}
                    >
                      {detectionsOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                    </IconButton>
                  )}
                </ListItemButton>
              </ListItem>

              {isDetectionItem && isActive && (
                <Collapse in={detectionsOpen} timeout="auto" unmountOnExit>
                  <DetectionSubItems
                    counts={unfilteredCounts}
                    typeFilter={typeFilter}
                    onTypeSelect={setTypeFilter}
                  />
                </Collapse>
              )}
            </React.Fragment>
          );
        })}
      </List>

      {footerItems.length > 0 && (
        <>
          <Divider sx={{ borderColor: sidebarPalette.border }} />
          <List sx={{ py: 1, flexShrink: 0 }}>
            {footerItems.map((item) => {
              const isActive = currentPath === item.path;
              return (
                <ListItem key={item.text} disablePadding sx={{ px: 1, py: 0.3 }}>
                  <ListItemButton
                    selected={isActive}
                    onClick={() => onNavigate(item.path)}
                    sx={{
                      minHeight: 44,
                      px: 1.5,
                      borderRadius: 1.5,
                      '& .MuiListItemIcon-root': {
                        minWidth: 36,
                        mr: 1.5,
                        color: isActive ? sidebarPalette.itemActiveText : sidebarPalette.itemIcon,
                      },
                      '&.Mui-selected': {
                        backgroundColor: sidebarPalette.itemActiveBg,
                        '&:hover': { backgroundColor: sidebarPalette.itemActiveBg },
                      },
                      '&:hover': {
                        backgroundColor: isActive ? sidebarPalette.itemActiveBg : sidebarPalette.itemHoverBg,
                      },
                    }}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        fontSize: '0.875rem',
                        fontWeight: isActive ? 600 : 500,
                        color: isActive ? sidebarPalette.itemActiveText : sidebarPalette.itemText,
                        whiteSpace: 'nowrap',
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </>
      )}
    </Box>
  );
}

/* ── Main Layout ── */
function LayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const { unfilteredCounts, exportToExcel, downloadConsolidatedReport, reportValidationError, setReportValidationError } = useDetectionCounts();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [liveExamsCount, setLiveExamsCount] = useState(0);
  const [reportSnackbar, setReportSnackbar] = useState({ open: false, message: '', severity: 'warning' });
  // True while the consolidated-report download is in flight. Drives the spinner
  // inside the Consolidated Report button so the user sees feedback during the
  // few-second backend Excel build. Both the admin (/detections + ADMIN) and the
  // viewer (/detections + VIEWER) buttons share this one flag — they're
  // mutually exclusive by role so there's no contention.
  const [downloadingReport, setDownloadingReport] = useState(false);

  // Wraps the page-registered downloadConsolidatedReport so we can toggle the
  // spinner around the awaited call. The handler may bail out synchronously on
  // validation errors (no exam / no date selected) — that's fine, the spinner
  // just flashes for one tick.
  const handleDownloadReportClick = async () => {
    setReportSnackbar({ open: false, message: '', severity: 'warning' });
    if (!downloadConsolidatedReport) return;
    setDownloadingReport(true);
    try {
      await downloadConsolidatedReport();
    } catch (err) {
      console.error('downloadConsolidatedReport failed:', err);
    } finally {
      setDownloadingReport(false);
    }
  };

  // Calculate total detections with useMemo for better reactivity
  const totalDetections = React.useMemo(() => {
    const total = Object.values(unfilteredCounts).reduce((a, b) => a + b, 0);
    return total;
  }, [unfilteredCounts]);

  // Fetch live exams (currently-running shift today) — must match /live-exams table
  useEffect(() => {
    if (location.pathname === '/') {
      const fetchLiveExams = async () => {
        try {
          const res = await dashboardAPI.getLiveExams({ page: 1, limit: 1 });
          setLiveExamsCount(res.data?.data?.total || 0);
        } catch (err) {
          console.error("Failed to fetch live exams:", err);
        }
      };
      fetchLiveExams();
    }
  }, [location.pathname]);

  const filteredMenuItems = user?.role === 'VIEWER'
    ? viewerMenuItems
    : user?.role === 'OPERATOR'
      ? operatorMenuItems
      : menuItems.filter(item => item.text !== 'Client Detections' && item.text !== 'Client Dashboard');

  // Allow certain paths that are not in the main menu (footer items)
  const allowedPaths = ['/user-verification', '/gpu-monitor', '/detections/removed'];

  useEffect(() => {
    const isAllowedPath = allowedPaths.includes(location.pathname);
    const isInMenu = filteredMenuItems.some((item) => item.path === location.pathname);

    if (!isInMenu && !isAllowedPath) {
      if (user?.role === 'OPERATOR') {
        navigate('/detections');
      } else {
        navigate('/');
      }
    }
  }, [location.pathname, user]);

  // Watch for validation errors from Detections page
  useEffect(() => {
    if (reportValidationError) {
      setReportSnackbar({
        open: true,
        message: reportValidationError,
        severity: 'warning'
      });
      // Clear the error from context after showing it
      setReportValidationError('');
    }
  }, [reportValidationError, setReportValidationError]);

  const handleNavigate = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentPageTitle =
    adminFooterItems.find((item) => item.path === location.pathname)?.text ||
    filteredMenuItems.find((item) => item.path === location.pathname)?.text ||
    (location.pathname === '/detections/removed' ? 'Removed Detections' : '');

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          bgcolor: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          borderBottom: `1px solid ${sidebarPalette.border}`,
          color: '#0f172a',
          height: APPBAR_HEIGHT,
        }}
      >
        <Toolbar sx={{ height: APPBAR_HEIGHT, minHeight: `${APPBAR_HEIGHT}px !important` }}>
          <IconButton
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ display: { md: 'none' }, mr: 1.5, color: '#334155' }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: { xs: '1.1rem', sm: '1.5rem' },
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flexShrink: 1,
            }}
          >
            {currentPageTitle}
          </Typography>

          {(location.pathname === '/detections' || location.pathname === '/client-detections') && (
            <Chip
              label={`TOTAL DETECTIONS | ${totalDetections.toLocaleString()}`}
              variant="outlined"
              sx={{
                ml: 2,
                display: { xs: 'none', md: 'flex' },
                fontWeight: 700,
                fontSize: '0.75rem',
                border: 'none',
                color: '#a96664',
                bgcolor: '#fbefef',
                borderRadius: '20px',
                height: 32,
                '& .MuiChip-label': { px: 2 },
              }}
            />
          )}

          <Box sx={{ flexGrow: 1 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, flexShrink: 0 }}>
            {/* Removed Detections shortcut — only shown to VIEWER on /detections.
                Mirrors the pill styling used by the screenshot reference. */}
            {location.pathname === '/detections' && user?.role === 'VIEWER' && (
              <Button
                variant="outlined"
                startIcon={<DeleteSweep sx={{ fontSize: 16 }} />}
                disableElevation
                onClick={() => navigate('/detections/removed')}
                sx={{
                  height: 34,
                  borderRadius: '8px',
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  borderColor: '#fecaca',
                  color: '#b91c1c',
                  bgcolor: '#fff5f5',
                  px: { xs: 1, md: 2 },
                  minWidth: { xs: 40, md: 'auto' },
                  '& .MuiButton-startIcon': { mr: { xs: 0, md: 1 }, ml: { xs: 0, md: -0.5 } },
                  '&:hover': { bgcolor: '#fee2e2', borderColor: '#fca5a5' },
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Removed Detections</Box>
              </Button>
            )}

            {location.pathname === '/detections' && user?.role === 'ADMIN' && (
              <Button
                variant="contained"
                startIcon={downloadingReport
                  ? <CircularProgress size={14} thickness={5} sx={{ color: '#2563eb' }} />
                  : <Download sx={{ fontSize: 16 }} />}
                disableElevation
                onClick={handleDownloadReportClick}
                disabled={downloadingReport}
                sx={{
                  height: 34,
                  borderRadius: '8px',
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  bgcolor: '#e0e7fa',
                  color: '#2563eb',
                  px: { xs: 1, md: 2 },
                  minWidth: { xs: 40, md: 'auto' },
                  '& .MuiButton-startIcon': { mr: { xs: 0, md: 1 }, ml: { xs: 0, md: -0.5 } },
                  transition: 'all 0.2s ease',
                  '&:hover': { bgcolor: '#e0e7fa', opacity: 0.8, transform: 'translateY(-1px)' },
                  '&.Mui-disabled': { bgcolor: '#e0e7fa', color: '#2563eb', opacity: 0.7 },
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                  {downloadingReport ? 'Generating…' : 'Consolidated Report'}
                </Box>
              </Button>
            )}

            {/* Client-side Consolidated Report — same button, different endpoint.
                A VIEWER hits /detections (RoleBasedRoute swaps in <ClientDetections />)
                — the URL stays /detections, not /client-detections. That's why the
                condition matches on `/detections` + role VIEWER, not the route name.
                ClientDetections.jsx registers handleDownloadClientReport via
                setDownloadConsolidatedReport so this button slot fires the client
                endpoint instead of the admin one. */}
            {location.pathname === '/detections' && user?.role === 'VIEWER' && (
              <Button
                variant="contained"
                startIcon={downloadingReport
                  ? <CircularProgress size={14} thickness={5} sx={{ color: '#2563eb' }} />
                  : <Download sx={{ fontSize: 16 }} />}
                disableElevation
                onClick={handleDownloadReportClick}
                disabled={downloadingReport}
                sx={{
                  height: 34,
                  borderRadius: '8px',
                  fontSize: 13,
                  fontWeight: 600,
                  textTransform: 'none',
                  bgcolor: '#e0e7fa',
                  color: '#2563eb',
                  px: { xs: 1, md: 2 },
                  minWidth: { xs: 40, md: 'auto' },
                  '& .MuiButton-startIcon': { mr: { xs: 0, md: 1 }, ml: { xs: 0, md: -0.5 } },
                  transition: 'all 0.2s ease',
                  '&:hover': { bgcolor: '#e0e7fa', opacity: 0.8, transform: 'translateY(-1px)' },
                  '&.Mui-disabled': { bgcolor: '#e0e7fa', color: '#2563eb', opacity: 0.7 },
                }}
              >
                <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>
                  {downloadingReport ? 'Generating…' : 'Consolidated Report'}
                </Box>
              </Button>
            )}
            
            {location.pathname === '/detections' && user?.role !== 'OPERATOR' && (
              <Button
                  variant="contained"
                  startIcon={<img src={`${import.meta.env.BASE_URL}file-excel-fill.svg`} alt="excel" style={{ width: 18, height: 18, filter: 'invert(32%) sepia(93%) saturate(1548%) hue-rotate(213deg) brightness(97%) contrast(93%)' }} />}
                  disableElevation
                  onClick={exportToExcel}
                  sx={{
                    height: 34,
                    borderRadius: '8px',
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: 'none',
                    bgcolor: '#e0e7fa',
                    color: '#2563eb',
                    px: { xs: 1, md: 2 },
                    minWidth: { xs: 40, md: 'auto' },
                    '& .MuiButton-startIcon': { mr: { xs: 0, md: 1 }, ml: { xs: 0, md: -0.5 } },
                    transition: 'all 0.2s ease',
                    '&:hover': { bgcolor: '#e0e7fa', opacity: 0.8, transform: 'translateY(-1px)' },
                  }}
                >
                  <Box component="span" sx={{ display: { xs: 'none', md: 'inline' } }}>Export detections</Box>
              </Button>
            )}

            {(location.pathname === '/') && user?.role !== 'OPERATOR' && (
              <Button
                variant="outlined"
                disableElevation
                startIcon={<Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#10b981', animation: 'pulse 1.5s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } } }} />}
                onClick={() => navigate('/exams')}
                sx={{
                  height: 24,
                  borderRadius: '20px',
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'none',
                  bgcolor: '#ecfdf5',
                  color: '#059669',
                  borderColor: '#10b981',
                  px: 1.5,
                  py: 1.5,
                  mr: 1,
                  '&:hover': { bgcolor: '#d1fae5', borderColor: '#10b981' },
                }}
              >
                {liveExamsCount} Live {liveExamsCount === 1 ? 'Exam' : 'Exams'}
              </Button>
            )}

            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small">
              <AccountCircle sx={{ fontSize: 32, color: '#94a3b8' }} />
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        PaperProps={{ sx: { mt: 1, minWidth: 150, borderRadius: 2 } }}
      >
        <MenuItem disabled>
          <AccountCircle sx={{ mr: 1, color: '#64748b' }} />
          <Box>
            <Typography variant="body2" fontWeight={600}>{user?.username}</Typography>
            <Typography variant="caption" color="text.secondary">{user?.role}</Typography>
            {user?.role !== 'ADMIN' && user?.company_name && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                {user.company_name}
              </Typography>
            )}
          </Box>
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout} sx={{ color: '#ef4444' }}>
          <Logout sx={{ mr: 1, fontSize: 18 }} />
          Logout
        </MenuItem>
      </Menu>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: 0 }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 'none' },
          }}
        >
          <SidebarContent
            items={filteredMenuItems}
            currentPath={location.pathname}
            onNavigate={handleNavigate}
            user={user}
          />
        </Drawer>

        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              borderRight: `1px solid ${sidebarPalette.border}`,
              overflowX: 'hidden',
            },
          }}
        >
          <SidebarContent
            items={filteredMenuItems}
            currentPath={location.pathname}
            onNavigate={handleNavigate}
            user={user}
          />
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          mt: `${APPBAR_HEIGHT}px`,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minWidth: 0,
          minHeight: `calc(100vh - ${APPBAR_HEIGHT}px)`,
          overflowX: 'hidden',
        }}
      >
        <Outlet />
      </Box>

      {/* Report Validation Snackbar - positioned below the button */}
      <Snackbar
        open={reportSnackbar.open}
        autoHideDuration={3000}
        onClose={() => setReportSnackbar({ ...reportSnackbar, open: false })}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{
          top: `${APPBAR_HEIGHT + 5}px !important`, // Position below the app bar + button
          right: '24px !important',
        }}
      >
        <Alert
          onClose={() => setReportSnackbar({ ...reportSnackbar, open: false })}
          severity={reportSnackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {reportSnackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// Layout used to wrap its children in its own <DetectionCountsProvider>,
// but App.jsx already wraps the entire app in one. Having two providers
// meant SocketProvider (outside Layout) was writing to the outer store
// while LayoutInner / pages were reading from the inner store — so live
// socket events updated state nobody was reading, and the counters froze
// until a manual refresh repopulated the inner store via REST. Removing
// the inner provider here makes the outer one the single source of truth.
const Layout = () => <LayoutInner />;

export default Layout;