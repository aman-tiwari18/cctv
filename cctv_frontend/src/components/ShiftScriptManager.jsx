import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Chip,
    Alert,
    Divider,
    CircularProgress,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Switch,
    Autocomplete,
} from '@mui/material';
import {
    Add,
    Delete,
    CheckCircle,
    Extension,
    WarningAmber,
    Groups,
    PersonOff,
    Dns,
    DirectionsWalk,
    MeetingRoom,
    Smartphone,
    VisibilityOff,
    Visibility,
    FlipCameraAndroid,
    SecurityUpdateWarning,
    EventSeat,
} from '@mui/icons-material';
import { shiftScriptsAPI, scriptsAPI, executionsAPI, smsAPI } from '../services/api';
import ExecutionStatusBadge from './ExecutionStatusBadge';

/* ─────────────────────────────────────────────────────────────
   Script meta: icon, iconColor, label, category
   Matches Layout.jsx TYPE_META exactly
───────────────────────────────────────────────────────────────*/
const SCRIPT_META = {
    proximity: {
        label: 'People too close',
        icon: WarningAmber,
        iconColor: '#5cb88a',
        bg: '#e5f5ed',
        color: '#5cb88a',
        category: 'people',
    },
    crowd: {
        label: 'Crowd detected (Entry/Exit)',
        icon: Groups,
        iconColor: '#e24d7b',
        bg: '#e9e3f8ff',
        color: '#e24d7b',
        category: 'people',
    },
    crowd_biometric: {
        label: 'Crowd detected (Biometric)',
        icon: Groups,
        iconColor: '#9333ea',
        bg: '#f3e8ff',
        color: '#9333ea',
        category: 'people',
    },
    crowd_five: {
        label: 'Large crowd detected',
        icon: Groups,
        iconColor: '#e06050',
        bg: '#fce8e6',
        color: '#e06050',
        category: 'people',
    },
    crowd_zero: {
        label: 'No people present',
        icon: PersonOff,
        iconColor: '#6b5b95',
        bg: '#edeaf3',
        color: '#6b5b95',
        category: 'people',
    },
    invigilator: {
        label: 'Supervisor present',
        icon: Visibility,
        iconColor: '#00bfcf',
        bg: '#cce8fcff',
        color: '#00bfcf',
        category: 'people',
    },
    phone: {
        label: 'Phone usage detected',
        icon: Smartphone,
        iconColor: '#465a38',
        bg: '#e8ece5',
        color: '#465a38',
        category: 'people',
    },
    server: {
        label: 'Server room activity',
        icon: Dns,
        iconColor: '#a0623d',
        bg: '#f3ebe4',
        color: '#a0623d',
        category: 'people',
    },
    intruder: {
        label: 'Unknown person detected',
        icon: DirectionsWalk,
        iconColor: '#d94466',
        bg: '#f0dfefff',
        color: '#d94466',
        category: 'people',
    },
    qp_box: {
        label: 'QP Box Not Visible In Strong Room',
        icon: Extension,
        iconColor: '#dc2626',
        bg: '#fee2e2',
        color: '#dc2626',
        category: 'movement',
    },
    entry_exit: {
        label: 'Entry/Exit activity',
        icon: MeetingRoom,
        iconColor: '#1d7a7d',
        bg: '#e0f0f0',
        color: '#1d7a7d',
        category: 'movement',
    },
    strongroom: {
        label: 'Strong Room Movement',
        icon: SecurityUpdateWarning,
        iconColor: '#b91c1c',
        bg: '#fef2f2',
        color: '#b91c1c',
        category: 'movement',
    },
    inversion: {
        label: 'Camera flipped',
        icon: FlipCameraAndroid,
        iconColor: '#7a86b4',
        bg: '#eceef5',
        color: '#7a86b4',
        category: 'camera',
    },
    tampering: {
        label: 'Camera disturbed',
        icon: SecurityUpdateWarning,
        iconColor: '#00c8d4',
        bg: '#e9f9ffff',
        color: '#00c8d4',
        category: 'camera',
    },
    blind_spot: {
        label: 'View blocked',
        icon: VisibilityOff,
        iconColor: '#b0a850',
        bg: '#f3f2e4',
        color: '#b0a850',
        category: 'camera',
    },
    furniture: {
        label: 'Improper furniture',
        icon: EventSeat,
        iconColor: '#c2410c',
        bg: '#fff1e6',
        color: '#c2410c',
        category: 'camera',
    },
    vision: {
        label: 'Vision Detection',
        icon: Visibility,
        iconColor: '#3b82f6',
        bg: '#dbeafe',
        color: '#3b82f6',
        category: 'camera',
    },
};

