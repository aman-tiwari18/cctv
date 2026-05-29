import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    ClickAwayListener,
    FormControl,
    InputBase,
    List,
    ListItemButton,
    MenuItem,
    Paper,
    Popper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Typography,
    Grid,
} from '@mui/material';
import { format, subDays } from 'date-fns';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import Dns from '@mui/icons-material/Dns';
import Groups from '@mui/icons-material/Groups';
import DirectionsWalk from '@mui/icons-material/DirectionsWalk';
import MeetingRoom from '@mui/icons-material/MeetingRoom';
import WarningAmber from '@mui/icons-material/WarningAmber';
import Smartphone from '@mui/icons-material/Smartphone';
import PersonOff from '@mui/icons-material/PersonOff';
import FlipCameraAndroid from '@mui/icons-material/FlipCameraAndroid';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Visibility from '@mui/icons-material/Visibility';
import Extension from '@mui/icons-material/Extension';
import SecurityUpdateWarning from '@mui/icons-material/SecurityUpdateWarning';
import { clientDashboardAPI, examsAPI } from '../services/api';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon';
import { ShiftSvgIcon } from '../components/ShiftSvgIcon';
import { CustomSvgIcon } from '../components/DetectionSvgIcon';
import {
    KpiCard,
    DetectionDistributionCard,
    LiveExamsCard,
    AdvancedFiltersDialog,
} from './Dashboard';

// ---------------------------------------------------------------------------
// TodaysScriptDistributionCard — per-shift schedule table for the client.
// Icons + bg colors mirror SCRIPT_META in components/ShiftScriptManager.jsx
// so the visual treatment stays consistent with the Add Script picker.
// Dropdown is populated from /client-dashboard/live-exams (deduped by exam_id);
// grid is populated from /exams/:examId/shift-scripts?assignment_date=today.
// ---------------------------------------------------------------------------

const SCRIPT_DEFS = [
    // People & Activity
    { key: 'server',          label: 'Server Room',       icon: Dns,                   iconColor: '#a0623d', bg: '#f3ebe4' },
    { key: 'crowd',           label: 'Crowd',             icon: Groups,                iconColor: '#e24d7b', bg: '#e9e3f8' },
    { key: 'crowd_biometric', label: 'Crowd (Biometric)', icon: Groups,                iconColor: '#9333ea', bg: '#f3e8ff' },
    { key: 'crowd_five',      label: 'Large Crowd',       icon: Groups,                iconColor: '#e06050', bg: '#fce8e6' },
    { key: 'crowd_zero',      label: 'Zero Person',       icon: PersonOff,             iconColor: '#6b5b95', bg: '#edeaf3' },
    { key: 'invigilator',     label: 'Invigilator',       icon: Visibility,            iconColor: '#00bfcf', bg: '#cce8fc' },
    { key: 'phone',           label: 'Phone',             icon: Smartphone,            iconColor: '#465a38', bg: '#e8ece5' },
    { key: 'intruder',        label: 'Intruder',          icon: DirectionsWalk,        iconColor: '#d94466', bg: '#f0dfef' },
    { key: 'proximity',       label: 'Proximity',         icon: WarningAmber,          iconColor: '#5cb88a', bg: '#e5f5ed' },
    // Movement & Alert
    { key: 'entry_exit',      label: 'Entry Exit',        icon: MeetingRoom,           iconColor: '#1d7a7d', bg: '#e0f0f0' },
    { key: 'qp_box',          label: 'QP Box',            icon: Extension,             iconColor: '#dc2626', bg: '#fee2e2' },
    { key: 'strongroom',      label: 'Strong Room',       icon: SecurityUpdateWarning, iconColor: '#b91c1c', bg: '#fef2f2' },
    // Camera & System
    { key: 'inversion',       label: 'Camera Inversion',  icon: FlipCameraAndroid,     iconColor: '#7a86b4', bg: '#eceef5' },
    { key: 'tampering',       label: 'Camera Tampering',  icon: SecurityUpdateWarning, iconColor: '#00c8d4', bg: '#e9f9ff' },
    { key: 'blind_spot',      label: 'Blind Spot',        icon: VisibilityOff,         iconColor: '#b0a850', bg: '#f3f2e4' },
    { key: 'vision',          label: 'Vision',            icon: Visibility,            iconColor: '#3b82f6', bg: '#dbeafe' },
];

