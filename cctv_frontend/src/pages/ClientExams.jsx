import React, { useState, useEffect, useCallback } from 'react';
import { Box, Grid, Typography, CircularProgress, Chip } from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { useNavigate } from 'react-router-dom';
import { examsAPI } from '../services/api';
import { ShiftSvgIcon } from '../components/ShiftSvgIcon';
import ExamScheduleCalendar from '../components/ExamScheduleCalendar';


const formatDateV1 = (date) =>
  new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// today, or the exam's last date — whichever is earlier → "DD-MM-YYYY"
const examDefaultDate = (exam) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let d = today;
  const end = exam?.end_date ? new Date(exam.end_date) : null;
  if (end && !isNaN(end)) { end.setHours(0, 0, 0, 0); if (end < today) d = end; }
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
};

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
        p: { xs: 2.5, sm: 3 }, py: 3.5, height: { xs: 'auto', sm: '100%' }, minHeight: { xs: 'auto', md: 340 }, maxWidth: 530,
        display: 'flex', flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
        <Typography title={exam.exam_name} sx={{ fontWeight: 600, fontSize: { xs: '1.15rem', sm: '1.3rem' }, color: '#0f172a', lineHeight: 1.25, flex: '1 1 auto', minWidth: 0, wordBreak: 'break-word' }}>
          {exam.exam_name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexShrink: 0 }}>
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

      <Box sx={{ bgcolor: '#f1f5f9', borderRadius: 3, p: { xs: 2, sm: 1.75 }, mb: 2.5 }}>
        {exam.start_date && exam.end_date && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.2 }}>
            <ExamScheduleCalendar exam={exam} />
            <Typography sx={{ fontSize: { xs: '0.95rem', sm: '0.84rem' }, fontWeight: 600, color: '#676e80' }}>
              {formatDateV1(exam.start_date)} - {formatDateV1(exam.end_date)}
            </Typography>
          </Box>
        )}
        {totalDays > 0 && (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 0.9 }}>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8', whiteSpace: 'nowrap' }}>Total Days-{totalDays}</Typography>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8', whiteSpace: 'nowrap' }}>Skipped Days-{totalDays - validDays}</Typography>
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
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, mb: 2 }}>
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

      <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />

      {/* Bottom row: only camera + detection icons */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3, rowGap: 1, pt: 2, mt: 2 }}>
        <Box
          onClick={() => navigate(`/cameras?exam=${exam.id}`)}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.8, cursor: 'pointer', '&:hover': { opacity: 0.75, color: '#3c81f6' } }}
        >
          <CameraAltIcon sx={{ fontSize: 18, color: '#8b929cff' }} />
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: '#475569', '&:hover': { color: '#3c81f6' } }}>
            {String(exam.camera_count || 0).padStart(2, '0')}
          </Typography>
        </Box>
        <Box
          onClick={() => navigate(`/detections?exam_id=${exam.id}&date=${examDefaultDate(exam)}`)}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.8, cursor: 'pointer', '&:hover': { opacity: 0.75, color: '#3c81f6' } }}
        >
          <ReportProblemIcon sx={{ fontSize: 18, color: '#8b929cff' }} />
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#333', '&:hover': { color: '#3c81f6' } }}>
            {String(examCounts[exam.id]?.detections || 0).padStart(2, '0')}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

const ClientExams = () => {
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examCounts, setExamCounts] = useState({});

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
    loadExams();
  }, [loadExams]);

  if (examsLoading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px"><CircularProgress /></Box>;
  }

  if (exams.length === 0) {
    return <Box textAlign="center" py={8}><Typography variant="h6" color="text.secondary">No exams found</Typography></Box>;
  }

  return (
    <Box>
      <Grid container spacing={3}>
        {exams.map((exam) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={exam.id}>
            <ViewOnlyExamCard exam={exam} examCounts={examCounts} navigate={navigate} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default ClientExams;
