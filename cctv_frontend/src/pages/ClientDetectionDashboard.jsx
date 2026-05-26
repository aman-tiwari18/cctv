import React, { useEffect, useMemo, useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Chip,
    InputBase,
    Stack,
    Typography,
    Grid,
} from '@mui/material';
import { format, subDays } from 'date-fns';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { clientDashboardAPI } from '../services/api';
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
// TodaysScriptDistributionCard — placeholder for the per-shift schedule table.
// Real table lands in a later round; for now we reserve the slot.
// ---------------------------------------------------------------------------

const TodaysScriptDistributionCard = () => (
    <Card sx={{ height: '100%', bgcolor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px 0 rgba(0,0,0,0.05)' }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Box sx={{ mb: 1.5 }}>
                <Typography sx={{
                    color: '#191B23',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '20px',
                    fontWeight: 700,
                    lineHeight: '24px',
                }}>
                    Today&rsquo;s Script Distribution
                </Typography>
                <Typography sx={{
                    mt: 0.75,
                    color: '#303336',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '13px',
                    fontWeight: 400,
                    lineHeight: '18px',
                }}>
                    Independent of selected filters
                </Typography>
            </Box>
            <Box sx={{
                minHeight: 360,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: 2,
                textAlign: 'center',
            }}>
                <Typography sx={{
                    color: '#94A3B8',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '14px',
                    fontWeight: 500,
                }}>
                    Coming soon &mdash; per-shift script schedule will appear here.
                </Typography>
            </Box>
        </CardContent>
    </Card>
);

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
    const [selectedShift, setSelectedShift] = useState(null);

    const { apiParams, activeFilters } = useMemo(() => {
        const today = new Date();
        const fmt = (d) => format(d, 'yyyy-MM-dd');
        const rangeChip = (label, start, end) => ({
            key: 'date',
            label: `${label} (${fmt(start)} → ${fmt(end)})`,
        });
        const extraChips = (chips) => [
            ...chips,
            ...(selectedShift
                ? [{ key: 'shift', label: selectedShift[0].toUpperCase() + selectedShift.slice(1) }]
                : []),
        ];

        switch (dateChip) {
            case 'yesterday': {
                const y = subDays(today, 1);
                return {
                    apiParams: { date: fmt(y) },
                    activeFilters: extraChips([{ key: 'date', label: 'Yesterday' }]),
                };
            }
            case 'last_week': {
                const start = subDays(today, 6);
                return {
                    apiParams: { start_date: fmt(start), end_date: fmt(today) },
                    activeFilters: extraChips([rangeChip('Last week', start, today)]),
                };
            }
            case 'last_month': {
                const start = subDays(today, 29);
                return {
                    apiParams: { start_date: fmt(start), end_date: fmt(today) },
                    activeFilters: extraChips([rangeChip('Last month', start, today)]),
                };
            }
            case 'last_year': {
                const start = subDays(today, 364);
                return {
                    apiParams: { start_date: fmt(start), end_date: fmt(today) },
                    activeFilters: extraChips([rangeChip('Last year', start, today)]),
                };
            }
            case 'custom': {
                const start = customRange?.from ?? today;
                const end   = customRange?.to   ?? today;
                return {
                    apiParams: { start_date: fmt(start), end_date: fmt(end) },
                    activeFilters: extraChips([
                        { key: 'date', label: `${fmt(start)} → ${fmt(end)}` },
                    ]),
                };
            }
            case 'today':
            default:
                return {
                    apiParams: { date: fmt(today) },
                    activeFilters: extraChips([]),
                };
        }
    }, [dateChip, customRange, selectedShift]);

    const removeFilter = (key) => {
        if (key === 'date') {
            setDateChip('today');
            setCustomRange(null);
        } else if (key === 'shift') {
            setSelectedShift(null);
        } else if (key === 'exam') {
            setSelectedExam('all');
        }
    };
    const clearAllFilters = () => {
        setDateChip('today');
        setCustomRange(null);
        setSelectedShift(null);
        setSelectedExam('all');
    };

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

    const totalExams   = overview?.total_exams   || { total: 0, ongoing: 0 };
    const cameras      = overview?.cameras       || { total: 0, accessible: 0, unclassified: 0 };
    const scripts      = overview?.scripts       || { planned_today: 0, running: 0, scheduled: 0, completed: 0 };
    const detections   = overview?.detections    || { today: 0, pushed_to_client: 0, false_detection: 0 };
    const distribution = overview?.detection_distribution || [];

    const dateChips = [
        { key: 'today',      label: 'Today' },
        { key: 'yesterday',  label: 'Yesterday' },
        { key: 'last_week',  label: 'Last week' },
        { key: 'last_month', label: 'Last month' },
        { key: 'last_year',  label: 'Last year' },
    ];

    const dialogInitialDates = useMemo(() => {
        const today = new Date();
        if (dateChip === 'custom' && customRange) {
            return { from: customRange.from, to: customRange.to };
        }
        switch (dateChip) {
            case 'yesterday':  { const y = subDays(today, 1); return { from: y, to: y }; }
            case 'last_week':  return { from: subDays(today, 6),   to: today };
            case 'last_month': return { from: subDays(today, 29),  to: today };
            case 'last_year':  return { from: subDays(today, 364), to: today };
            default:           return { from: today, to: today };
        }
    }, [dateChip, customRange]);

    const handleApplyAdvanced = ({ from, to, exam, shift }) => {
        setSelectedExam(exam);
        setSelectedShift(shift);
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
                <Box sx={{
                    flex: 1,
                    bgcolor: '#fff',
                    border: '1px solid #E5E7EB',
                    borderRadius: '10px',
                    px: 2,
                    py: 1.25,
                    display: 'flex',
                    alignItems: 'center',
                }}>
                    <InputBase
                        fullWidth
                        placeholder="Search keywords..."
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
                initialShift={selectedShift}
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
                            { label: 'Ongoing', value: totalExams.ongoing, tone: 'amber' },
                            { label: 'Total',   value: totalExams.total,   tone: 'violet' },
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
                            { label: 'Unclassified', value: cameras.unclassified, tone: 'violet' },
                        ]}
                        loading={overviewLoading}
                    />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        title="SCRIPT BREAKDOWN"
                        value={scripts.planned_today}
                        icon={<ShiftSvgIcon />}
                        chips={[
                            { label: 'Running',   value: scripts.running,   tone: 'amber' },
                            { label: 'Scheduled', value: scripts.scheduled, tone: 'violet' },
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

            {/* Row 2 — Distribution + Today's Script placeholder */}
            <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                <Grid item xs={12} md={6}>
                    <DetectionDistributionCard
                        distribution={distribution}
                        loading={overviewLoading}
                    />
                </Grid>
                <Grid item xs={12} md={6}>
                    <TodaysScriptDistributionCard />
                </Grid>
            </Grid>

            {/* Row 3 — Live Exams table (client-scoped) */}
            <LiveExamsCard fetcher={clientDashboardAPI.getLiveExams} />
        </Box>
    );
};

export default ClientDetectionDashboard;
