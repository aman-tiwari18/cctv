import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Chip, CircularProgress, Alert, Paper,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import { examsAPI, reportAPI } from '../services/api';

const fmtDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const todayISO = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Upcoming / Ongoing / Completed from the exam's start & end dates (yyyy-mm-dd
// string compare, so no timezone shifting). Archived exams keep their own label.
const examStatus = (exam) => {
  if (!exam.is_active) return { label: 'Archived', color: 'default' };
  const start = exam.start_date ? String(exam.start_date).slice(0, 10) : null;
  const end = exam.end_date ? String(exam.end_date).slice(0, 10) : start;
  const today = todayISO();
  if (start && today < start) return { label: 'Upcoming', color: 'info' };
  if (end && today > end) return { label: 'Completed', color: 'default' };
  if (start) return { label: 'Ongoing', color: 'success' };
  return { label: '—', color: 'default' };
};

export default function SummaryReports() {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await examsAPI.getAll();
        setExams(Array.isArray(res?.data?.data) ? res.data.data : []);
      } catch (e) {
        console.error('Error loading exams:', e);
        setError('Failed to load exams');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDownload = async (exam) => {
    setDownloadingId(exam.id);
    setError('');
    try {
      const res = await reportAPI.downloadSummaryReport({ exam_id: exam.id });
      const disposition = res.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : `Summary_${exam.exam_name}.xlsx`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Summary report download failed:', e);
      setError(`Failed to download summary report for ${exam.exam_name}`);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Summary Report</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Per-exam summary: online cameras per shift and total detections for each exam date.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Exam</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Body</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Start</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>End</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Report</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {exams.length === 0 && (
                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}>No exams found</TableCell></TableRow>
              )}
              {exams.map((exam) => (
                <TableRow key={exam.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{exam.exam_name}</TableCell>
                  <TableCell>{exam.exam_body || '—'}</TableCell>
                  <TableCell>{fmtDate(exam.start_date)}</TableCell>
                  <TableCell>{fmtDate(exam.end_date)}</TableCell>
                  <TableCell>
                    <Chip size="small" label={examStatus(exam).label} color={examStatus(exam).color} />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="contained"
                      disableElevation
                      size="small"
                      onClick={() => handleDownload(exam)}
                      disabled={downloadingId === exam.id}
                      startIcon={downloadingId === exam.id
                        ? <CircularProgress size={14} color="inherit" />
                        : <Download />}
                      sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                    >
                      Download Summary Report
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