// "HH:MM:SS" → "HH:MM" — backend returns time strings already in this shape.
const fmtTime = (t) => (typeof t === 'string' ? t.slice(0, 5) : '');

const TodaysScriptDistributionCard = () => {
    const [exams, setExams] = useState([]);
    const [examsLoading, setExamsLoading] = useState(true);
    const [selectedExamId, setSelectedExamId] = useState('');
    const [assignments, setAssignments] = useState([]);
    const [examShifts, setExamShifts] = useState([]);
    const [assignmentsLoading, setAssignmentsLoading] = useState(false);

    // Load the exam dropdown from /client-dashboard/live-exams. Each row in
    // that response is an (exam, shift) tuple, so dedupe by exam_id.
    useEffect(() => {
        let cancelled = false;
        setExamsLoading(true);
        clientDashboardAPI
            .getLiveExams({ page: 1, limit: 100 })
            .then((res) => {
                if (cancelled) return;
                const rows = res?.data?.data?.rows || [];
                const seen = new Set();
                const uniq = [];
                rows.forEach((r) => {
                    if (!seen.has(r.exam_id)) {
                        seen.add(r.exam_id);
                        uniq.push({ exam_id: r.exam_id, exam_name: r.exam_name });
                    }
                });
                setExams(uniq);
                if (uniq.length > 0) setSelectedExamId(uniq[0].exam_id);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[TodaysScriptDistribution.getLiveExams]', err);
                setExams([]);
            })
            .finally(() => {
                if (!cancelled) setExamsLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    // Fetch the chosen exam's script assignments for today AND all of its shifts
    // (so a shift without assignments today still occupies its canonical column).
    useEffect(() => {
        if (!selectedExamId) {
            setAssignments([]);
            setExamShifts([]);
            return undefined;
        }
        let cancelled = false;
        setAssignmentsLoading(true);
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        clientDashboardAPI
            .getExamShiftScripts(selectedExamId, { assignment_date: todayStr })
            .then((res) => {
                if (cancelled) return;
                setAssignments(res?.data?.data || []);
                setExamShifts(res?.data?.shifts || []);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[TodaysScriptDistribution.getExamShiftScripts]', err);
                setAssignments([]);
                setExamShifts([]);
            })
            .finally(() => {
                if (!cancelled) setAssignmentsLoading(false);
            });
        return () => { cancelled = true; };
    }, [selectedExamId]);

    // Build a (scriptKey × shiftIdx → assignment) lookup. Shift index comes from
    // examShifts (sorted by start_time ASC) so a shift always sits in its canonical
    // column even when it has zero assignments today — i.e. an exam's Shift 2 always
    // renders in the SHIFT 2 column, never collapsing into SHIFT 1.
    const cellMap = useMemo(() => {
        const sortedShifts = [...examShifts]
            .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));
        const shiftIdxById = new Map();
        sortedShifts.forEach((s, idx) => shiftIdxById.set(s.id, idx));

        const map = new Map();
        assignments.forEach((a) => {
            const scriptKey = a.script?.script_id;
            const shiftIdx = shiftIdxById.get(a.shift_id);
            if (scriptKey == null || shiftIdx == null) return;
            map.set(`${scriptKey}::${shiftIdx}`, a);
        });
        return map;
    }, [assignments, examShifts]);

    // Shared chip dimensions — empty + filled match exactly because the
    // base has a 1px transparent border that the empty variant overrides.
    const chipBaseSx = {
        borderRadius: '8px',
        border: '1px solid transparent',
        py: 1,
        px: 1,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, sans-serif',
        fontSize: '13px',
        fontWeight: 700,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
    };

    const renderCell = (assignment, row) => {
        if (!assignment) {
            return <Box sx={{ ...chipBaseSx, bgcolor: '#F8FAFC', borderColor: '#EEF0F3' }} />;
        }
        const start = assignment.custom_start_time || assignment.shift?.start_time;
        const end   = assignment.custom_end_time   || assignment.shift?.end_time;
        const label = `${fmtTime(start)} - ${fmtTime(end)}`;
        return (
            <Box sx={{ ...chipBaseSx, bgcolor: row.bg, color: row.iconColor }}>
                {label}
            </Box>
        );
    };

    const headerCellSx = {
        fontFamily: 'Inter, sans-serif',
        fontSize: '11px',
        fontWeight: 700,
        color: '#94A3B8',
        letterSpacing: '0.8px',
        textTransform: 'uppercase',
        borderBottom: '1px solid #EEF0F3',
        textAlign: 'center',
        py: 1.25,
    };
    const bodyCellSx = {
        py: 1,
        borderBottom: 'none',
    };

    return (
        <Card sx={{
            height: '100%',
            bgcolor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 4px 0 rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
        }}>
            <CardContent sx={{
                p: { xs: 2, sm: 2.5 },
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
            }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                    <Box>
                        <Typography sx={{
                            color: '#191B23',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '20px',
                            fontWeight: 700,
                            lineHeight: '24px',
                        }}>
                            Today&rsquo;s Script Distribution
                        </Typography>
                        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.75 }}>
                            <Box component="svg" width={12} height={12} viewBox="0 0 16 16" sx={{ flexShrink: 0, display: 'block' }}>
                                <path
                                    d="M8 5V8M8 11H8.0075M15.5 8C15.5 12.1421 12.1421 15.5 8 15.5C3.85786 15.5 0.5 12.1421 0.5 8C0.5 3.85786 3.85786 0.5 8 0.5C12.1421 0.5 15.5 3.85786 15.5 8Z"
                                    stroke="#94A3B8"
                                    strokeWidth="1"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    fill="none"
                                />
                            </Box>
                            <Typography sx={{
                                color: '#94A3B8',
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '12px',
                                fontWeight: 400,
                                lineHeight: '16px',
                            }}>
                                Independent of above selected filters
                            </Typography>
                        </Stack>
                    </Box>
                    <FormControl size="small" sx={{ minWidth: 160 }} disabled={examsLoading || exams.length === 0}>
                        <Select
                            value={selectedExamId || ''}
                            onChange={(e) => setSelectedExamId(e.target.value)}
                            displayEmpty
                            renderValue={(v) => {
                                if (examsLoading) return 'Loading…';
                                if (!v) return 'No exams today';
                                const found = exams.find((ex) => ex.exam_id === v);
                                return found ? found.exam_name : v;
                            }}
                            sx={{
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '13px',
                                fontWeight: 500,
                                color: '#191B23',
                                borderRadius: '8px',
                                '& .MuiSelect-select': { py: 0.75 },
                            }}
                        >
                            {exams.map((ex) => (
                                <MenuItem key={ex.exam_id} value={ex.exam_id}>
                                    {ex.exam_name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>

                <Box sx={{
                    flex: 1,
                    minHeight: 0,
                    overflowX: 'auto',
                    overflowY: 'auto',
                    position: 'relative',
                    // Subtle scrollbar so it doesn't dominate the card visually
                    '&::-webkit-scrollbar': { width: 6 },
                    '&::-webkit-scrollbar-thumb': { bgcolor: '#E5E7EB', borderRadius: 3 },
                    '&::-webkit-scrollbar-thumb:hover': { bgcolor: '#CBD5E1' },
                }}>
                    {assignmentsLoading && (
                        <Box sx={{
                            position: 'absolute',
                            inset: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'rgba(255,255,255,0.7)',
                            zIndex: 1,
                        }}>
                            <CircularProgress size={28} />
                        </Box>
                    )}
                    <Table sx={{ tableLayout: 'fixed', minWidth: 460 }}>
                        <colgroup>
                            <col style={{ width: '32%' }} />
                            <col style={{ width: '22.66%' }} />
                            <col style={{ width: '22.66%' }} />
                            <col style={{ width: '22.66%' }} />
                        </colgroup>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ ...headerCellSx, textAlign: 'left' }} />
                                <TableCell sx={headerCellSx}>SHIFT 1</TableCell>
                                <TableCell sx={headerCellSx}>SHIFT 2</TableCell>
                                <TableCell sx={headerCellSx}>SHIFT 3</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {SCRIPT_DEFS.map((row) => {
                                const Icon = row.icon;
                                return (
                                    <TableRow key={row.key}>
                                        <TableCell sx={bodyCellSx}>
                                            <Stack direction="row" alignItems="center" spacing={1.25}>
                                                <Icon sx={{ fontSize: 20, color: row.iconColor, flexShrink: 0 }} />
                                                <Typography sx={{
                                                    color: '#191B23',
                                                    fontFamily: 'Inter, sans-serif',
                                                    fontSize: '14px',
                                                    fontWeight: 500,
                                                    lineHeight: '18px',
                                                }}>
                                                    {row.label}
                                                </Typography>
                                            </Stack>
                                        </TableCell>
                                        {[0, 1, 2].map((shiftIdx) => {
                                            const assignment = cellMap.get(`${row.key}::${shiftIdx}`);
                                            return (
                                                <TableCell key={shiftIdx} sx={{ ...bodyCellSx, px: 0.5 }}>
                                                    {renderCell(assignment, row)}
                                                </TableCell>
                                            );
                                        })}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </Box>
            </CardContent>
        </Card>
    );
};

// ---------------------------------------------------------------------------
// ClientDetectionDashboard — client (company-scoped) mirror of the admin Dashboard.
// Layout matches admin exactly except the GPU card slot is replaced with the
// TodaysScriptDistributionCard placeholder. Backend enforces exam_body scoping.
// ---------------------------------------------------------------------------

const ClientDetectionDashboard = () => {
    const [overview, setOverview] = useState(null);
    const [overviewLoading, setOverviewLoading] = useState(true);
    const [showGpuWarning, setShowGpuWarning] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [dateChip, setDateChip] = useState('today');
    const [filterMenuOpen, setFilterMenuOpen] = useState(false);
    const [customRange, setCustomRange] = useState(null);
    const [selectedExam, setSelectedExam] = useState('all');
    const [selectedShifts, setSelectedShifts] = useState([]);
    const [examsList, setExamsList] = useState([]);
    const searchInputRef = useRef(null);

    // Fetch the company-scoped exam list once on mount.
    useEffect(() => {
        let cancelled = false;
        examsAPI.getAll({ is_active: 'true' })
            .then((res) => {
                if (cancelled) return;
                const list = res?.data?.data || res?.data || [];
                setExamsList(Array.isArray(list) ? list : []);
            })
            .catch((err) => {
                if (!cancelled) console.error('[ClientDashboard.examsAPI.getAll]', err);
            });
        return () => { cancelled = true; };
    }, []);

    const examNameById = (id) => examsList.find((e) => e.id === id)?.exam_name;

    const { apiParams, activeFilters } = useMemo(() => {
        const today = new Date();
        const fmt = (d) => format(d, 'yyyy-MM-dd');
        const labelChip = (label) => ({ key: 'date', label });
        const extraChips = (chips) => [
            ...chips,
            ...(selectedExam !== 'all'
                ? [{ key: 'exam', label: examNameById(selectedExam) || `Exam #${selectedExam}` }]
                : []),
            ...selectedShifts.map((n) => ({ key: `shift_${n}`, label: `Shift ${n}` })),
        ];
        const extraParams = {};
        if (selectedExam !== 'all') extraParams.exam_id = selectedExam;
        if (selectedShifts.length)  extraParams.shift_indexes = selectedShifts.join(',');

        switch (dateChip) {
            case 'yesterday': {
                const y = subDays(today, 1);
                return {
                    apiParams: { date: fmt(y), ...extraParams },
                    activeFilters: extraChips([{ key: 'date', label: 'Yesterday' }]),
                };
            }
            case 'last_week': {
                const start = subDays(today, 6);
                return {
                    apiParams: { start_date: fmt(start), end_date: fmt(today), ...extraParams },
                    activeFilters: extraChips([labelChip('Last week')]),
                };
            }
            case 'last_month': {
                const start = subDays(today, 29);
                return {
                    apiParams: { start_date: fmt(start), end_date: fmt(today), ...extraParams },
                    activeFilters: extraChips([labelChip('Last month')]),
                };
            }
            case 'custom': {
                const start = customRange?.from ?? today;
                const end   = customRange?.to   ?? today;
                return {
                    apiParams: { start_date: fmt(start), end_date: fmt(end), ...extraParams },
                    activeFilters: extraChips([
                        { key: 'date', label: `${fmt(start)} → ${fmt(end)}` },
                    ]),
                };
            }
            case 'today':
            default:
                return {
                    apiParams: { date: fmt(today), ...extraParams },
                    activeFilters: extraChips([]),
                };
        }
    }, [dateChip, customRange, selectedShifts, selectedExam, examsList]);

    const removeFilter = (key) => {
        if (key === 'date') {
            setDateChip('today');
            setCustomRange(null);
        } else if (key === 'exam') {
            setSelectedExam('all');
        } else if (key.startsWith('shift_')) {
            const n = Number(key.split('_')[1]);
            setSelectedShifts((prev) => prev.filter((x) => x !== n));
        }
    };
    const clearAllFilters = () => {
        setDateChip('today');
        setCustomRange(null);
        setSelectedShifts([]);
        setSelectedExam('all');
    };

    // Search autocomplete suggestions.
    const suggestions = useMemo(() => {
        const q = searchKeyword.trim().toLowerCase();
        if (!q) return [];
        const items = [
            { category: 'date', label: 'Today',      apply: () => { setDateChip('today');      setCustomRange(null); } },
            { category: 'date', label: 'Yesterday',  apply: () => { setDateChip('yesterday');  setCustomRange(null); } },
            { category: 'date', label: 'Last week',  apply: () => { setDateChip('last_week');  setCustomRange(null); } },
            { category: 'date', label: 'Last month', apply: () => { setDateChip('last_month'); setCustomRange(null); } },
            { category: 'shift', label: 'Shift 1', apply: () => setSelectedShifts((p) => p.includes(1) ? p : [...p, 1].sort()) },
            { category: 'shift', label: 'Shift 2', apply: () => setSelectedShifts((p) => p.includes(2) ? p : [...p, 2].sort()) },
            { category: 'shift', label: 'Shift 3', apply: () => setSelectedShifts((p) => p.includes(3) ? p : [...p, 3].sort()) },
            { category: 'exam',  label: 'All Exams', apply: () => setSelectedExam('all') },
            ...examsList.map((ex) => ({
                category: 'exam',
                label: ex.exam_name,
                apply: () => setSelectedExam(ex.id),
            })),
        ];
        return items.filter((it) => it.label.toLowerCase().includes(q));
    }, [searchKeyword, examsList]);

    useEffect(() => {
        let cancelled = false;
        setOverviewLoading(true);
        clientDashboardAPI
            .getOverview(apiParams)
            .then((res) => {
                if (!cancelled) setOverview(res?.data?.data || null);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[ClientDetectionDashboard.getOverview]', err);
                setOverview(null);
            })
            .finally(() => {
                if (!cancelled) setOverviewLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [apiParams]);

    const totalExams   = overview?.total_exams   || { total: 0, ongoing: 0, completed: 0, scheduled: 0 };
    const cameras      = overview?.cameras       || { total: 0, accessible: 0, inaccessible: 0 };
    const scripts      = overview?.scripts       || { planned_today: 0, running: 0, scheduled: 0, completed: 0 };
    const detections   = overview?.detections    || { today: 0, pushed_to_client: 0, false_detection: 0 };
    const distribution = overview?.detection_distribution || [];

    const dateChips = [
        { key: 'today',      label: 'Today' },
        { key: 'yesterday',  label: 'Yesterday' },
        { key: 'last_week',  label: 'Last week' },
        { key: 'last_month', label: 'Last month' },
    ];

    const dialogInitialDates = useMemo(() => {
        const today = new Date();
        if (dateChip === 'custom' && customRange) {
            return { from: customRange.from, to: customRange.to };
        }
        switch (dateChip) {
            case 'yesterday':  { const y = subDays(today, 1); return { from: y, to: y }; }
            case 'last_week':  return { from: subDays(today, 6),  to: today };
            case 'last_month': return { from: subDays(today, 29), to: today };
            default:           return { from: today, to: today };
        }
    }, [dateChip, customRange]);

    const handleApplyAdvanced = ({ from, to, exam, shifts }) => {
        setSelectedExam(exam);
        setSelectedShifts(shifts || []);
        const today = new Date();
        const sameDay = (a, b) => format(a, 'yyyy-MM-dd') === format(b, 'yyyy-MM-dd');
        if (sameDay(from, today) && sameDay(to, today)) {
            setDateChip('today');
            setCustomRange(null);
        } else {
            setDateChip('custom');
            setCustomRange({ from, to });
        }
        setFilterMenuOpen(false);
    };

    return (
        <Box>
            {/* Overview header — Row 1: title + warning chip */}
            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', sm: 'flex-start' }}
                spacing={2}
                sx={{ mb: 2 }}
            >
                <Box>
                    <Typography sx={{
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 700,
                        fontSize: '26px',
                        lineHeight: '32px',
                        color: '#191B23',
                        letterSpacing: '0.2px',
                    }}>
                        Overview
                    </Typography>
                    <Typography sx={{
                        mt: 0.25,
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 400,
                        fontSize: '14px',
                        lineHeight: '20px',
                        color: '#303336',
                    }}>
                        Monitor Live Exams, Camera Activity, Detections
                    </Typography>
                </Box>
                {showGpuWarning && (
                    <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{
                            bgcolor: '#FFDAD6',
                            color: '#93000A',
                            border: '1px solid rgba(186, 26, 26, 0.20)',
                            borderRadius: 999,
                            pl: 1.25,
                            pr: 0.5,
                            py: 0.5,
                            flexShrink: 0,
                        }}
                    >
                        <ErrorOutlineRoundedIcon sx={{ fontSize: 18, color: '#93000A' }} />
                        <Typography sx={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '13px',
                            fontWeight: 500,
                            lineHeight: '16px',
                            whiteSpace: 'nowrap',
                        }}>
                            GPU utilization above 85%
                        </Typography>
                        <Box
                            component="button"
                            type="button"
                            onClick={() => setShowGpuWarning(false)}
                            sx={{
                                border: 'none',
                                bgcolor: 'transparent',
                                p: 0.25,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#93000A',
                                '&:hover': { opacity: 0.7 },
                            }}
                            aria-label="Dismiss GPU utilization warning"
                        >
                            <CloseRoundedIcon sx={{ fontSize: 16 }} />
                        </Box>
                    </Stack>
                )}
            </Stack>

            {/* Overview header — Row 2: search input + filter button */}
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                <Box
                    ref={searchInputRef}
                    sx={{
                        flex: 1,
                        bgcolor: '#fff',
                        border: '1px solid #E5E7EB',
                        borderRadius: '10px',
                        px: 2,
                        py: 1.25,
                        display: 'flex',
                        alignItems: 'center',
                    }}
                >
                    <InputBase
                        fullWidth
                        placeholder={'Try "today", "shift 1", or an exam name…'}
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        sx={{
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#191B23',
                            '& input::placeholder': { color: '#94A3B8', opacity: 1 },
                        }}
                    />
                </Box>
                <Popper
                    open={searchKeyword.trim().length > 0}
                    anchorEl={searchInputRef.current}
                    placement="bottom-start"
                    modifiers={[{ name: 'offset', options: { offset: [0, 6] } }]}
                    style={{ zIndex: 1400, width: searchInputRef.current?.clientWidth }}
                >
                    <ClickAwayListener onClickAway={() => setSearchKeyword('')}>
                        <Paper sx={{
                            borderRadius: '10px',
                            border: '1px solid #E5E7EB',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                            maxHeight: 320,
                            overflowY: 'auto',
                        }}>
                            {suggestions.length === 0 ? (
                                <Box sx={{
                                    px: 2,
                                    py: 1.5,
                                    color: '#94A3B8',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '13px',
                                    fontStyle: 'italic',
                                }}>
                                    Nothing like &ldquo;{searchKeyword.trim()}&rdquo; matches a filter
                                </Box>
                            ) : (
                                <List dense disablePadding>
                                    {suggestions.map((s, idx) => (
                                        <ListItemButton
                                            key={`${s.category}::${s.label}::${idx}`}
                                            onClick={() => { s.apply(); setSearchKeyword(''); }}
                                            sx={{
                                                py: 1,
                                                px: 2,
                                                fontFamily: 'Inter, sans-serif',
                                                fontSize: '13px',
                                                color: '#191B23',
                                                '&:hover': { bgcolor: '#F5F6FA' },
                                            }}
                                        >
                                            <Box component="span" sx={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                minWidth: 22,
                                                mr: 1,
                                                fontSize: 14,
                                            }}>
                                                {s.category === 'date' ? '📅' : s.category === 'shift' ? '🕒' : '📚'}
                                            </Box>
                                            {s.label}
                                        </ListItemButton>
                                    ))}
                                </List>
                            )}
                        </Paper>
                    </ClickAwayListener>
                </Popper>
                <Box
                    component="button"
                    type="button"
                    onClick={() => setFilterMenuOpen(true)}
                    sx={{
                        position: 'relative',
                        width: 48,
                        height: 48,
                        bgcolor: '#4B53C9',
                        border: 'none',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                        '&:hover': { bgcolor: '#3F47B0' },
                    }}
                    aria-label="Open filters"
                >
                    <TuneRoundedIcon sx={{ fontSize: 22, color: '#fff' }} />
                    {activeFilters.length > 0 && (
                        <Box sx={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            minWidth: 18,
                            height: 18,
                            px: 0.5,
                            bgcolor: '#fff',
                            border: '1.5px solid #4B53C9',
                            borderRadius: 999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#4B53C9',
                            lineHeight: 1,
                        }}>
                            {activeFilters.length}
                        </Box>
                    )}
                </Box>
            </Stack>

            {/* Overview header — Row 3: quick date chips */}
            <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                sx={{ mb: activeFilters.length ? 1 : 2.5 }}
            >
                {dateChips.map((c) => {
                    const active = c.key === dateChip;
                    return (
                        <Box
                            key={c.key}
                            component="button"
                            type="button"
                            onClick={() => setDateChip(c.key)}
                            sx={{
                                bgcolor: active ? '#4B53C9' : '#fff',
                                color: active ? '#fff' : '#191B23',
                                border: active ? 'none' : '1px solid #E5E7EB',
                                borderRadius: 999,
                                px: 1.75,
                                py: 0.5,
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '14px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                '&:hover': active ? { bgcolor: '#3F47B0' } : { borderColor: '#CBD5E1' },
                            }}
                        >
                            {c.label}
                        </Box>
                    );
                })}
            </Stack>

            {/* Overview header — Row 4: active filter chips + Clear all */}
            {activeFilters.length > 0 && (
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ mb: 2.5 }}
                >
                    {activeFilters.map((f) => (
                        <Chip
                            key={f.key}
                            label={f.label}
                            onDelete={() => removeFilter(f.key)}
                            deleteIcon={<CloseRoundedIcon sx={{ fontSize: 14 }} />}
                            sx={{
                                bgcolor: '#E5E5FF',
                                color: '#4B53C9',
                                fontFamily: 'Inter, sans-serif',
                                fontSize: '13px',
                                fontWeight: 500,
                                borderRadius: 999,
                                height: 28,
                                '& .MuiChip-deleteIcon': {
                                    color: '#4B53C9',
                                    '&:hover': { color: '#3F47B0' },
                                },
                            }}
                        />
                    ))}
                    <Box
                        component="button"
                        type="button"
                        onClick={clearAllFilters}
                        sx={{
                            border: 'none',
                            bgcolor: 'transparent',
                            color: '#4B53C9',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '13px',
                            fontWeight: 500,
                            cursor: 'pointer',
                            px: 0.5,
                            '&:hover': { textDecoration: 'underline' },
                        }}
                    >
                        Clear all
                    </Box>
                </Stack>
            )}

            <AdvancedFiltersDialog
                open={filterMenuOpen}
                onClose={() => setFilterMenuOpen(false)}
                initialFrom={dialogInitialDates.from}
                initialTo={dialogInitialDates.to}
                initialExam={selectedExam}
                initialShifts={selectedShifts}
                onApply={handleApplyAdvanced}
            />

            {/* Row 1 — 4 KPI cards */}
            <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        title="TOTAL EXAMS"
                        value={totalExams.total}
                        icon={<ExamsSvgIcon />}
                        chips={[
                            { label: 'Ongoing',   value: totalExams.ongoing,   tone: 'amber' },
                            { label: 'Completed', value: totalExams.completed, tone: 'violet' },
                            { label: 'Scheduled', value: totalExams.scheduled, tone: 'violet' },
                        ]}
                        loading={overviewLoading}
                    />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        title="TOTAL CAMERAS"
                        value={cameras.total}
                        icon={<CameraAltIcon />}
                        chips={[
                            { label: 'Accessible',   value: cameras.accessible,   tone: 'amber' },
                            { label: 'Inaccessible', value: cameras.inaccessible, tone: 'violet' },
                        ]}
                        loading={overviewLoading}
                    />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        title="ANALYTICS"
                        value={scripts.planned_today}
                        icon={<ShiftSvgIcon />}
                        chips={[
                            { label: 'Running',   value: scripts.running,   tone: 'amber' },
                            { label: 'Pending',   value: scripts.scheduled, tone: 'violet' },
                            { label: 'Completed', value: scripts.completed, tone: 'violet' },
                        ]}
                        loading={overviewLoading}
                    />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        title="TOTAL DETECTIONS"
                        value={detections.today}
                        icon={<CustomSvgIcon />}
                        chips={[
                            { label: 'Pushed',          value: detections.pushed_to_client, tone: 'amber' },
                            { label: 'False Detection', value: detections.false_detection,  tone: 'violet' },
                        ]}
                        loading={overviewLoading}
                    />
                </Grid>
            </Grid>

            {/* Row 2 — Left column: Detection Distribution stacked on Live Exams.
                Right column: Today's Script Distribution. On md+, the right card is
                absolutely positioned so the row's height is driven by the LEFT column
                only; the script table scrolls internally if its 16 rows would overflow. */}
            <Grid container spacing={2.5} alignItems="stretch">
                <Grid item xs={12} md={6}>
                    <Stack spacing={2.5}>
                        <DetectionDistributionCard
                            distribution={distribution}
                            loading={overviewLoading}
                        />
                        <LiveExamsCard fetcher={clientDashboardAPI.getLiveExams} />
                    </Stack>
                </Grid>
                <Grid item xs={12} md={6} sx={{ position: { md: 'relative' } }}>
                    <Box sx={{
                        position: { xs: 'static', md: 'absolute' },
                        top: { md: 20 },     // matches Grid spacing={2.5} → 20px padding
                        left: { md: 20 },
                        right: { md: 0 },
                        bottom: { md: 0 },
                    }}>
                        <TodaysScriptDistributionCard />
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ClientDetectionDashboard;
