import React, { useState } from 'react';
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

const drawerWidth = 260;

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
];

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

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
    <Box sx={{ height: '100%', bgcolor: sidebarPalette.bg, color: sidebarPalette.itemText }}>
      <Toolbar
        sx={{
          background: '#ffffff',
          color: '#0f172a',
          borderBottom: `1px solid ${sidebarPalette.border}`,
        }}
      >
        <Videocam sx={{ mr: 1, color: '#2563eb' }} />
        <Typography variant="h6" fontWeight={700} noWrap component="div">
          CCTV Monitor
        </Typography>
      </Toolbar>
      <Divider sx={{ borderColor: sidebarPalette.border }} />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleMenuClick(item.path)}
              sx={{
                mx: 1,
                my: 0.5,
                borderRadius: 1.5,
                color: sidebarPalette.itemText,
                transition: 'all 0.18s ease',
                '& .MuiListItemText-primary': {
                  fontWeight: 500,
                },
                '& .MuiListItemIcon-root': {
                  color: sidebarPalette.itemIcon,
                  minWidth: 40,
                },
                '&:hover': {
                  backgroundColor: sidebarPalette.itemHoverBg,
                  color: sidebarPalette.itemHoverText,
                  '& .MuiListItemIcon-root': {
                    color: sidebarPalette.itemHoverText,
                  },
                },
                '&.Mui-selected': {
                  background: sidebarPalette.itemActiveBg,
                  color: sidebarPalette.itemActiveText,
                  boxShadow: 'inset 0 0 0 1px rgba(37, 99, 235, 0.22)',
                  '& .MuiListItemIcon-root': {
                    color: sidebarPalette.itemActiveText,
                  },
                  '&:hover': {
                    background: sidebarPalette.itemActiveBg,
                    color: '#1e3a8a',
                    '& .MuiListItemIcon-root': {
                      color: '#1e3a8a',
                    },
                  },
                },
              }}
            >
              <ListItemIcon>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
          color: '#0f172a',
          bgcolor: '#ffffff',
          borderBottom: '1px solid rgba(71, 85, 105, 0.18)',
          boxShadow: 'none',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {menuItems.find((item) => item.path === location.pathname)?.text || 'Dashboard'}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {user?.username}
            </Typography>
            <IconButton onClick={handleProfileMenuOpen}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', color: '#ffffff' }}>
                {user?.username?.charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        PaperProps={{
          sx: {
            bgcolor: '#ffffff',
            color: '#0f172a',
            border: '1px solid rgba(71, 85, 105, 0.18)',
          },
        }}
      >
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

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true,
          }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: `1px solid ${sidebarPalette.border}`,
              backgroundColor: sidebarPalette.bg,
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
              borderRight: `1px solid ${sidebarPalette.border}`,
              backgroundColor: sidebarPalette.bg,
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8,
          backgroundColor: '#f4f7fb',
          minHeight: '100vh',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