const CATEGORIES = [
    { key: 'people', label: 'People & Activity' },
    { key: 'movement', label: 'Movement & Alerts' },
    { key: 'camera', label: 'System & Camera' },
];

/**
 * ShiftScriptManager
 * Props:
 *   shift, examId, onUpdate          — original
 *   renderInline  (default true)     — false = dialog only
 *   openDialog    (external)         — parent-controlled open state
 *   onCloseDialog                    — close callback
 *   onScriptNamesReady(assignments)  — pass active assignments to parent
 */
// Scripts whose pushed detections can trigger an SMS alert (DLT-approved
// templates). SMS toggle is only shown for these, and only on exams whose
// client (exam_body) has an enabled SMS config (fetched from /sms/clients).
// Mirrors SMS_ELIGIBLE_TYPES in cctv_backend/src/services/smsService.js — keep
// the two in sync. A client that has no DLT template for one of these types
// simply skips the send (see sendAlertWithConfig), so listing it here is safe.
const SMS_ELIGIBLE_SCRIPTS = new Set([
    'invigilator',
    'proximity',
    'server',
    'intruder',
    'crowd',
    'phone',
    'entry_exit',
    'blind_spot',
]);

// Camera Type suggestions for the per-script filter. The first four are the SOP
// group names — they are not stored on any camera, the worker expands them into
// the DB classification values they cover (CLASSIFICATION_ALIASES in
// script-server/scripts/detection/utils/camera_loader.py — keep the two in sync):
//   Inside Lab   -> Computer Lab, Inside Classroom
//   Server Room  -> Server Room, Strong Room
//   Entry/Exit   -> Entry, Entry/Exit
//   Outside      -> Outside Area, Outdoor Scene, Parking Lot
// The rest are literal classification values. The field is freeSolo, so any
// other value present in the exam's cameras can still be typed in.
const DEFAULT_CLASSIFICATIONS = [
    'Inside Lab',
    'Server Room',
    'Entry/Exit',
    'Outside',
    'Inside Classroom',
    'Computer Lab',
    'Strong Room',
    'Biometric',
    'All Cameras',
];
// One-shot scripts — no cooldown loop, frequency field not applicable
const NO_FREQUENCY_SCRIPTS = new Set(['vision', 'vision_neet']);

let slotKeySeq = 0;
const emptySlot = () => ({
    key: `new-${++slotKeySeq}`,
    assignmentId: null,
    start: '',
    end: '',
    frequency: '',
    classifications: [],
    sms: false,
});

