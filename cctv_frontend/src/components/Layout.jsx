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
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard,
  School,
  Videocam,
  Schedule,
  Analytics,
  PlayCircle,
  Logout,
  AccountCircle,
  CameraAlt,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const sidebarPalette = {
  bg: '#ffffff',
  border: 'rgba(71, 85, 105, 0.18)',
  itemText: '#0f172a',
  itemIcon: '#64748b',
  itemHoverBg: '#f1f5f9',
  itemHoverText: '#0f172a',
  itemActiveBg: '#dbeafe',
  itemActiveText: '#1e3a8a',
};

const menuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/' },
  { text: 'Exams', icon: <School />, path: '/exams' },
  { text: 'Cameras', icon: <Videocam />, path: '/cameras' },
  { text: 'Shifts', icon: <Schedule />, path: '/shifts' },
  { text: 'Schedule Scripts', icon: <Analytics />, path: '/analytics' },
  { text: 'Executions', icon: <PlayCircle />, path: '/executions' },
  { text: 'Detections', icon: <CameraAlt />, path: '/detections' },
  { text: 'Client Detections', icon: <CameraAlt />, path: '/client-detections' },
];

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const drawerWidth = collapsed ? 70 : 200;

  // ✅ Role-based filtering
  const filteredMenuItems = menuItems.filter((item) => {
    if (user?.role === 'VIEWER') {
      return item.text === 'Client Detections';
    } else {
      return item.text !== 'Client Detections';
    }
  });

  // ✅ Redirect fix (VERY IMPORTANT)
  useEffect(() => {
    if (!filteredMenuItems.some(item => item.path === location.pathname)) {
      if (user?.role === 'VIEWER') {
        navigate('/client-detections');
      } else {
        navigate('/');
      }
    }
  }, [location.pathname, user]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuClick = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleProfileMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const drawer = (
    <Box sx={{ height: '100%', bgcolor: sidebarPalette.bg }}>
      <Toolbar
        sx={{
          borderBottom: `1px solid ${sidebarPalette.border}`,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <Videocam sx={{ mr: collapsed ? 0 : 1, color: '#2563eb' }} />
        {!collapsed && (
          <Typography variant="h6" fontWeight={700}>
            CCTV Monitor
          </Typography>
        )}
      </Toolbar>

      <Divider sx={{ borderColor: sidebarPalette.border }} />

      <List>
        {filteredMenuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <Tooltip title={collapsed ? item.text : ''} placement="right">
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => handleMenuClick(item.path)}
                sx={{
                  mx: 1,
                  my: 0.5,
                  borderRadius: 1.5,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  '& .MuiListItemIcon-root': {
                    minWidth: collapsed ? 'auto' : 40,
                    mr: collapsed ? 0 : 1,
                    color: sidebarPalette.itemIcon,
                  },
                  '&.Mui-selected': {
                    background: sidebarPalette.itemActiveBg,
                    color: sidebarPalette.itemActiveText,
                    '& .MuiListItemIcon-root': {
                      color: sidebarPalette.itemActiveText,
                    },
                  },
                }}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                {!collapsed && <ListItemText primary={item.text} />}
              </ListItemButton>
            </Tooltip>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {/* ✅ APP BAR */}
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          bgcolor: '#ffffff',
          color: '#000',
        }}
      >
        <Toolbar>
          {/* Mobile toggle */}
          <IconButton
            onClick={handleDrawerToggle}
            sx={{ display: { sm: 'none' }, mr: 2 }}
          >
            <MenuIcon />
          </IconButton>

          {/* Desktop collapse toggle */}
          <IconButton
            onClick={() => setCollapsed(!collapsed)}
            sx={{ display: { xs: 'none', sm: 'inline-flex' }, mr: 2 }}
          >
            <MenuIcon />
          </IconButton>

          {/* ✅ FIXED TITLE */}
          <Typography sx={{ flexGrow: 1 }}>
            {filteredMenuItems.find((item) => item.path === location.pathname)?.text || ''}
          </Typography>

          <Typography>{user?.username}</Typography>

          <IconButton onClick={handleProfileMenuOpen}>
            <Avatar>
              {user?.username?.charAt(0).toUpperCase()}
            </Avatar>
          </IconButton>
        </Toolbar>
      </AppBar>

      {/* PROFILE MENU */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleProfileMenuClose}>
        <MenuItem disabled>
          <AccountCircle sx={{ mr: 1 }} />
          {user?.role}
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <Logout sx={{ mr: 1 }} />
          Logout
        </MenuItem>
      </Menu>

      {/* DRAWERS */}
      <Box component="nav" sx={{ width: { sm: drawerWidth } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          sx={{ display: { xs: 'block', sm: 'none' } }}
        >
          {drawer}
        </Drawer>

        <Drawer
          variant="permanent"
          open
          sx={{ display: { xs: 'none', sm: 'block' } }}
        >
          {drawer}
        </Drawer>
      </Box>

      {/* MAIN */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: 8,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;