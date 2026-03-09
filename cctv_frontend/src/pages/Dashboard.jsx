import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Paper,
} from '@mui/material';
import {
  School,
  Videocam,
  Schedule,
  Analytics,
  CheckCircle,
  Error,
  PlayArrow,
  Pending,
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { examsAPI, executionsAPI } from '../services/api';

const StatCard = ({ title, value, icon, color, loading }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography color="text.secondary" gutterBottom variant="body2">
            {title}
          </Typography>
          <Typography variant="h4" fontWeight="bold">
            {loading ? <CircularProgress size={24} /> : value}
          </Typography>
        </Box>
        <Box
          sx={{
            backgroundColor: `${color}20`,
            borderRadius: 2,
            p: 1.5,
          }}
        >
          {React.cloneElement(icon, { sx: { fontSize: 40, color } })}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const Dashboard = () => {
  const [stats, setStats] = useState({
    exams: 0,
    upcomingShifts: 0,
    executions: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [examsRes, executionsRes] = await Promise.all([
        examsAPI.getAll({ is_active: true }),
        executionsAPI.getStatistics(),
      ]);

      // Count total shifts across all exams
      const totalShifts = examsRes.data.data.reduce(
        (sum, exam) => sum + (exam.examShifts?.length || 0),
        0
      );

      setStats({
        exams: examsRes.data.count,
        upcomingShifts: totalShifts,
        executions: executionsRes.data.data,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const executionData = stats.executions
    ? [
        { name: 'Completed', value: stats.executions.completed, color: '#4caf50' },
        { name: 'Failed', value: stats.executions.failed, color: '#f44336' },
        { name: 'Running', value: stats.executions.running, color: '#2196f3' },
        { name: 'Pending', value: stats.executions.pending, color: '#ff9800' },
      ]
    : [];

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="body1" color="text.secondary" mb={3}>
        Overview of your CCTV monitoring system
      </Typography>

      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Exams"
            value={stats.exams}
            icon={<School />}
            color="#667eea"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Shifts"
            value={stats.upcomingShifts}
            icon={<Schedule />}
            color="#f093fb"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Executions"
            value={stats.executions?.total || 0}
            icon={<PlayArrow />}
            color="#4facfe"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Success Rate"
            value={
              stats.executions?.total
                ? `${Math.round((stats.executions.completed / stats.executions.total) * 100)}%`
                : '0%'
            }
            icon={<CheckCircle />}
            color="#43e97b"
            loading={loading}
          />
        </Grid>

        {/* Execution Status Chart */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              Execution Status Overview
            </Typography>
            {loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" height="300px">
                <CircularProgress />
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height="90%">
                <BarChart data={executionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" fill="#667eea" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* Execution Status Pie Chart */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, height: '400px' }}>
            <Typography variant="h6" gutterBottom>
              Status Distribution
            </Typography>
            {loading ? (
              <Box display="flex" justifyContent="center" alignItems="center" height="300px">
                <CircularProgress />
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <Pie
                    data={executionData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {executionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </Grid>

        {/* Quick Stats */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Execution Details
            </Typography>
            <Grid container spacing={2} mt={1}>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <CheckCircle sx={{ fontSize: 40, color: '#4caf50', mb: 1 }} />
                  <Typography variant="h5" fontWeight="bold">
                    {stats.executions?.completed || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Completed
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Error sx={{ fontSize: 40, color: '#f44336', mb: 1 }} />
                  <Typography variant="h5" fontWeight="bold">
                    {stats.executions?.failed || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Failed
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <PlayArrow sx={{ fontSize: 40, color: '#2196f3', mb: 1 }} />
                  <Typography variant="h5" fontWeight="bold">
                    {stats.executions?.running || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Running
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Pending sx={{ fontSize: 40, color: '#ff9800', mb: 1 }} />
                  <Typography variant="h5" fontWeight="bold">
                    {stats.executions?.pending || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Pending
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;
