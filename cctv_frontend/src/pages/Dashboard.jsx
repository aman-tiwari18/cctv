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
  Assignment,
  FolderOpen,
  Slideshow,
  Percent,
  CheckCircle,
  Cancel,
  Autorenew,
  MoreHoriz,
  InfoOutlined,
  Schedule
} from '@mui/icons-material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { examsAPI, executionsAPI } from '../services/api';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon';

const StatCard = ({ title, value, icon, color, loading }) => (
  <Card
    elevation={0}
    sx={{
      height: '100%',
      borderRadius: 3,
      boxShadow: 'none',
    }}
  >
    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
        <Box>
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
            {loading ? <CircularProgress size={24} /> : value}
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
      { name: 'COMPLETED', value: stats.executions.completed, color: '#4caf50' },
      { name: 'FAILED', value: stats.executions.failed, color: '#e1464c' },
      { name: 'RUNNING', value: stats.executions.running, color: '#2196f3' },
      { name: 'PENDING', value: stats.executions.pending, color: '#e1e9f3' },
    ]
    : [];

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={3} sx={{ fontSize: '0.9rem' }}>
        Real-time surveillance execution metrics
      </Typography>

      <Grid container spacing={2.5}>
        {/* Stats Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Exams"
            value={stats.exams}
            icon={<ExamsSvgIcon />}
            color="#3b6cf5"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Shifts"
            value={stats.upcomingShifts}
            icon={<Schedule />}
            color="#3b6cf5"
            loading={loading}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Executions"
            value={stats.executions?.total || 0}
            icon={<Slideshow />}
            color="#3b6cf5"
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
            icon={<Percent />}
            color="#3b6cf5"
            loading={loading}
          />
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
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#0f172a',
                textTransform: 'uppercase',
                fontSize: '0.85rem',
              }}
            >
              Execution Details
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 3 }}>
              Live cycle monitoring
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 7, mt: 1 }}>
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
                    <Typography variant="h5" fontWeight={700} sx={{ color: '#0f172a', lineHeight: 1.2 }}>
                      {loading ? <CircularProgress size={20} /> : (stats.executions?.[item.key] || 0)}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 600,
                        letterSpacing: '0.05em',
                        color: item.bgColor,
                        textTransform: 'uppercase',
                        fontSize: '0.65rem',
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