const ShiftScriptManager = ({
    shift,
    examId,
    examBody,
    onUpdate,
    renderInline = true,
    openDialog: externalOpenDialog,
    onCloseDialog: externalOnCloseDialog,
    onScriptNamesReady,
    dateOptions = {},
}) => {
    const [assignments, setAssignments] = useState([]);
    const [scripts, setScripts] = useState([]);
    const [executions, setExecutions] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [internalOpenDialog, setInternalOpenDialog] = useState(false);
    const [error, setError] = useState('');

    /* Per-script time windows: { [scriptDbId]: Slot[] }. A script can have more
       than one window on the same shift/date, each with its own time range,
       frequency, camera filter and SMS setting.
       Slot = { key, assignmentId (null for a not-yet-saved window), start, end,
                frequency, classifications, sms } */
    const [cardSlots, setCardSlots] = useState({});
    /* Which cards the user has clicked (show blue outline) */
    const [selectedCards, setSelectedCards] = useState(new Set());

    /* exam_body clients that have an enabled SMS config (NTA, SSC, ...) */
    const [smsClientBodies, setSmsClientBodies] = useState([]);
    const examHasSmsConfig = smsClientBodies
        .map((b) => String(b).toUpperCase())
        .includes(String(examBody || '').toUpperCase());
    const smsEligible = (script) =>
        examHasSmsConfig && SMS_ELIGIBLE_SCRIPTS.has(script?.script_id);

    useEffect(() => {
        let alive = true;
        smsAPI.getClients()
            .then((res) => { if (alive) setSmsClientBodies(res?.data?.bodies || []); })
            .catch(() => { if (alive) setSmsClientBodies([]); });
        return () => { alive = false; };
    }, []);

    /* Resolve dialog open state */
    const isDialogOpen = renderInline ? internalOpenDialog : !!externalOpenDialog;

    useEffect(() => {
        if (shift) {
            loadScripts();
            loadAssignments();
            if (renderInline) loadExecutions();
        } else {
            setSelectedDate('');
        }
    }, [shift, dateOptions]);

    /* Auto-select date */
    useEffect(() => {
        const active = assignments.filter((a) => a.is_active);
        const dates = [...new Set(active.map((a) => a.assignment_date).filter(Boolean))].sort();
        if (!dates.length) { if (selectedDate) setSelectedDate(''); return; }
        if (!selectedDate || !dates.includes(selectedDate)) {
            const today = new Date().toISOString().split('T')[0];
            setSelectedDate(dates.includes(today) ? today : dates[0]);
        }
    }, [assignments, selectedDate]);

    /* Report to parent */
    useEffect(() => {
        if (onScriptNamesReady) {
            onScriptNamesReady(assignments.filter((a) => a.is_active));
        }
    }, [assignments]);

    const activeAssignments = assignments.filter((a) => a.is_active);
    const availableDates = [...new Set(activeAssignments.map((a) => a.assignment_date).filter(Boolean))].sort();
    const visibleAssignments = selectedDate
        ? activeAssignments.filter((a) => a.assignment_date === selectedDate)
        : activeAssignments;

    /* Pre-fill card slots + selection when dialog opens or date changes.
       Each existing assignment becomes its own editable slot (carrying its
       assignmentId), and every script also gets one trailing blank slot so a
       new — possibly additional — time window can be typed straight into the
       card, same as before. */
    useEffect(() => {
        if (!isDialogOpen) {
            setCardSlots({});
            setSelectedCards(new Set());
            setError('');
            return;
        }

        const newCardSlots = {};
        const newSelectedCards = new Set();

        visibleAssignments.forEach((a) => {
            if (!a.script_id) return;
            newSelectedCards.add(a.script_id);
            if (!newCardSlots[a.script_id]) newCardSlots[a.script_id] = [];
            newCardSlots[a.script_id].push({
                key: `existing-${a.id}`,
                assignmentId: a.id,
                start: a.custom_start_time ? a.custom_start_time.substring(0, 5) : '',
                end: a.custom_end_time ? a.custom_end_time.substring(0, 5) : '',
                frequency: a.custom_frequency_minutes != null ? String(a.custom_frequency_minutes) : '',
                classifications: Array.isArray(a.camera_classifications) ? a.camera_classifications : [],
                sms: !!a.sms_enabled,
            });
        });

        scripts.forEach((s) => {
            if (!newCardSlots[s.id]) newCardSlots[s.id] = [];
            newCardSlots[s.id].push(emptySlot());
        });

        setCardSlots(newCardSlots);
        setSelectedCards(newSelectedCards);
        setError('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isDialogOpen, assignments, selectedDate, scripts]);

    const formatDate = (v) => {
        if (!v) return 'No date';
        const p = String(v).split('-');
        return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : v;
    };

    /* ── API helpers ── */
    const loadScripts = async () => {
        try {
            const res = await scriptsAPI.getAll({ is_active: true });
            setScripts(Array.isArray(res?.data?.data) ? res.data.data : []);
        } catch (e) { console.error('loadScripts:', e); }
    };

    const loadAssignments = async () => {
        if (!shift?.id) return;
        setLoading(true);
        try {
            const res = await shiftScriptsAPI.getByShift(shift.id);
            setAssignments(Array.isArray(res?.data?.data) ? res.data.data : []);
        } catch (e) { console.error('loadAssignments:', e); }
        finally { setLoading(false); }
    };

    const loadExecutions = async () => {
        if (!shift?.id) return;
        try {
            const res = await executionsAPI.getByShift(shift.id, { limit: 10 });
            setExecutions(Array.isArray(res?.data?.data) ? res.data.data : []);
        } catch { setExecutions([]); }
    };

    const handleOpenDialog = () => {
        if (renderInline) setInternalOpenDialog(true);
    };

    const handleCloseDialog = () => {
        if (renderInline) setInternalOpenDialog(false);
        else if (externalOnCloseDialog) externalOnCloseDialog();
        setCardSlots({}); setError('');
    };

    const updateSlot = (scriptDbId, slotKey, patch) => {
        setSelectedCards((prev) => new Set([...prev, scriptDbId]));
        setCardSlots((prev) => ({
            ...prev,
            [scriptDbId]: (prev[scriptDbId] || []).map((slot) =>
                slot.key === slotKey ? { ...slot, ...patch } : slot
            ),
        }));
    };

    const handleTimeChange = (scriptDbId, slotKey, field, value) => {
        updateSlot(scriptDbId, slotKey, { [field]: value });
    };

    const handleClassificationsChange = (scriptDbId, slotKey, value) => {
        updateSlot(scriptDbId, slotKey, { classifications: value });
    };

    const handleFrequencyChange = (scriptDbId, slotKey, value) => {
        updateSlot(scriptDbId, slotKey, { frequency: value });
    };

    const handleSmsToggle = (scriptDbId, slotKey, checked) => {
        updateSlot(scriptDbId, slotKey, { sms: checked });
    };

    /* Add another (blank) time window to a script card */
    const handleAddSlot = (scriptDbId) => {
        setSelectedCards((prev) => new Set([...prev, scriptDbId]));
        setCardSlots((prev) => ({
            ...prev,
            [scriptDbId]: [...(prev[scriptDbId] || []), emptySlot()],
        }));
    };

    /* Remove a not-yet-saved slot. Saved assignments are removed from the shift
       card's chips instead, so deleting one window never touches the others. */
    const handleRemoveSlot = (scriptDbId, slotKey) => {
        setCardSlots((prev) => ({
            ...prev,
            [scriptDbId]: (prev[scriptDbId] || []).filter((slot) => slot.key !== slotKey),
        }));
    };

    const handleCardClick = (scriptDbId) => {
        setSelectedCards((prev) => {
            const next = new Set(prev);
            if (next.has(scriptDbId)) next.delete(scriptDbId);
            else next.add(scriptDbId);
            return next;
        });
    };

    /* A slot is configured once BOTH start AND end are set */
    const isSlotConfigured = (slot) => !!(slot?.start && slot?.end);
    const isConfigured = (scriptDbId) => (cardSlots[scriptDbId] || []).some(isSlotConfigured);

    const configuredCount = scripts.reduce(
        (count, s) => count + (cardSlots[s.id] || []).filter(isSlotConfigured).length,
        0
    );

    const handleBulkSubmit = async () => {
        const toCreate = [];
        const toUpdate = [];

        scripts.forEach((s) => {
            (cardSlots[s.id] || []).forEach((slot) => {
                if (!isSlotConfigured(slot)) return;
                const freqVal = parseInt(slot.frequency, 10);
                const fields = {
                    custom_start_time: slot.start,
                    custom_end_time: slot.end,
                    custom_frequency_minutes: Number.isFinite(freqVal) && freqVal > 0 ? freqVal : null, // stored in seconds
                    camera_classifications: slot.classifications?.length > 0 ? slot.classifications : null,
                    // Only send SMS toggle for eligible scripts on NTA exams.
                    ...(smsEligible(s) ? { sms_enabled: !!slot.sms } : {}),
                };
                if (slot.assignmentId) {
                    toUpdate.push({ id: slot.assignmentId, fields });
                } else {
                    toCreate.push({ script_id: s.id, ...fields });
                }
            });
        });

        if (!toCreate.length && !toUpdate.length) {
            setError('Set START and END time for at least one script window.');
            return;
        }
        setSubmitting(true); setError('');
        try {
            if (toUpdate.length) {
                await Promise.all(toUpdate.map(({ id, fields }) => shiftScriptsAPI.update(id, fields)));
            }
            if (toCreate.length) {
                await shiftScriptsAPI.bulkAssign(shift.id, toCreate, dateOptions);
            }
            handleCloseDialog();
            loadAssignments();
            if (onUpdate) onUpdate();
        } catch (e) {
            setError(e?.response?.data?.message || 'Save failed. Please try again.');
        } finally { setSubmitting(false); }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Remove this script assignment?')) {
            try {
                await shiftScriptsAPI.delete(id);
                loadAssignments();
                if (onUpdate) onUpdate();
            } catch { alert('Failed to delete assignment'); }
        }
    };


    const scriptsByCategory = CATEGORIES.map(({ key, label }) => ({
        key, label,
        scripts: scripts.filter((s) => (SCRIPT_META[s.script_id]?.category ?? 'people') === key),
    })).filter((c) => c.scripts.length > 0);


    const dialogJSX = (
        <Dialog
            open={isDialogOpen}
            onClose={handleCloseDialog}
            maxWidth="md"
            fullWidth
            PaperProps={{ sx: { borderRadius: 3, maxHeight: '90vh', bgcolor: '#f5f5f7', m: { xs: 1.5, sm: 4 }, width: { xs: 'calc(100% - 24px)', sm: 'auto' } } }}
        >
            <DialogTitle sx={{ pb: 0.5, pt: 3, px: { xs: 2, sm: 3 } }}>
                <Typography variant="h5" component="div" fontWeight={800} color="#0f172a" gutterBottom>
                    Add Script
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Select a script type and configure the monitoring window.
                </Typography>
            </DialogTitle>

            <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                        {error}
                    </Alert>
                )}

                {scriptsByCategory.map(({ key, label, scripts: catScripts }) => (
                    <Box key={key} mb={3}>
                        <Typography
                            sx={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                color: '#94a3b8',
                                mb: 1.5,
                            }}
                        >
                            {label}
                        </Typography>
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                                alignItems: 'start',
                                gap: 1.5,
                            }}
                        >
                            {catScripts.map((script) => {
                                const configured = isConfigured(script.id);
                                const isSelected = selectedCards.has(script.id) || configured;
                                const slots = cardSlots[script.id] || [];
                                const meta = SCRIPT_META[script.script_id] || {};
                                const IconComp = meta.icon || Extension;
                                const iconColor = meta.iconColor
                                const bgcolor = meta.bg

                                const isExpanded = slots.length > 1;

                                return (
                                    <Box
                                        key={script.id}
                                        onClick={() => handleCardClick(script.id)}
                                        sx={{
                                            gridColumn: isExpanded ? '1 / -1' : 'auto',
                                            border: isSelected
                                                ? '2px solid #3b82f6'
                                                : 'none',
                                            borderRadius: 2.5,
                                            p: 2,
                                            bgcolor: '#fff',
                                            boxShadow: isSelected
                                                ? '0 0 0 3px rgba(59,130,246,0.08)'
                                                : 'none',
                                            transition: 'all 0.15s ease',
                                            position: 'relative',
                                            cursor: 'pointer',
                                            '&:hover': {
                                                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                                                borderColor: '#3b82f6',
                                            },
                                        }}
                                    >
                                        {configured && (
                                            <CheckCircle
                                                sx={{
                                                    position: 'absolute',
                                                    top: 10,
                                                    right: 10,
                                                    fontSize: 22,
                                                    color: '#3b82f6',
                                                }}
                                            />
                                        )}

                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                                            <Box
                                                sx={{
                                                    width: 38,
                                                    height: 38,
                                                    borderRadius: '10px',
                                                    bgcolor: bgcolor,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0,
                                                }}
                                            >
                                                <IconComp sx={{ fontSize: 20, color: iconColor }} />
                                            </Box>
                                            <Typography
                                                sx={{
                                                    fontWeight: 700,
                                                    fontSize: '0.88rem',
                                                    color: '#1e293b',
                                                    lineHeight: 1.3,
                                                    pr: configured ? 3 : 0,
                                                }}
                                            >
                                                {script.name.replace(/\bDetection\b/gi, '').trim()}
                                            </Typography>
                                        </Box>

                                        <Box
                                            sx={
                                                isExpanded
                                                    ? {
                                                          display: 'grid',
                                                          gridTemplateColumns: {
                                                              xs: '1fr',
                                                              sm: 'repeat(auto-fit, minmax(210px, 1fr))',
                                                          },
                                                          gap: 1.25,
                                                      }
                                                    : undefined
                                            }
                                        >
                                        {slots.map((slot, slotIdx) => (
                                            <Box
                                                key={slot.key}
                                                onClick={(e) => e.stopPropagation()}
                                                sx={
                                                    isExpanded
                                                        ? {
                                                              p: 1.25,
                                                              bgcolor: '#f8fafc',
                                                              border: '1px solid #eef2f7',
                                                              borderRadius: 2,
                                                          }
                                                        : undefined
                                                }
                                            >
                                                {isExpanded && (
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                                        <Typography sx={{ fontSize: '0.64rem', fontWeight: 800, letterSpacing: '0.06em', color: '#64748b' }}>
                                                            WINDOW {slotIdx + 1}
                                                        </Typography>
                                                        {!slot.assignmentId && (
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleRemoveSlot(script.id, slot.key)}
                                                                sx={{ p: 0.4, '&:hover': { bgcolor: '#fee2e2' } }}
                                                            >
                                                                <Delete sx={{ fontSize: 14, color: '#94a3b8' }} />
                                                            </IconButton>
                                                        )}
                                                    </Box>
                                                )}

                                                {/* Time pickers */}
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                                        <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', mb: 0.4 }}>
                                                            START TIME
                                                        </Typography>
                                                        <TextField
                                                            type="time"
                                                            size="small"
                                                            fullWidth
                                                            value={slot.start || ''}
                                                            onChange={(e) => handleTimeChange(script.id, slot.key, 'start', e.target.value)}
                                                            InputLabelProps={{ shrink: true }}
                                                            inputProps={{ style: { fontSize: '0.82rem', padding: '7px 8px' } }}
                                                            sx={{
                                                                '& .MuiOutlinedInput-root': {
                                                                    borderRadius: 1.5,
                                                                    bgcolor: '#f3f4f6',
                                                                    '& fieldset': { borderColor: '#fff' },
                                                                },
                                                            }}
                                                        />
                                                    </Box>
                                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                                        <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', mb: 0.4 }}>
                                                            END TIME
                                                        </Typography>
                                                        <TextField
                                                            type="time"
                                                            size="small"
                                                            fullWidth
                                                            value={slot.end || ''}
                                                            onChange={(e) => handleTimeChange(script.id, slot.key, 'end', e.target.value)}
                                                            InputLabelProps={{ shrink: true }}
                                                            inputProps={{ style: { fontSize: '0.82rem', padding: '7px 8px' } }}
                                                            sx={{
                                                                '& .MuiOutlinedInput-root': {
                                                                    borderRadius: 1.5,
                                                                    bgcolor: '#f3f4f6',
                                                                    '& fieldset': { borderColor: '#fff' },
                                                                },
                                                            }}
                                                        />
                                                    </Box>
                                                </Box>

                                                {/* Frequency input — hidden for one-shot scripts */}
                                                {!NO_FREQUENCY_SCRIPTS.has(script.script_id) && (
                                                <Box sx={{ mt: 1 }}>
                                                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', mb: 0.4 }}>
                                                        FREQUENCY (sec)
                                                    </Typography>
                                                    <TextField
                                                        type="number"
                                                        size="small"
                                                        fullWidth
                                                        placeholder="Default"
                                                        value={slot.frequency || ''}
                                                        onChange={(e) => handleFrequencyChange(script.id, slot.key, e.target.value)}
                                                        inputProps={{ min: 1, style: { fontSize: '0.82rem', padding: '7px 8px' } }}
                                                        sx={{
                                                            '& .MuiOutlinedInput-root': {
                                                                borderRadius: 1.5,
                                                                bgcolor: '#f3f4f6',
                                                                '& fieldset': { borderColor: '#fff' },
                                                            },
                                                        }}
                                                    />
                                                </Box>
                                                )}

                                                {/* Camera Classifications multi-select — hidden for one-shot scripts */}
                                                {!NO_FREQUENCY_SCRIPTS.has(script.script_id) && <Box sx={{ mt: 1 }}>
                                                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', mb: 0.4 }}>
                                                        CAMERA TYPE
                                                    </Typography>
                                                    <Autocomplete
                                                        multiple
                                                        freeSolo
                                                        size="small"
                                                        options={DEFAULT_CLASSIFICATIONS}
                                                        value={slot.classifications || []}
                                                        onChange={(_, newValue) => handleClassificationsChange(script.id, slot.key, newValue)}
                                                        renderTags={(value, getTagProps) =>
                                                            value.map((option, index) => (
                                                                <Chip
                                                                    key={index}
                                                                    label={option}
                                                                    size="small"
                                                                    {...getTagProps({ index })}
                                                                    sx={{ fontSize: '0.68rem', height: 20 }}
                                                                />
                                                            ))
                                                        }
                                                        renderInput={(params) => (
                                                            <TextField
                                                                {...params}
                                                                placeholder={slot.classifications?.length ? '' : 'Default (all)'}
                                                                sx={{
                                                                    '& .MuiOutlinedInput-root': {
                                                                        borderRadius: 1.5,
                                                                        bgcolor: '#f3f4f6',
                                                                        fontSize: '0.82rem',
                                                                        '& fieldset': { borderColor: '#fff' },
                                                                    },
                                                                }}
                                                            />
                                                        )}
                                                    />
                                                </Box>}

                                                {/* SMS alert toggle — NTA + eligible scripts only */}
                                                {smsEligible(script) && (
                                                    <Box
                                                        sx={{
                                                            mt: 1.25,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            bgcolor: '#f8fafc',
                                                            border: '1px solid #eef2f7',
                                                            borderRadius: 1.5,
                                                            px: 1,
                                                            py: 0.25,
                                                        }}
                                                    >
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                            <Smartphone sx={{ fontSize: 16, color: '#64748b' }} />
                                                            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>
                                                                SMS alert
                                                            </Typography>
                                                        </Box>
                                                        <Switch
                                                            size="small"
                                                            checked={!!slot.sms}
                                                            onChange={(e) => handleSmsToggle(script.id, slot.key, e.target.checked)}
                                                        />
                                                    </Box>
                                                )}
                                            </Box>
                                        ))}
                                        </Box>

                                        {/* Add another independent time window for this script */}
                                        <Button
                                            fullWidth
                                            size="small"
                                            startIcon={<Add sx={{ fontSize: 16 }} />}
                                            onClick={(e) => { e.stopPropagation(); handleAddSlot(script.id); }}
                                            sx={{
                                                mt: 1.25,
                                                py: 0.7,
                                                fontSize: '0.7rem',
                                                fontWeight: 700,
                                                color: '#3b82f6',
                                                textTransform: 'none',
                                                borderRadius: 1.5,
                                                border: '1px dashed #bfdbfe',
                                                '&:hover': { bgcolor: '#eff6ff', borderColor: '#93c5fd' },
                                            }}
                                        >
                                            Add another time window
                                        </Button>
                                    </Box>
                                );
                            })}
                        </Box>

                        {/* Divider between categories */}
                        <Divider sx={{ mt: 2.5 }} />
                    </Box>
                ))}

                {scripts.length === 0 && (
                    <Box sx={{ textAlign: 'center', py: 6 }}>
                        <Typography color="text.secondary">
                            No scripts available. Add scripts in the Scripts page.
                        </Typography>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, gap: 1, flexWrap: 'wrap', borderTop: '1px solid #f1f5f9' }}>
                {configuredCount > 0 && (
                    <Typography sx={{ flex: 1, fontSize: '0.82rem', color: '#3b82f6', fontWeight: 600 }}>
                        {configuredCount} time window{configuredCount > 1 ? 's' : ''} ready to save
                    </Typography>
                )}
                <Button onClick={handleCloseDialog} sx={{ color: '#64748b', fontWeight: 600 }}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    onClick={handleBulkSubmit}
                    disabled={submitting || configuredCount === 0}
                    disableElevation
                    sx={{
                        bgcolor: 'primary.main',
                        fontWeight: 700,
                        borderRadius: 2,
                        px: 3,
                        '&:hover': { bgcolor: 'primary.dark' },
                        '&.Mui-disabled': { bgcolor: '#93c5fd', color: '#fff' },
                    }}
                >
                    {submitting ? <CircularProgress size={18} color="inherit" /> : 'Add to Shift'}
                </Button>
            </DialogActions>
        </Dialog>
    );

    if (!renderInline) return dialogJSX;


    if (!shift) {
        return (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
                <Typography color="text.secondary">Select a shift to manage scripts</Typography>
            </Paper>
        );
    }

    return (
        <Box>
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Box>
                        <Typography variant="h6" fontWeight="bold">{shift.shift_name}</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {shift.start_time?.substring(0, 5)} - {shift.end_time?.substring(0, 5)}
                        </Typography>
                    </Box>
                    <Button variant="contained" startIcon={<Add />} onClick={handleOpenDialog} size="small">
                        Add Script
                    </Button>
                </Box>

                <Divider sx={{ my: 2 }} />

                {availableDates.length > 0 && (
                    <Box mb={2} display="flex" gap={2} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel id="adate-label">Assignment Date</InputLabel>
                            <Select
                                labelId="adate-label"
                                value={selectedDate}
                                label="Assignment Date"
                                onChange={(e) => setSelectedDate(e.target.value)}
                            >
                                {availableDates.map((d) => (
                                    <MenuItem key={d} value={d}>{formatDate(d)}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Chip
                            label={`${visibleAssignments.length} script${visibleAssignments.length === 1 ? '' : 's'} on ${formatDate(selectedDate)}`}
                            color="primary"
                            variant="outlined"
                        />
                    </Box>
                )}

                {loading ? (
                    <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>
                ) : visibleAssignments.length > 0 ? (
                    <List>
                        {visibleAssignments.map((assignment) => (
                            <ListItem key={assignment.id} divider>
                                <ListItemText
                                    primary={
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Typography variant="body1" fontWeight="medium">
                                                {assignment.script?.name || 'Unknown Script'}
                                            </Typography>
                                            {assignment.script?.script_id && (
                                                <Chip label={assignment.script.script_id} size="small" color="secondary" variant="outlined" />
                                            )}
                                            {assignment.sms_enabled && (
                                                <Chip
                                                    icon={<Smartphone sx={{ fontSize: 13 }} />}
                                                    label="SMS"
                                                    size="small"
                                                    color="success"
                                                    variant="outlined"
                                                />
                                            )}
                                        </Box>
                                    }
                                    secondary={
                                        <Box mt={0.5}>
                                            {(assignment.custom_start_time || assignment.custom_end_time) && (
                                                <Typography variant="caption" color="text.secondary">
                                                    Custom Time: {assignment.custom_start_time || 'N/A'} – {assignment.custom_end_time || 'N/A'}
                                                </Typography>
                                            )}
                                            {assignment.custom_frequency_minutes != null && (
                                                <Typography variant="caption" display="block" color="text.secondary">
                                                    Frequency: {assignment.custom_frequency_minutes} min
                                                </Typography>
                                            )}
                                            {assignment.notes && (
                                                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                                                    Note: {assignment.notes}
                                                </Typography>
                                            )}
                                        </Box>
                                    }
                                />
                                <ListItemSecondaryAction>
                                    <IconButton size="small" onClick={() => handleDelete(assignment.id)}>
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </ListItemSecondaryAction>
                            </ListItem>
                        ))}
                    </List>
                ) : (
                    <Typography variant="body2" color="text.secondary" textAlign="center" py={2}>
                        {availableDates.length > 0
                            ? `No scripts assigned for ${formatDate(selectedDate)}.`
                            : 'No scripts assigned to this shift. Click "Add Script" to assign one.'}
                    </Typography>
                )}
            </Paper>

            {executions.length > 0 && (
                <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" fontWeight="bold" mb={2}>Recent Executions</Typography>
                    <List dense>
                        {executions.slice(0, 5).map((execution) => (
                            <ListItem key={execution.id}>
                                <ListItemText
                                    primary={execution.script?.name || execution.execution_metadata?.script_name || 'Script'}
                                    secondary={new Date(execution.scheduled_time).toLocaleString()}
                                />
                                <ExecutionStatusBadge status={execution.status} size="small" />
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            )}

            {dialogJSX}
        </Box>
    );
};

export default ShiftScriptManager;
