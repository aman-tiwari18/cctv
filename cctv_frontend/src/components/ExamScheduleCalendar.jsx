import React, { useState, useMemo, useEffect } from 'react';
import { Box, IconButton, Popover, Typography, Tooltip } from '@mui/material';
import { CalendarTodayOutlined, ChevronLeft, ChevronRight } from '@mui/icons-material';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Parse a 'YYYY-MM-DD' string into a LOCAL-midnight Date (avoids the UTC
// off-by-one that `new Date('YYYY-MM-DD')` causes in negative-offset zones).
const parseISO = (value) => {
  if (!value) return null;
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

// Build a 'YYYY-MM-DD' key from a Date's LOCAL components (matches skip_dates).
const toDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Read-only calendar trigger for an exam card. Renders the calendar icon; on
 * click opens a popover showing the exam's month(s) with every in-range day
 * marked active (blue) and skip days/dates marked skipped (red + strikethrough).
 */
const ExamScheduleCalendar = ({ exam, iconSx }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const start = useMemo(() => parseISO(exam.start_date), [exam.start_date]);
  const end = useMemo(() => parseISO(exam.end_date), [exam.end_date]);
  const skipDaysSet = useMemo(() => new Set(exam.skip_days || []), [exam.skip_days]);
  const skipDatesSet = useMemo(() => new Set((exam.skip_dates || []).map((d) => String(d))), [exam.skip_dates]);

  // Month currently displayed (1st of month). Defaults to the exam's start month.
  const [calMonth, setCalMonth] = useState(() => (start ? new Date(start.getFullYear(), start.getMonth(), 1) : new Date()));

  // Reset to the start month each time the popover opens.
  useEffect(() => {
    if (open && start) setCalMonth(new Date(start.getFullYear(), start.getMonth(), 1));
  }, [open, start]);

  const calYear = calMonth.getFullYear();
  const calMonthIdx = calMonth.getMonth();

  // Clamp month navigation to the exam's start..end month span.
  const startMonthVal = start ? start.getFullYear() * 12 + start.getMonth() : -Infinity;
  const endMonthVal = end ? end.getFullYear() * 12 + end.getMonth() : Infinity;
  const curMonthVal = calYear * 12 + calMonthIdx;
  const canPrev = curMonthVal > startMonthVal;
  const canNext = curMonthVal < endMonthVal;

  const days = useMemo(() => {
    const firstDay = new Date(calYear, calMonthIdx, 1).getDay();
    const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(calYear, calMonthIdx, d));
    return arr;
  }, [calYear, calMonthIdx]);

  // Totals across the whole range, for the footer counts.
  const { activeCount, skippedCount } = useMemo(() => {
    if (!start || !end) return { activeCount: 0, skippedCount: 0 };
    let active = 0;
    let skipped = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const isSkip = skipDaysSet.has(DAY_NAMES_FULL[cur.getDay()]) || skipDatesSet.has(toDateString(cur));
      if (isSkip) skipped++; else active++;
      cur.setDate(cur.getDate() + 1);
    }
    return { activeCount: active, skippedCount: skipped };
  }, [start, end, skipDaysSet, skipDatesSet]);

  const classify = (day) => {
    if (!day) return 'blank';
    const inRange = start && end && day >= start && day <= end;
    if (!inRange) return 'out';
    const isSkip = skipDaysSet.has(DAY_NAMES_FULL[day.getDay()]) || skipDatesSet.has(toDateString(day));
    return isSkip ? 'skipped' : 'active';
  };

  const handleOpen = (e) => { e.stopPropagation(); setAnchorEl(e.currentTarget); };
  const handleClose = (e) => { if (e) e.stopPropagation?.(); setAnchorEl(null); };

  return (
    <>
      <Tooltip title="View schedule">
        <IconButton
          size="small"
          onClick={handleOpen}
          sx={{ p: 0.3, color: '#676e80', flexShrink: 0, '&:hover': { bgcolor: '#e2e8f0', color: '#3b82f6' } }}
        >
          <CalendarTodayOutlined sx={{ fontSize: 16, ...iconSx }} />
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{ sx: { borderRadius: 3, p: 2, width: 300, maxWidth: 'calc(100vw - 32px)', boxShadow: '0 10px 30px rgba(0,0,0,0.12)' } }}
      >
        {/* Month nav */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }} onClick={(e) => e.stopPropagation()}>
          <IconButton size="small" disabled={!canPrev} onClick={() => setCalMonth(new Date(calYear, calMonthIdx - 1, 1))}>
            <ChevronLeft sx={{ fontSize: 20 }} />
          </IconButton>
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b' }}>
            {MONTH_NAMES[calMonthIdx]} {calYear}
          </Typography>
          <IconButton size="small" disabled={!canNext} onClick={() => setCalMonth(new Date(calYear, calMonthIdx + 1, 1))}>
            <ChevronRight sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>

        {/* Day-of-week labels */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5 }}>
          {DAY_LABELS.map((l) => (
            <Typography key={l} sx={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: 700, color: '#94a3b8', py: 0.5 }}>{l}</Typography>
          ))}
        </Box>

        {/* Days grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
          {days.map((day, i) => {
            const kind = classify(day);
            const styles = {
              active: { bgcolor: '#eff6ff', color: '#2563eb', fontWeight: 700, textDecoration: 'none' },
              skipped: { bgcolor: '#fef2f2', color: '#ef4444', fontWeight: 600, textDecoration: 'line-through' },
              out: { bgcolor: 'transparent', color: '#cbd5e1', fontWeight: 400, textDecoration: 'none' },
              blank: {},
            }[kind];
            return (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: '2px' }}>
                {day && (
                  <Box sx={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, ...styles }}>
                    {day.getDate()}
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        {/* Legend + counts */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1.5, pt: 1.5, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#3b82f6' }} />
            <Typography sx={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>Active ({activeCount})</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ef4444' }} />
            <Typography sx={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>Skipped ({skippedCount})</Typography>
          </Box>
        </Box>
      </Popover>
    </>
  );
};

export default ExamScheduleCalendar;
