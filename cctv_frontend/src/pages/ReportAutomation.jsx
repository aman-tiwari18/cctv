import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Snackbar, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import {
  Add as AddIcon, Close as CloseIcon, DeleteOutline as DeleteOutlineIcon, EditOutlined as EditOutlinedIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import { examsAPI, reportAutomationAPI } from '../services/api';

const ALL_SHIFTS = 'all';
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

const STATUS = {
  pending: { label: 'Scheduled', color: 'info' },
  sending: { label: 'Sending', color: 'warning' },
  sent: { label: 'Sent', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  missed: { label: 'Missed', color: 'error' },
};

const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const formatDay = (iso) => (iso ? iso.split('-').reverse().join('-') : '');
const formatTime12 = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const formatInstant = (ms) => (ms
  ? new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })
  : '');

/** Chips for To / Cc. Enter, comma, space, paste or leaving the field all add the typed address. */
function EmailField({ label, value, onChange, required }) {
  const [input, setInput] = useState('');
  const addTokens = (list) => {
    const seen = new Set();
    onChange(list
      .flatMap((v) => String(v).split(/[\s,;]+/))
      .map((v) => v.trim())
      .filter((t) => {
        const key = t.toLowerCase();
        if (!t || seen.has(key)) return false;
        seen.add(key);
        return true;
      }));
    setInput('');
  };
  return (
    <Autocomplete
      multiple
      freeSolo
      autoSelect
      options={[]}
      value={value}
      inputValue={input}
      onInputChange={(_, next, reason) => { if (reason === 'input') setInput(next); }}
      onChange={(_, next) => addTokens(next)}
      renderTags={(tags, getTagProps) => tags.map((t, index) => {
        const { key, ...rest } = getTagProps({ index });
        const ok = EMAIL_RE.test(t);
        return <Chip key={key} {...rest} size="small" label={t} color={ok ? 'default' : 'error'} variant={ok ? 'filled' : 'outlined'} />;
      })}
      renderInput={(params) => (
        <TextField
          {...params}
          size="small"
          label={label}
          required={required && value.length === 0}
          placeholder={value.length ? '' : 'name@example.com'}
          helperText="Press Enter after each address"
          onKeyDown={(e) => {
            if ([',', ';', ' '].includes(e.key)) {
              e.preventDefault();
              if (input.trim()) addTokens([...value, input]);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/[\s,;]/.test(text.trim())) { e.preventDefault(); addTokens([...value, text]); }
          }}
        />
      )}
    />
  );
}

