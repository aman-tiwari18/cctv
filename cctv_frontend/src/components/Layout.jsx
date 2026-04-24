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
} from '@mui/icons-material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { useAuth } from '../contexts/AuthContext';
import { DetectionCountsProvider, useDetectionCounts } from '../contexts/DetectionCountsContext';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon';
import { CustomSvgIcon } from './DetectionSvgIcon';
import { ShiftSvgIcon } from './ShiftSvgIcon';
import CameraIcon from './CameraIcon';

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
  crowd: { label: 'Crowd Detection', icon: Groups, iconColor: '#e24d7b' },
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
};

const menuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/' },
  { text: 'Exams', icon: <ExamsSvgIcon />, path: '/exams' },
  { text: 'Cameras', icon: <CameraAltIcon />, path: '/cameras' },
  { text: 'Shifts', icon: <ShiftSvgIcon />, path: '/shifts' },
  { text: 'Schedule Analysis', icon: <Analytics />, path: '/analytics' },
  { text: 'Executions', icon: <Slideshow />, path: '/executions' },
  { text: 'Detections', icon: <CustomSvgIcon />, path: '/detections', hasSubItems: true },
  { text: 'Client Detections', icon: <Visibility />, path: '/client-detections', hasSubItems: true },
  { text: 'Client Dashboard', icon: <Dashboard />, path: '/client-dashboard' },
];

// Menu items for VIEWER role (reordered with Client Dashboard first)
const viewerMenuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/client-dashboard' }, // Renamed and reordered
  { text: 'Detections', icon: <CustomSvgIcon />, path: '/client-detections', hasSubItems: true },
];

/* ── Detection Sub-Items (multi-select) ── */
function DetectionSubItems({ counts, typeFilter, onTypeSelect }) {
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

/* ── Sidebar Content ── */
function SidebarContent({ items, currentPath, onNavigate }) {
  const { unfilteredCounts, typeFilter, setTypeFilter, } = useDetectionCounts();
  const [detectionsOpen, setDetectionsOpen] = useState(false);

  const isDetectionPage = currentPath === '/detections' || currentPath === '/client-detections';

  useEffect(() => {
    if (isDetectionPage) setDetectionsOpen(true);
  }, [isDetectionPage]);

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
          <CameraIcon sx={{ mr: 1, color: '#2563eb' }} />
          <Typography variant="h6" fontWeight={700} color="#0f172a" noWrap>
            CCTV Monitor
          </Typography>
        </Box>
      </Toolbar>

      <Divider sx={{ borderColor: sidebarPalette.border }} />

      <List sx={{ flex: 1, py: 1, overflowY: 'auto' }}>
        {items.map((item) => {
          const isActive = currentPath === item.path;
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
    </Box>
  );
}

/* ── Main Layout ── */
function LayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const { unfilteredCounts, exportToExcel, downloadConsolidatedReport } = useDetectionCounts();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  const filteredMenuItems = user?.role === 'VIEWER' 
    ? viewerMenuItems 
    : menuItems.filter(item => item.text !== 'Client Detections' && item.text !== 'Client Dashboard');

  // Allow certain paths that are not in menu (like user-verification)
  const allowedPaths = ['/user-verification'];

  useEffect(() => {
    const isAllowedPath = allowedPaths.includes(location.pathname);
    const isInMenu = filteredMenuItems.some((item) => item.path === location.pathname);
    
    if (!isInMenu && !isAllowedPath) {
      navigate(user?.role === 'VIEWER' ? '/client-dashboard' : '/');
    }
  }, [location.pathname, user]);

  const handleNavigate = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentPageTitle = location.pathname === '/user-verification' 
    ? 'User Verification'
    : (filteredMenuItems.find((item) => item.path === location.pathname)?.text || '');

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { sm: `${DRAWER_WIDTH}px` },
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
            sx={{ display: { sm: 'none' }, mr: 1.5, color: '#334155' }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            variant="h6"
            sx={{ fontWeight: 600, fontSize: '1.5rem' }}
          >
            {currentPageTitle}
          </Typography>

          {(location.pathname === '/detections' || location.pathname === '/client-detections') && (
            <Chip
              label={`TOTAL DETECTIONS | ${Object.values(unfilteredCounts).reduce((a, b) => a + b, 0).toLocaleString()}`}
              variant="outlined"
              sx={{
                ml: 2,
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

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {location.pathname === '/detections' && (
              <>
                <Button
                  variant="contained"
                  startIcon={<Download sx={{ fontSize: 16 }} />}
                  disableElevation
                  onClick={downloadConsolidatedReport}
                  sx={{
                    height: 34,
                    borderRadius: '8px',
                    fontSize: 13,
                    fontWeight: 600,
                    textTransform: 'none',
                    bgcolor: '#e0e7fa',
                    color: '#2563eb',
                    px: 2,
                    transition: 'all 0.2s ease',
                    '&:hover': { bgcolor: '#e0e7fa', opacity: 0.8, transform: 'translateY(-1px)' },
                  }}
                >
                  Consolidated Report
                </Button>
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
                    px: 2,
                    transition: 'all 0.2s ease',
                    '&:hover': { bgcolor: '#e0e7fa', opacity: 0.8, transform: 'translateY(-1px)' },
                  }}
                >
                  Export detections
                </Button>
              </>
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
        {user?.role === 'ADMIN' && (
          <>
            <MenuItem onClick={() => { navigate('/user-verification'); setAnchorEl(null); }}>
              <VerifiedUser sx={{ mr: 1, fontSize: 18, color: '#3b82f6' }} />
              Verify Users
            </MenuItem>
            <Divider />
          </>
        )}
        <MenuItem onClick={handleLogout} sx={{ color: '#ef4444' }}>
          <Logout sx={{ mr: 1, fontSize: 18 }} />
          Logout
        </MenuItem>
      </Menu>

      <Box component="nav" sx={{ width: { sm: DRAWER_WIDTH }, flexShrink: 0 }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 'none' },
          }}
        >
          <SidebarContent
            items={filteredMenuItems}
            currentPath={location.pathname}
            onNavigate={handleNavigate}
          />
        </Drawer>

        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
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
          />
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          mt: `${APPBAR_HEIGHT}px`,
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          minHeight: `calc(100vh - ${APPBAR_HEIGHT}px)`,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}

const Layout = () => (
  <DetectionCountsProvider>
    <LayoutInner />
  </DetectionCountsProvider>
);

export default Layout;