/** Add or edit one time: its recipients and the reports going out at that time. */
function ScheduleDialog({ open, onClose, onSaved, schedule, defaults, examId, date, shifts, reportTypes, examName }) {
  const blankItem = () => ({ report_type: reportTypes[0]?.value || '', shift: ALL_SHIFTS });
  const [sendDate, setSendDate] = useState('');
  const [time, setTime] = useState('');
  const [to, setTo] = useState([]);
  const [cc, setCc] = useState([]);
  const [subject, setSubject] = useState('');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSaving(false);
    if (schedule) {
      setSendDate(schedule.send_date);
      setTime(schedule.send_time);
      setTo(schedule.to_emails);
      setCc(schedule.cc_emails);
      setSubject(schedule.subject || '');
      setItems(schedule.items.map((i) => ({ report_type: i.report_type, shift: i.shift_id || ALL_SHIFTS })));
    } else {
      const today = todayIST();
      setSendDate(date > today ? date : today);
      setTime('');
      setTo(defaults.to);
      setCc(defaults.cc);
      setSubject('');
      setItems([blankItem()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schedule]);

  const setItem = (idx, patch) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const save = async () => {
    setError('');
    if (!sendDate) { setError('Select a send day.'); return; }
    if (sendDate < date) { setError('The send day cannot be before the report day.'); return; }
    if (!time) { setError('Select a time.'); return; }
    if (!to.length) { setError('Add at least one To address.'); return; }
    const bad = [...to, ...cc].find((e) => !EMAIL_RE.test(e));
    if (bad) { setError(`"${bad}" is not a valid email address.`); return; }
    if (!items.length) { setError('Assign at least one report to this time.'); return; }
    const body = {
      exam_id: examId,
      report_date: date,
      send_date: sendDate,
      send_time: time,
      to_emails: to,
      cc_emails: cc,
      subject: subject.trim(),
      items: items.map((i) => ({ report_type: i.report_type, shift_id: i.shift === ALL_SHIFTS ? null : i.shift })),
    };
    setSaving(true);
    try {
      if (schedule) await reportAutomationAPI.update(schedule.id, body);
      else await reportAutomationAPI.create(body);
      onSaved(schedule ? 'Schedule updated' : 'Schedule added');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not save this schedule.');
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {schedule ? 'Edit scheduled email' : 'Add an email'}
        <IconButton onClick={onClose} disabled={saving} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {examName} · reports for {formatDay(date)}. All reports here go out in one email.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Send day" type="date" size="small" required value={sendDate} onChange={(e) => setSendDate(e.target.value)}
              InputLabelProps={{ shrink: true }} inputProps={{ min: date }} sx={{ width: 200 }}
            />
            <TextField
              label="Send time (IST)" type="time" size="small" required value={time} onChange={(e) => setTime(e.target.value)}
              InputLabelProps={{ shrink: true }} sx={{ width: 200 }}
            />
          </Box>
          <EmailField label="To" value={to} onChange={setTo} required />
          <EmailField label="Cc" value={cc} onChange={setCc} />
          <TextField
            label="Subject (optional)" size="small" value={subject} inputProps={{ maxLength: 200 }}
            onChange={(e) => setSubject(e.target.value)}
            helperText="Left empty, the subject is made from the exam, shift and date."
          />
          <Box>
            <Typography sx={{ fontWeight: 700, mb: 1 }}>Reports</Typography>
            <Stack spacing={1.25}>
              {items.map((it, idx) => (
                // eslint-disable-next-line react/no-array-index-key
                <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
                  <FormControl size="small" sx={{ flex: 1, minWidth: 220 }}>
                    <InputLabel id={`ra-report-${idx}`}>Report</InputLabel>
                    <Select labelId={`ra-report-${idx}`} label="Report" value={it.report_type} onChange={(e) => setItem(idx, { report_type: e.target.value })}>
                      {reportTypes.map((r) => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ width: 170 }}>
                    <InputLabel id={`ra-shift-${idx}`}>Shift</InputLabel>
                    <Select labelId={`ra-shift-${idx}`} label="Shift" value={it.shift} onChange={(e) => setItem(idx, { shift: e.target.value })}>
                      <MenuItem value={ALL_SHIFTS}>All shifts</MenuItem>
                      {shifts.map((s) => <MenuItem key={s.id} value={s.id}>{s.shift_name}</MenuItem>)}
                    </Select>
                  </FormControl>
                  <Tooltip title="Remove this report">
                    <IconButton size="small" onClick={() => setItems((list) => list.filter((_, i) => i !== idx))}><DeleteOutlineIcon /></IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Stack>
            <Button startIcon={<AddIcon />} size="small" sx={{ mt: 1, textTransform: 'none', fontWeight: 700 }} onClick={() => setItems((list) => [...list, blankItem()])}>
              Add report
            </Button>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none' }}>Cancel</Button>
        <Button
          variant="contained" disableElevation onClick={save} disabled={saving}
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ScheduleCard({ schedule, onEdit, onDelete, onSend }) {
  const st = STATUS[schedule.status] || STATUS.pending;
  const sending = schedule.status === 'sending';
  const reports = schedule.result_summary?.reports;
  const retrying = schedule.status === 'pending' && schedule.attempts > 0;
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 1.25 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1.15rem' }}>{formatDay(schedule.send_date)}, {formatTime12(schedule.send_time)}</Typography>
        <Chip size="small" color={retrying ? 'warning' : st.color} label={retrying ? 'Retrying' : st.label} />
        {schedule.status === 'sent' && <Typography variant="caption" color="text.secondary">at {formatInstant(schedule.sent_at_ms)}</Typography>}
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small" startIcon={<SendIcon />} disabled={sending} onClick={() => onSend(schedule)}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          {schedule.status === 'sent' ? 'Send again' : 'Send now'}
        </Button>
        <Tooltip title="Edit"><span><IconButton size="small" disabled={sending} onClick={() => onEdit(schedule)}><EditOutlinedIcon /></IconButton></span></Tooltip>
        <Tooltip title="Delete"><span><IconButton size="small" disabled={sending} onClick={() => onDelete(schedule)}><DeleteOutlineIcon /></IconButton></span></Tooltip>
      </Box>

      {schedule.last_error && (
        <Alert severity={retrying ? 'warning' : 'error'} sx={{ mb: 1.25, py: 0 }}>
          {retrying && schedule.next_attempt_ms ? `Retrying at ${formatInstant(schedule.next_attempt_ms)}. ` : ''}{schedule.last_error}
        </Alert>
      )}

      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}><strong>To:</strong> {schedule.to_emails.join(', ')}</Typography>
      {schedule.cc_emails.length > 0 && (
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}><strong>Cc:</strong> {schedule.cc_emails.join(', ')}</Typography>
      )}
      {schedule.subject && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}><strong>Subject:</strong> {schedule.subject}</Typography>}

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.25 }}>
        {schedule.status === 'sent' && reports
          ? reports.map((r) => (
            <Tooltip key={`${r.type}-${r.shift}`} title={r.attached ? `Attached: ${r.rows.toLocaleString()} rows` : (r.note ? `The email said: ${r.note}` : `The email said: No detection in ${r.label} (${r.shift})`)}>
              <Chip size="small" variant="outlined" color={r.attached ? 'success' : 'default'} label={`${r.label} · ${r.shift}${r.attached ? '' : (r.note ? ' · not available' : ' · no detection')}`} />
            </Tooltip>
          ))
          : schedule.items.map((i) => (
            <Chip key={`${i.report_type}-${i.shift_id}`} size="small" variant="outlined" label={`${i.label} · ${i.shift_name}`} />
          ))}
      </Box>
    </Paper>
  );
}

export default function ReportAutomation() {
  const [exams, setExams] = useState([]);
  const [meta, setMeta] = useState(null);
  const [examId, setExamId] = useState('');
  const [date, setDate] = useState(todayIST());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState({ open: false, schedule: null });
  const [confirm, setConfirm] = useState(null);       // { kind: 'send' | 'delete', schedule }; kept until the dialog has closed
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [examRes, metaRes] = await Promise.all([examsAPI.getAll({ is_active: true }), reportAutomationAPI.meta()]);
        setExams(Array.isArray(examRes?.data?.data) ? examRes.data.data : []);
        setMeta(metaRes.data);
      } catch (e) {
        setError(e.response?.data?.message || 'Could not load this page.');
      }
    })();
  }, []);

  const exam = useMemo(() => exams.find((e) => e.id === examId) || null, [exams, examId]);
  const shifts = useMemo(() => (exam?.examShifts || [])
    .filter((s) => s.is_active !== false && s.is_active !== 0)
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time))), [exam]);

  const load = useCallback(async (quiet = false) => {
    if (!examId || !date) { setRows([]); return; }
    if (!quiet) setLoading(true);
    try {
      const res = await reportAutomationAPI.list({ exam_id: examId, date });
      setRows(res.data.data || []);
      setError('');
    } catch (e) {
      if (!quiet) { setRows([]); setError(e.response?.data?.message || 'Could not load the schedules.'); }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [examId, date]);

  useEffect(() => { load(); }, [load]);

  // Keep statuses current while the page is open.
  useEffect(() => {
    if (!examId || !date) return undefined;
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
  }, [examId, date, load]);

  const outsideExam = exam && ((exam.start_date && date < String(exam.start_date).slice(0, 10)) || (exam.end_date && date > String(exam.end_date).slice(0, 10)));
  const last = rows[rows.length - 1];    // a new email starts with the same recipients
  const defaults = { to: last?.to_emails || [], cc: last?.cc_emails || [] };

  const runConfirm = async () => {
    const { kind, schedule } = confirm;
    setBusy(true);
    try {
      if (kind === 'send') {
        await reportAutomationAPI.sendNow(schedule.id);
        setToast('Sending started. The status updates on this page.');
      } else {
        await reportAutomationAPI.remove(schedule.id);
        setToast('Schedule deleted');
      }
    } catch (e) {
      setError(e.response?.data?.message || 'That action failed.');
    } finally {
      setBusy(false);
      setConfirmOpen(false);
      load(true);
    }
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Choose an exam and the day the reports cover, then add emails. Each email has its own send day and time, and carries its client-side reports together.
      </Typography>

      {meta && !meta.email_configured && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Email is not set up on this server because RESEND_API_KEY is missing. Schedules can be saved, but they will fail until the key is added.
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 300, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}>
          <InputLabel id="ra-exam">Exam</InputLabel>
          <Select labelId="ra-exam" label="Exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
            {exams.map((e) => <MenuItem key={e.id} value={e.id}>{e.exam_name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Report day" type="date" size="small" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained" disableElevation startIcon={<AddIcon />} disabled={!examId || !date || !meta}
          onClick={() => setDialog({ open: true, schedule: null })}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
        >
          Add email
        </Button>
      </Paper>

      {outsideExam && <Alert severity="info" sx={{ mb: 2 }}>This report day is outside the exam's dates.</Alert>}

      {!examId ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>Select an exam to see its scheduled emails.</Typography>
      ) : loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : rows.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>No emails are scheduled for the {formatDay(date)} reports. Use Add email to create one.</Typography>
      ) : (
        <Stack spacing={1.5}>
          {rows.map((r) => (
            <ScheduleCard
              key={r.id}
              schedule={r}
              onEdit={(schedule) => setDialog({ open: true, schedule })}
              onDelete={(schedule) => { setConfirm({ kind: 'delete', schedule }); setConfirmOpen(true); }}
              onSend={(schedule) => { setConfirm({ kind: 'send', schedule }); setConfirmOpen(true); }}
            />
          ))}
        </Stack>
      )}

      <ScheduleDialog
        open={dialog.open}
        schedule={dialog.schedule}
        defaults={defaults}
        examId={examId}
        date={date}
        shifts={shifts}
        examName={exam?.exam_name || ''}
        reportTypes={meta?.report_types || []}
        onClose={() => setDialog({ open: false, schedule: null })}
        onSaved={(message) => { setDialog({ open: false, schedule: null }); setToast(message); load(true); }}
      />

      <Dialog open={confirmOpen} onClose={busy ? undefined : () => setConfirmOpen(false)} TransitionProps={{ onExited: () => setConfirm(null) }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>{confirm?.kind === 'send' ? 'Send this email now?' : 'Delete this schedule?'}</DialogTitle>
        <DialogContent>
          {confirm?.kind === 'send' ? (
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              The reports are built with the current data and sent to {[...confirm.schedule.to_emails, ...confirm.schedule.cc_emails].join(', ')}.
            </Typography>
          ) : (
            <Typography variant="body2">The email at {confirm ? `${formatDay(confirm.schedule.send_date)}, ${formatTime12(confirm.schedule.send_time)}` : ''} will not be sent.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button onClick={runConfirm} disabled={busy} variant="contained" disableElevation color={confirm?.kind === 'send' ? 'primary' : 'error'} sx={{ textTransform: 'none', fontWeight: 700 }}>
            {confirm?.kind === 'send' ? 'Send' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={4000} onClose={() => setToast('')} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Box>
  );
}
