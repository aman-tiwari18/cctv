import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    ClickAwayListener,
    Dialog,
    FormControl,
    Grid,
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
    TableContainer,
    TableHead,
    TablePagination,
    TableRow,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';
import { format, parseISO, subDays } from 'date-fns';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { dashboardAPI, examsAPI } from '../services/api';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon';
import { ShiftSvgIcon } from '../components/ShiftSvgIcon';
import { CustomSvgIcon } from '../components/DetectionSvgIcon';
import CameraAltIcon from '@mui/icons-material/CameraAlt';

// ---------------------------------------------------------------------------
// Constants — kept identical to V1 so other pages that reuse the same mapping
// stay consistent. Backend returns raw detection_type strings; frontend categorises.
// ---------------------------------------------------------------------------

const CATEGORY_COLORS = {
    people: '#A9C9FF',
    movement: '#FAB781',
    camera: '#7676BE',
};

// Per-detection-type bullet colors — mirrors ShiftScriptManager.jsx SCRIPT_META.iconColor
// so the dot a user sees here matches the glyph they see on the Schedule Analysis / Add Script screens.
const SUBCATEGORY_COLORS = {
    proximity: '#5cb88a',
    crowd: '#e24d7b',
    crowd_biometric: '#9333ea',
    crowd_five: '#e06050',
    crowd_zero: '#6b5b95',
    invigilator: '#00bfcf',
    phone: '#465a38',
    server: '#a0623d',
    intruder: '#d94466',
    qp_box: '#dc2626',
    entry_exit: '#1d7a7d',
    strongroom: '#b91c1c',
    inversion: '#7a86b4',
    tamper: '#00c8d4',
    tampering: '#00c8d4',
    blind_spot: '#b0a850',
    vision: '#3b82f6',
    proximity_detection: '#5cb88a',
    crowd_detection: '#e24d7b',
    crowd_detection_biometric: '#9333ea',
    crowd_detection_threshold: '#e06050',
    zero_person_detection: '#6b5b95',
    invigilator_detection: '#00bfcf',
    phone_detection: '#465a38',
    server_room_detection: '#a0623d',
    intruder_detection: '#d94466',
    qp_box_missing: '#dc2626',
    entry_exit_detection: '#1d7a7d',
    strongroom_detection: '#b91c1c',
    camera_inversion_detection: '#7a86b4',
    camera_tampering_detection: '#00c8d4',
    blind_spot_detection: '#b0a850',
    vision_detection: '#3b82f6',
};

const SCRIPT_CATEGORY_MAP = {
    // Script IDs (from scripts table)
    proximity: 'people',
    crowd: 'people',
    crowd_biometric: 'people',
    crowd_five: 'people',
    crowd_zero: 'people',
    invigilator: 'people',
    phone: 'people',
    server: 'people',
    intruder: 'people',
    strongroom: 'movement',
    qp_box: 'movement',
    entry_exit: 'movement',
    inversion: 'camera',
    tamper: 'camera',
    tampering: 'camera',
    blind_spot: 'camera',
    vision: 'camera',

    // Folder names (detection_type in database) — actual values from workers
    proximity_detection: 'people',
    crowd_detection: 'people',
    crowd_detection_biometric: 'people',
    crowd_detection_threshold: 'people',
    zero_person_detection: 'people',
    invigilator_detection: 'people',
    phone_detection: 'people',
    server_room_detection: 'people',
    intruder_detection: 'people',
    strongroom_detection: 'movement',
    qp_box_missing: 'movement',
    entry_exit_detection: 'movement',
    camera_inversion_detection: 'camera',
    camera_tampering_detection: 'camera',
    blind_spot_detection: 'camera',
    vision_detection: 'camera',
};

const DETECTION_TYPE_LABELS = {
    proximity: 'Close Proximity',
    crowd: 'Crowd Detection (Entry/Exit)',
    crowd_biometric: 'Crowd Detection (Biometric)',
    crowd_five: 'Crowd < 5',
    crowd_zero: 'Zero Person',
    server: 'Server Room',
    intruder: 'Intruder',
    strongroom: 'Strong Room Movement',
    qp_box: 'QP Box Detection',
    entry_exit: 'Entry/Exit',
    phone: 'Phone',
    blind_spot: 'Blind Spot',
    invigilator: 'Invigilator',
    inversion: 'Camera Inversion',
    tamper: 'Camera Tampering',
    tampering: 'Camera Tampering',
    vision: 'Vision Detection',

    // Folder names (detection_type in database) — actual values from workers
    proximity_detection: 'Close Proximity',
    crowd_detection: 'Crowd Detection (Entry/Exit)',
    crowd_detection_biometric: 'Crowd Detection (Biometric)',
    crowd_detection_threshold: 'Crowd < 5',
    zero_person_detection: 'Zero Person',
    server_room_detection: 'Server Room',
    intruder_detection: 'Intruder',
    strongroom_detection: 'Strong Room Movement',
    qp_box_missing: 'QP Box Detection',
    entry_exit_detection: 'Entry/Exit',
    phone_detection: 'Phone',
    blind_spot_detection: 'Blind Spot',
    invigilator_detection: 'Invigilator',
    camera_inversion_detection: 'Camera Inversion',
    camera_tampering_detection: 'Camera Tampering',
    vision_detection: 'Vision Detection',
};

const CATEGORY_LABELS = {
    people: 'People & Activity',
    movement: 'Movement & Alert',
    camera: 'Camera & System',
};

const CHIP_TONES = {
    amber:  { bg: '#FFEEE0', text: '#5C5F61' },
    violet: { bg: '#dbeafe', text: '#5C5F61' },
};

const KPI_ICON_BG = 'rgba(0, 74, 198, 0.10)';
const KPI_ICON_COLOR = '#004AC6';

// ---------------------------------------------------------------------------
// KpiCard — the 4 top cards
// ---------------------------------------------------------------------------

export const KpiCard = ({ title, value, icon, chips = [], loading }) => (
    <Card sx={{ height: '100%', bgcolor: '#fff', borderRadius: '8px', border: '1px solid #eef0f3' }}>
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Typography
                    variant="overline"
                    sx={{
                        color: '#5C5F61',
                        fontWeight: 700,
                        fontSize: '12px',
                        lineHeight: '16px',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                    }}
                >
                    {title}
                </Typography>
                <Box
                    sx={{
                        bgcolor: KPI_ICON_BG,
                        borderRadius: '8px',
                        // 4-step gradient: shrinks again at lg because the KPI grid
                        // goes 4-up, making each card narrower than at md (2-up).
                        width:  { xs: 32, sm: 36, md: 40, lg: 36 },
                        height: { xs: 32, sm: 36, md: 40, lg: 36 },
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {React.cloneElement(icon, { sx: { fontSize: { xs: 14, sm: 16, md: 18, lg: 16 }, color: KPI_ICON_COLOR } })}
                </Box>
            </Stack>

            <Box sx={{ mt: 1.5, mb: 2, minHeight: { xs: 36, sm: 44, md: 48, lg: 44 } }}>
                {loading ? (
                    <CircularProgress size={22} />
                ) : (
                    <Typography
                        sx={{
                            // md peaks (2-up KPI grid has the widest cards);
                            // lg drops back so the 4-up layout doesn't look bloated.
                            fontSize:   { xs: '28px', sm: '32px', md: '38px', lg: '34px' },
                            fontWeight: 700,
                            color: '#2E68C9',
                            lineHeight: { xs: '34px', sm: '38px', md: '44px', lg: '40px' },
                        }}
                    >
                        {Number(value || 0).toLocaleString()}
                    </Typography>
                )}
            </Box>

            <Stack
                direction="row"
                spacing={{ xs: 1, sm: 0.75 }}
                flexWrap={{ xs: 'wrap', sm: 'nowrap' }}
                useFlexGap
                rowGap={1}
                sx={{ width: '100%' }}
            >
                {chips.map((chip) => {
                    const tone = CHIP_TONES[chip.tone] || CHIP_TONES.amber;
                    return (
                        <Chip
                            key={chip.label}
                            label={
                                <Box sx={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    lineHeight: 1.2,
                                    minWidth: 0,
                                    width: '100%',
                                }}>
                                    <Box component="span" sx={{
                                        fontWeight: 600,
                                        // Backstop only — at any normal viewport the
                                        // chip strip + tightened lg padding gives the
                                        // full label room. This guards extreme zoom.
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {chip.label}
                                    </Box>
                                    <Box component="span" sx={{ fontWeight: 700 }}>
                                        {Number(chip.value || 0).toLocaleString()}
                                    </Box>
                                </Box>
                            }
                            sx={{
                                bgcolor: tone.bg,
                                color: tone.text,
                                borderRadius: '8px',
                                // From sm+ each chip takes an equal share of the row
                                // so 3-chip cards (TOTAL EXAMS, ANALYTICS) keep all
                                // three on one line at every grid regime.
                                flex: { xs: '0 0 auto', sm: 1 },
                                minWidth: 0,
                                maxWidth: '100%',
                                height: { xs: 44, sm: 48, md: 51, lg: 48 },
                                py: 0,
                                px: { xs: 0.3, sm: 0.25, md: 0.4, lg: 0.25 },
                                boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
                                fontFamily: 'Manrope, Inter, sans-serif',
                                '& .MuiChip-label': {
                                    px: { xs: 1, sm: 0.75, md: 1, lg: 0.75 },
                                    width: '100%',
                                    fontSize:   { xs: '11px', sm: '11.5px', md: '12px', lg: '11px' },
                                    fontWeight: 600,
                                    lineHeight: { xs: '15px', sm: '16px', md: '17px', lg: '15px' },
                                    // Drop letter-spacing entirely on lg — 1px × 9 chars
                                    // was 9px of waste per chip, which was tipping
                                    // `Scheduled` past the row edge on a 4-up grid.
                                    letterSpacing: { xs: '0.3px', md: '0.5px', lg: 0 },
                                    textTransform: 'capitalize',
                                },
                            }}
                        />
                    );
                })}
            </Stack>
        </CardContent>
    </Card>
);

// ---------------------------------------------------------------------------
// DetectionDistributionCard — donut + category list
// ---------------------------------------------------------------------------

// Hovered segment renders as a slightly larger sector with a glow matching its own color
const renderActiveShape = (props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
        <g style={{ filter: `drop-shadow(0 0 6px ${fill})` }}>
            <Sector
                cx={cx}
                cy={cy}
                innerRadius={innerRadius}
                outerRadius={outerRadius + 6}
                startAngle={startAngle}
                endAngle={endAngle}
                fill={fill}
            />
        </g>
    );
};

// Tooltip drawn as ONE continuous SVG path (rounded rect + downward triangle merged),
// so the stroke wraps the whole shape — no visible seam between the box and the arrow.
const DetectionDonutTooltip = ({ label, percent }) => {
    const text = `${label}: ${percent}%`;
    const fontSize = 13;
    const charW = 7.2; // approx for Inter 700 13px
    const padH = 12;
    const padV = 6;
    const radius = 8;
    const triBaseW = 12;
    const triH = 7;
    const W = Math.max(80, text.length * charW + 2 * padH);
    const H = fontSize + 2 * padV + 4; // include some leading
    const cx = W / 2;

    const d = [
        `M ${radius} 0`,
        `L ${W - radius} 0`,
        `A ${radius} ${radius} 0 0 1 ${W} ${radius}`,
        `L ${W} ${H - radius}`,
        `A ${radius} ${radius} 0 0 1 ${W - radius} ${H}`,
        `L ${cx + triBaseW / 2} ${H}`,
        `L ${cx} ${H + triH}`,
        `L ${cx - triBaseW / 2} ${H}`,
        `L ${radius} ${H}`,
        `A ${radius} ${radius} 0 0 1 0 ${H - radius}`,
        `L 0 ${radius}`,
        `A ${radius} ${radius} 0 0 1 ${radius} 0`,
        'Z',
    ].join(' ');

    return (
        <Box component="svg"
            width={W + 2}
            height={H + triH + 2}
            viewBox={`-1 -1 ${W + 2} ${H + triH + 2}`}
            style={{
                display: 'block',
                overflow: 'visible',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))',
                pointerEvents: 'none',
            }}
        >
            <path d={d} fill="#FFF" stroke="#CED2E0" strokeWidth="1" strokeLinejoin="round" />
            <text
                x={W / 2}
                y={H / 2}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                    fontFamily: 'Inter, sans-serif',
                    fontSize: `${fontSize}px`,
                    fontWeight: 700,
                    fill: '#191B23',
                }}
            >
                {text}
            </text>
        </Box>
    );
};

export const DetectionDistributionCard = ({ distribution = [], loading }) => {
    const [category, setCategory] = useState('all');
    const [activeKey, setActiveKey] = useState(null);
    const [mousePos, setMousePos] = useState(null);

    // Donut radii follow the actual measured chart container so the half-circle
    // grows on wide screens and shrinks (without clipping) on narrow ones,
    // instead of being locked to fixed pixel sizes per breakpoint.
    // cy = 65%, so the arc's height budget is 62% of container H (3% margin).
    // Horizontally it can occupy almost the full width — outerR ≤ W/2 - 8px.
    const [chartSize, setChartSize] = useState({ w: 0, h: 0 });
    const outerR = (chartSize.w > 0 && chartSize.h > 0)
        ? Math.max(40, Math.min(chartSize.w / 2 - 8, chartSize.h * 0.62))
        : 100;
    const innerR = outerR * (106 / 126);
    // Center value font tracks innerR so the number stays in proportion to the
    // donut hole at every viewport — not just at the sm boundary.
    const centerFontPx = Math.round(Math.max(24, Math.min(56, innerR * 0.42)));
    const centerLineHt = Math.round(centerFontPx * 1.1);
    const BOX_HEIGHT_SX = { xs: 220, sm: 260, md: 280, lg: 320 };

    // Build tree: 3 parent categories, each with its sub-detections
    const tree = useMemo(() => {
        const list = Array.isArray(distribution) ? distribution : [];
        const parents = ['people', 'movement', 'camera'].map((cat) => {
            const subs = list
                .filter((d) => (SCRIPT_CATEGORY_MAP[d.type] || 'camera') === cat)
                .map((d) => ({
                    key: d.type,
                    label: DETECTION_TYPE_LABELS[d.type] || d.type,
                    count: Number(d.count || 0),
                    color: SUBCATEGORY_COLORS[d.type] || CATEGORY_COLORS[cat],
                }));

            const count = subs.reduce((a, s) => a + s.count, 0);
            return {
                key: cat,
                label: CATEGORY_LABELS[cat],
                count,
                color: CATEGORY_COLORS[cat],
                subs,
            };
        });
        const grandTotal = parents.reduce((a, p) => a + p.count, 0);
        return { parents, grandTotal };
    }, [distribution]);

    // Donut data + center label depend on selected category
    const { donutData, centerValue, centerLabel } = useMemo(() => {
        if (category === 'all') {
            const data = tree.parents
                .map((p) => ({ key: p.key, label: p.label, count: p.count, color: p.color }));
            return { donutData: data, centerValue: tree.grandTotal, centerLabel: 'TOTAL DETECTIONS' };
        }
        const parent = tree.parents.find((p) => p.key === category);
        return {
            donutData: (parent?.subs || []).map((s) => ({
                key: s.key, label: s.label, count: s.count, color: s.color,
            })),
            centerValue: parent?.count || 0,
            centerLabel: (parent?.label || '').toUpperCase(),
        };
    }, [tree, category]);

    const donutTotal = donutData.reduce((a, d) => a + d.count, 0);
    const activeIdx = donutData.findIndex((d) => d.key === activeKey);

    return (
        <Card sx={{ height: '100%', bgcolor: '#fff', borderRadius: '8px', boxShadow: '0 2px 4px 0 rgba(0,0,0,0.05)' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography sx={{ color: '#191B23', fontFamily: 'Inter, sans-serif', fontSize: { xs: '17px', sm: '20px' }, fontWeight: 700, lineHeight: '24px' }}>
                        Detection Distribution
                    </Typography>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />}
                            sx={{
                                textTransform: 'none',
                                fontFamily: 'Inter, sans-serif',
                                fontWeight: 500,
                                fontSize: '13px',
                                color: '#191B23',
                                borderColor: '#E5E7EB',
                                borderRadius: '8px',
                                px: 1.5,
                                py: 0.5,
                                '&:hover': {
                                    borderColor: '#CBD5E1',
                                    bgcolor: '#F8FAFC',
                                },
                            }}
                        >
                            Export
                        </Button>
                        <FormControl size="small" sx={{ minWidth: { xs: 130, sm: 150 } }}>
                            <Select
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                sx={{
                                    fontSize: { xs: '12px', sm: '13px' },
                                    borderRadius: '8px',
                                    '& .MuiSelect-select': { fontSize: { xs: '12px', sm: '13px' }, py: 0.75 },
                                }}
                                MenuProps={{
                                    PaperProps: {
                                        sx: {
                                            '& .MuiMenuItem-root': {
                                                fontSize: { xs: '12px', sm: '13px' },
                                                minHeight: 32,
                                                py: 0.75,
                                            },
                                        },
                                    },
                                }}
                            >
                                <MenuItem value="all">All Categories</MenuItem>
                                <MenuItem value="people">People &amp; Activity</MenuItem>
                                <MenuItem value="movement">Movement &amp; Alert</MenuItem>
                                <MenuItem value="camera">Camera &amp; System</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </Stack>

                {loading ? (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={220}>
                        <CircularProgress />
                    </Box>
                ) : tree.grandTotal === 0 ? (
                    <Box display="flex" justifyContent="center" alignItems="center" minHeight={220}>
                        <Typography color="text.secondary">No detections in this view.</Typography>
                    </Box>
                ) : (
                    <Grid container spacing={2} alignItems="flex-start">
                        <Grid item xs={12} lg={6}>
                            <Box
                                sx={{
                                    position: 'relative',
                                    height: BOX_HEIGHT_SX,
                                    overflow: 'visible',
                                    '& svg': { overflow: 'visible' },
                                }}
                                onMouseMove={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                                }}
                                onMouseLeave={() => { setMousePos(null); setActiveKey(null); }}
                            >
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                    onResize={(w, h) => setChartSize({ w, h })}
                                >
                                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                        <Pie
                                            data={donutData}
                                            cx="50%"
                                            cy="65%"
                                            startAngle={180}
                                            endAngle={0}
                                            innerRadius={innerR}
                                            outerRadius={outerR}
                                            paddingAngle={0}
                                            cornerRadius={0}
                                            dataKey="count"
                                            nameKey="label"
                                            stroke="none"
                                            activeIndex={activeIdx >= 0 ? activeIdx : -1}
                                            activeShape={renderActiveShape}
                                            onMouseEnter={(_, idx) => setActiveKey(donutData[idx]?.key || null)}
                                            onMouseLeave={() => setActiveKey(null)}
                                        >
                                            {donutData.map((s) => (
                                                <Cell key={s.key} fill={s.color} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>

                                {/* Custom tooltip overlay — follows cursor, anchored above */}
                                {activeKey && activeIdx >= 0 && mousePos && (() => {
                                    const donutTotal = donutData.reduce((a, d) => a + d.count, 0);
                                    const pct = donutTotal > 0 ? ((donutData[activeIdx].count / donutTotal) * 100).toFixed(0) : '0';
                                    return (
                                        <Box sx={{
                                            position: 'absolute',
                                            left: `${mousePos.x}px`,
                                            top: `${mousePos.y - 14}px`,
                                            transform: 'translate(-50%, -100%)',
                                            pointerEvents: 'none',
                                            zIndex: 10,
                                        }}>
                                            <DetectionDonutTooltip label={donutData[activeIdx].label} percent={pct} />
                                        </Box>
                                    );
                                })()}

                                <Box
                                    sx={{
                                        position: 'absolute',
                                        // cy is at 65% of height; sit the label group ON that line
                                        // so it stays centered in the donut hole at any box height.
                                        bottom: '35%',
                                        left: 0,
                                        right: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        pointerEvents: 'none',
                                    }}
                                >
                                    <Typography sx={{
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: `${centerFontPx}px`,
                                        fontWeight: 700,
                                        color: '#2E68C9',
                                        lineHeight: `${centerLineHt}px`,
                                    }}>
                                        {centerValue.toLocaleString()}
                                    </Typography>
                                    <Typography
                                        sx={{ color: '#2E68C9', fontFamily: 'Inter, sans-serif', fontSize: '12px', fontWeight: 600, lineHeight: '16px', letterSpacing: '0.6px', textTransform: 'uppercase' }}
                                    >
                                        {centerLabel}
                                    </Typography>
                                </Box>
                            </Box>
                        </Grid>

                        <Grid item xs={12} lg={6}>
                            <Box sx={{ maxHeight: BOX_HEIGHT_SX, overflowY: 'auto', pr: 0.5, pt: 1 }}>
                                <Stack spacing={1.5}>
                                    {donutData.map((slice) => {
                                        const pct = donutTotal > 0 ? (slice.count / donutTotal) * 100 : 0;
                                        const isActive = activeKey === slice.key;
                                        const isParentRow = category === 'all';
                                        return (
                                            <Stack
                                                key={slice.key}
                                                direction="row"
                                                alignItems="center"
                                                spacing={1}
                                                onMouseEnter={() => setActiveKey(slice.key)}
                                                onMouseLeave={() => setActiveKey(null)}
                                                onClick={isParentRow ? () => setCategory(slice.key) : undefined}
                                                sx={{
                                                    cursor: isParentRow ? 'pointer' : 'default',
                                                    userSelect: 'none',
                                                    width: '100%',
                                                }}
                                            >
                                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: slice.color, flexShrink: 0 }} />
                                                <Typography sx={{
                                                    color: '#191B23',
                                                    fontFamily: 'Inter, sans-serif',
                                                    fontSize: { xs: '13px', lg: '14px' },
                                                    fontWeight: isActive ? 700 : 500,
                                                    lineHeight: 1.35,
                                                    flex: 1,
                                                    minWidth: 0,
                                                    // Single-line; ellipsis only kicks in at extreme
                                                    // zoom/embedded widths — the Grid 6/6 md+ split
                                                    // and 13px font ensure normal viewports fit.
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}>
                                                    {slice.label}
                                                </Typography>
                                                <Typography sx={{
                                                    color: '#64748B',
                                                    fontFamily: 'Inter, sans-serif',
                                                    fontSize: { xs: '13px', lg: '14px' },
                                                    fontWeight: 500,
                                                    lineHeight: 1.35,
                                                    flexShrink: 0,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {`${slice.count.toLocaleString()} (${pct.toFixed(0)}%)`}
                                                </Typography>
                                            </Stack>
                                        );
                                    })}
                                </Stack>
                            </Box>
                        </Grid>
                    </Grid>
                )}
            </CardContent>
        </Card>
    );
};

// ---------------------------------------------------------------------------
// GpuPerformanceCard — static / dummy data; no API
// ---------------------------------------------------------------------------

// Four fixed quarter-bands (25% each), light → dark going clockwise.
// Only the bands the value reaches are emitted; the leftover arc renders as
// the gray track. e.g. value=88.2 → bands 1+2+3 full, band 4 = 13.2, track = 11.8.
const BAND_COLORS = ['#B8CFF4', '#94B6EF', '#578ADE', '#3368C1'];
const BAND_SIZE = 25;
const buildGaugeSegments = (value) => {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    const segments = [];
    let remaining = v;
    BAND_COLORS.forEach((color, idx) => {
        if (remaining <= 0) return;
        const fill = Math.min(remaining, BAND_SIZE);
        segments.push({ name: `b${idx + 1}`, value: fill, color });
        remaining -= fill;
    });
    const free = 100 - v;
    if (free > 0) segments.push({ name: 'free', value: free, color: '#E3E3E3' });
    return segments;
};

const GpuPerformanceCard = () => {
    const utilization = 88.2;
    const gaugeData = buildGaugeSegments(utilization);
    // Optimal Efficiency mini gauge — visual only, ~82% filled.
    const miniData = buildGaugeSegments(82);

    // Gauges measure their own containers via ResponsiveContainer.onResize and
    // derive radii from the live width/height. With cy=100%, the arc occupies
    // ~outerR pixels of height and 2*outerR of width, so the cap is the smaller
    // of (W/2 - 4px margin) and (H - 6px margin). This keeps the half-circle
    // flush to the card edges on wide screens AND uncllipped on narrow ones.
    const [gaugeSize, setGaugeSize] = useState({ w: 0, h: 0 });
    const [miniSize,  setMiniSize]  = useState({ w: 0, h: 0 });

    const gaugeOuter = (gaugeSize.w > 0 && gaugeSize.h > 0)
        ? Math.max(60, Math.min(gaugeSize.w / 2 - 4, gaugeSize.h - 6))
        : 130;
    const gaugeInner = gaugeOuter * (128 / 150);

    const miniOuter = (miniSize.w > 0 && miniSize.h > 0)
        ? Math.max(40, Math.min(miniSize.w / 2 - 4, miniSize.h - 6))
        : 80;
    const miniInner = miniOuter * (72 / 92);

    // Text inside the gauges tracks the same source that drives the radii,
    // so the labels stay in proportion to the half-circles continuously.
    const gaugeValuePx = Math.round(Math.max(20, Math.min(40, gaugeOuter * 0.22)));
    const miniLabelPx  = Math.round(Math.max(11, Math.min(15, miniOuter  * 0.15)));
    const miniStarPx   = Math.round(Math.max(14, Math.min(22, miniOuter  * 0.22)));

    const gaugeHeight = { xs: 150, sm: 170, md: 190, lg: 210 };
    const miniHeight  = { xs: 90,  sm: 100, md: 110, lg: 120 };

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Box sx={{ mb: 1.5 }}>
                    <Typography sx={{
                        color: '#191B23',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: { xs: '17px', sm: '20px' },
                        fontWeight: 700,
                        lineHeight: '24px',
                    }}>
                        Overall GPU Performance
                    </Typography>
                    <Typography sx={{
                        mt: 0.75,
                        color: '#303336',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: { xs: '12px', sm: '13px' },
                        fontWeight: 400,
                        lineHeight: '18px',
                    }}>
                        Real-Time GPU Allocation Efficiency Across Active Nodes
                    </Typography>
                </Box>

                <Grid container spacing={2} alignItems="stretch">
                    <Grid item xs={12} lg={7} sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ position: 'relative', height: gaugeHeight }}>
                            <ResponsiveContainer
                                width="100%"
                                height="100%"
                                onResize={(w, h) => setGaugeSize({ w, h })}
                            >
                                <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                    <Pie
                                        data={gaugeData}
                                        cx="50%"
                                        cy="100%"
                                        innerRadius={gaugeInner}
                                        outerRadius={gaugeOuter}
                                        startAngle={180}
                                        endAngle={0}
                                        paddingAngle={0}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {gaugeData.map((d) => (
                                            <Cell key={d.name} fill={d.color} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            </ResponsiveContainer>
                            <Box
                                sx={{
                                    position: 'absolute',
                                    left: 0,
                                    right: 0,
                                    bottom: '6px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    pointerEvents: 'none',
                                }}
                            >
                                <Typography sx={{
                                    color: '#2E68C9',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: `${gaugeValuePx}px`,
                                    fontWeight: 700,
                                    lineHeight: 1.15,
                                }}>
                                    {utilization}%
                                </Typography>
                                <Typography sx={{
                                    mt: 0.25,
                                    color: '#5C5F61',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    lineHeight: '16px',
                                    letterSpacing: '0.6px',
                                    textTransform: 'uppercase',
                                }}>
                                    Utilization
                                </Typography>
                            </Box>
                        </Box>

                        {/* Spacer pushes the Camera Capacity pill flush with the bottom
                            of the left column so it aligns with the Memory Load Paper on the right. */}
                        <Box sx={{ flexGrow: 1 }} />
                        <Box
                            sx={{
                                mt: 1.5,
                                mx: 'auto',
                                width: '100%',
                                maxWidth: { xs: '100%', sm: 200 },
                                bgcolor: '#fff',
                                border: '1px solid #E5E7EB',
                                borderRadius: '10px',
                                px: 2,
                                py: 0.75,
                                textAlign: 'center',
                            }}
                        >
                            <Typography sx={{
                                color: '#7A7A7A',
                                fontFamily: 'Inter, sans-serif',
                                fontSize: { xs: '12px', sm: '13px' },
                                fontWeight: 400,
                                lineHeight: '18px',
                            }}>
                                Camera Capacity
                            </Typography>
                            <Typography sx={{
                                color: '#191B23',
                                fontFamily: 'Inter, sans-serif',
                                fontSize: { xs: '12px', sm: '13px' },
                                fontWeight: 500,
                                lineHeight: '18px',
                                letterSpacing: '0.5px',
                                textTransform: 'uppercase',
                            }}>
                                MIN 4 • MAX 3688
                            </Typography>
                        </Box>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Stack spacing={1.75}>
                            <Box sx={{ position: 'relative', height: miniHeight }}>
                                <ResponsiveContainer
                                    width="100%"
                                    height="100%"
                                    onResize={(w, h) => setMiniSize({ w, h })}
                                >
                                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                        <Pie
                                            data={miniData}
                                            cx="50%"
                                            cy="100%"
                                            innerRadius={miniInner}
                                            outerRadius={miniOuter}
                                            startAngle={180}
                                            endAngle={0}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {miniData.map((d) => (
                                                <Cell key={d.name} fill={d.color} />
                                            ))}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <Box sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    // pb scales with the gauge height so the text cluster
                                    // keeps a consistent gap from the arc bottom.
                                    pb: { xs: '4px', sm: '6px', md: '8px' },
                                    pointerEvents: 'none',
                                }}>
                                    <Box component="svg" width={miniStarPx} height={miniStarPx} viewBox="0 0 20 19">
                                        <path
                                            fill="#4D87EA"
                                            d="M9.51062 0L12.7552 5.53423L19.0212 6.90983L14.7605 11.7058L15.3885 18.0902L9.51062 15.52L3.63277 18.0902L4.26079 11.7058L5.53131e-05 6.90983L6.26605 5.53423L9.51062 0Z"
                                        />
                                    </Box>
                                    <Typography sx={{
                                        mt: 0.25,
                                        color: '#4D87EA',
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: `${miniLabelPx}px`,
                                        fontWeight: 600,
                                        lineHeight: 1.25,
                                    }}>
                                        Optimal
                                    </Typography>
                                    <Typography sx={{
                                        color: '#5C5F61',
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: '10px',
                                        fontWeight: 500,
                                        lineHeight: '14px',
                                        letterSpacing: '0.5px',
                                        textTransform: 'uppercase',
                                    }}>
                                        Efficiency
                                    </Typography>
                                </Box>
                            </Box>

                            <Paper
                                elevation={0}
                                sx={{
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '10px',
                                    p: 1.5,
                                }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Typography sx={{
                                        color: '#5C5F61',
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        lineHeight: '15px',
                                        letterSpacing: '0.4px',
                                        textTransform: 'uppercase',
                                    }}>
                                        Accessible Cameras
                                    </Typography>
                                    <Box
                                        component="svg"
                                        width={24}
                                        height={24}
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#5C5F61"
                                        strokeWidth={1.5}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        sx={{ flexShrink: 0 }}
                                    >
                                        <path d="m22 8-6 4 6 4V8Z" />
                                        <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
                                    </Box>
                                </Stack>
                                <Typography sx={{
                                    mt: 0.5,
                                    color: '#191B23',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: { xs: '20px', sm: '22px' },
                                    fontWeight: 800,
                                    lineHeight: '26px',
                                }}>
                                    1,234
                                </Typography>
                            </Paper>

                            <Paper
                                elevation={0}
                                sx={{
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '10px',
                                    p: 1.5,
                                }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                    <Typography sx={{
                                        color: '#2E68C9',
                                        fontFamily: 'Inter, sans-serif',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        lineHeight: '15px',
                                        letterSpacing: '0.4px',
                                        textTransform: 'uppercase',
                                    }}>
                                        Memory Load
                                    </Typography>
                                    <Box component="svg" width={18} height={18} viewBox="0 0 15 15" sx={{ flexShrink: 0 }}>
                                        <path
                                            fill="#2E68C9"
                                            d="M7.5 14.9625C6.4625 14.9625 5.4875 14.7656 4.575 14.3719C3.6625 13.9781 2.86875 13.4406 2.19375 12.7594C1.51875 12.0781 0.984375 11.2812 0.590625 10.3687C0.196875 9.45625 0 8.4875 0 7.4625C0 5.5 0.65 3.8125 1.95 2.4C3.25 0.9875 4.85 0.1875 6.75 0V2.25C5.4625 2.425 4.39062 3.00312 3.53437 3.98438C2.67812 4.96562 2.25 6.125 2.25 7.4625C2.25 8.9125 2.7625 10.15 3.7875 11.175C4.8125 12.2 6.05 12.7125 7.5 12.7125C8.325 12.7125 9.09688 12.5375 9.81563 12.1875C10.5344 11.8375 11.1375 11.3625 11.625 10.7625L13.575 11.8875C12.9 12.825 12.0312 13.5719 10.9688 14.1281C9.90625 14.6844 8.75 14.9625 7.5 14.9625ZM14.3625 10.5L12.4125 9.375C12.525 9.075 12.6094 8.76562 12.6656 8.44687C12.7219 8.12812 12.75 7.8 12.75 7.4625C12.75 6.125 12.3219 4.96562 11.4656 3.98438C10.6094 3.00312 9.5375 2.425 8.25 2.25V0C10.15 0.1875 11.75 0.9875 13.05 2.4C14.35 3.8125 15 5.5 15 7.4625C15 8.0125 14.95 8.54375 14.85 9.05625C14.75 9.56875 14.5875 10.05 14.3625 10.5Z"
                                        />
                                    </Box>
                                </Stack>
                                <Typography sx={{
                                    mt: 0.5,
                                    color: '#2E68C9',
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: { xs: '20px', sm: '22px' },
                                    fontWeight: 800,
                                    lineHeight: '26px',
                                }}>
                                    14.2 GB / 24 GB
                                </Typography>
                            </Paper>
                        </Stack>
                    </Grid>
                </Grid>

                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.75}
                    sx={{ mt: 2.5, pl: 0.5 }}
                >
                    <Box
                        component="svg"
                        width={12}
                        height={12}
                        viewBox="0 0 16 16"
                        sx={{ flexShrink: 0, display: 'block', mt: '-1px' }}
                    >
                        <path
                            d="M8 5V8M8 11H8.0075M15.5 8C15.5 12.1421 12.1421 15.5 8 15.5C3.85786 15.5 0.5 12.1421 0.5 8C0.5 3.85786 3.85786 0.5 8 0.5C12.1421 0.5 15.5 3.85786 15.5 8Z"
                            stroke="#A6A6A6"
                            strokeWidth="1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            fill="none"
                        />
                    </Box>
                    <Typography sx={{
                        color: '#94A3B8',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '11px',
                        fontWeight: 400,
                        lineHeight: '14px',
                        whiteSpace: 'nowrap',
                    }}>
                        Independent of selected filters | Last Update 10:20:34 AM
                    </Typography>
                </Stack>
            </CardContent>
        </Card>
    );
};

// ---------------------------------------------------------------------------
// LiveExamsCard — paginated table from /api/dashboard/live-exams
// ---------------------------------------------------------------------------

const formatShortDate = (raw) => {
    if (!raw) return '';
    try {
        return format(parseISO(raw), 'd MMM');
    } catch {
        return raw;
    }
};

const formatHMM = (raw) => (typeof raw === 'string' ? raw.slice(0, 5) : '');

export const LiveExamsCard = ({ fetcher = dashboardAPI.getLiveExams }) => {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(0);          // 0-indexed for MUI TablePagination
    const [rowsPerPage, setRowsPerPage] = useState(10);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetcher({ page: page + 1, limit: rowsPerPage })
            .then((res) => {
                if (cancelled) return;
                const data = res?.data?.data || {};
                setRows(Array.isArray(data.rows) ? data.rows : []);
                setTotal(Number(data.total || 0));
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[Dashboard.getLiveExams]', err);
                setRows([]);
                setTotal(0);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [page, rowsPerPage, fetcher]);

    // Match other dashboard accents
    const ACCENT_BLUE = '#2E68C9';
    const HEADER_BG = '#f8fafc';
    const HEADER_TEXT = '#5C5F61';
    const BODY_DARK = '#191B23';
    const BODY_MID = '#5C5F61';
    const BODY_LIGHT = '#94A3B8';

    const headerCellSx = {
        fontFamily: 'Inter, sans-serif',
        fontWeight: 500,
        fontSize: '13px',
        color: HEADER_TEXT,
        letterSpacing: '0.2px',
        borderBottom: 'none',
        py: 1.5,
    };
    const bodyCellSx = {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        color: BODY_DARK,
        py: 1.75,
        borderBottom: '1px solid #EEF0F3',
    };

    return (
        <Card sx={{ borderRadius: '12px', boxShadow: '0 2px 4px 0 rgba(0,0,0,0.04)' }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 2 }}
                >
                    <Typography sx={{
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 700,
                        fontSize: { xs: '17px', sm: '20px' },
                        lineHeight: '24px',
                        color: '#191B23',
                    }}>
                        Live Shifts
                    </Typography>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />}
                        sx={{
                            textTransform: 'none',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500,
                            fontSize: '13px',
                            color: '#191B23',
                            borderColor: '#E5E7EB',
                            borderRadius: '8px',
                            px: 1.5,
                            py: 0.5,
                            '&:hover': {
                                borderColor: '#CBD5E1',
                                bgcolor: '#F8FAFC',
                            },
                        }}
                    >
                        Export
                    </Button>
                </Stack>

                <TableContainer
                    component={Paper}
                    elevation={0}
                    sx={{ borderRadius: 0, border: 'none', boxShadow: 'none', bgcolor: 'transparent' }}
                >
                    <Table>
                        <TableHead sx={{ bgcolor: HEADER_BG }}>
                            <TableRow>
                                <TableCell sx={{ ...headerCellSx, width: 36, p: 0, display: { xs: 'none', sm: 'table-cell' } }} />
                                <TableCell sx={headerCellSx}>Exam</TableCell>
                                <TableCell sx={headerCellSx}>Date</TableCell>
                                <TableCell sx={headerCellSx}>Shift &amp; Time</TableCell>
                                <TableCell sx={headerCellSx}>Cameras</TableCell>
                                <TableCell sx={headerCellSx}>Scripts</TableCell>
                                <TableCell sx={headerCellSx}>Detections</TableCell>
                                <TableCell sx={{ ...headerCellSx, width: 110, display: { xs: 'none', sm: 'table-cell' } }} />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 4, border: 'none' }}>
                                        <CircularProgress size={28} />
                                    </TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: BODY_LIGHT, border: 'none' }}>
                                        No live shifts right now.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                rows.map((row) => (
                                    <TableRow key={`${row.exam_id}::${row.shift_id}`} hover>
                                        <TableCell sx={{ ...bodyCellSx, width: 36, p: 0, textAlign: 'center', color: '#94A3B8', display: { xs: 'none', sm: 'table-cell' } }}>
                                            <KeyboardArrowDownRoundedIcon sx={{ fontSize: 20, color: '#94A3B8', verticalAlign: 'middle' }} />
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, fontWeight: 700, fontSize: { xs: '13px', sm: '14px' } }}>
                                            {row.exam_name}
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, color: BODY_MID, fontSize: { xs: '13px', sm: '14px' } }}>
                                            {formatShortDate(row.date)}
                                        </TableCell>
                                        <TableCell sx={bodyCellSx}>
                                            <Typography sx={{
                                                fontFamily: 'Inter, sans-serif',
                                                fontWeight: 700,
                                                fontSize: { xs: '13px', sm: '14px' },
                                                color: BODY_DARK,
                                                lineHeight: '18px',
                                            }}>
                                                Shift {row.shift_index || 1}
                                            </Typography>
                                            <Typography sx={{
                                                fontFamily: 'Inter, sans-serif',
                                                fontSize: { xs: '11px', sm: '12px' },
                                                color: BODY_LIGHT,
                                                lineHeight: '15px',
                                                mt: 0.25,
                                            }}>
                                                {formatHMM(row.shift_start)} - {formatHMM(row.shift_end)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, color: ACCENT_BLUE, fontWeight: 700, fontSize: { xs: '13px', sm: '14px' } }}>
                                            {Number(row.cameras || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, color: ACCENT_BLUE, fontWeight: 700, fontSize: { xs: '13px', sm: '14px' } }}>
                                            {Number(row.scripts || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, color: BODY_DARK, fontSize: { xs: '13px', sm: '14px' } }}>
                                            {Number(row.detections || 0).toLocaleString()}
                                        </TableCell>
                                        <TableCell sx={{ ...bodyCellSx, width: 110, color: ACCENT_BLUE, fontWeight: 600, cursor: 'pointer', display: { xs: 'none', sm: 'table-cell' } }}>
                                            View Details
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                <TablePagination
                    component="div"
                    count={total}
                    page={page}
                    onPageChange={(_, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10) || 10);
                        setPage(0);
                    }}
                    rowsPerPageOptions={[5, 10, 25, 50]}
                    labelRowsPerPage="Rows per page:"
                    sx={{
                        '.MuiTablePagination-toolbar': { minHeight: '44px !important', px: 1 },
                        '.MuiTablePagination-selectLabel, .MuiTablePagination-select, .MuiTablePagination-displayedRows': {
                            m: 0,
                            fontSize: { xs: 12, sm: 13 },
                            color: '#334155',
                        },
                    }}
                />
            </CardContent>
        </Card>
    );
};

// ---------------------------------------------------------------------------
// AdvancedFiltersDialog — modal opened by the filter button
// Holds its own local state for the four controls; only commits to the parent
// when "Apply filters" is clicked. Cancel / × discard local edits.
// ---------------------------------------------------------------------------

const SHIFT_INDEXES = [1, 2, 3];

export const AdvancedFiltersDialog = ({
    open,
    onClose,
    initialFrom,
    initialTo,
    initialExam,
    initialShifts,
    onApply,
}) => {
    const [from, setFrom] = useState(initialFrom);
    const [to, setTo] = useState(initialTo);
    const [exam, setExam] = useState(initialExam);
    const [shifts, setShifts] = useState(initialShifts || []);
    const [examOptions, setExamOptions] = useState([]);
    const [examOptionsLoading, setExamOptionsLoading] = useState(false);

    // Reset local state whenever the dialog opens so it reflects the parent's
    // current applied filters.
    useEffect(() => {
        if (open) {
            setFrom(initialFrom);
            setTo(initialTo);
            setExam(initialExam);
            setShifts(initialShifts || []);
        }
    }, [open, initialFrom, initialTo, initialExam, initialShifts]);

    // Fetch the full exam list (company-scoped on the backend) when the dialog opens.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setExamOptionsLoading(true);
        examsAPI.getAll({ is_active: 'true' })
            .then((res) => {
                if (cancelled) return;
                const list = res?.data?.data || res?.data || [];
                setExamOptions(Array.isArray(list) ? list : []);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[AdvancedFilters.getAllExams]', err);
                setExamOptions([]);
            })
            .finally(() => { if (!cancelled) setExamOptionsLoading(false); });
        return () => { cancelled = true; };
    }, [open]);

    // Filter to exams overlapping the modal's currently-edited [from, to] range.
    const visibleExams = useMemo(() => {
        if (!from || !to) return examOptions;
        const fromStr = format(from, 'yyyy-MM-dd');
        const toStr   = format(to,   'yyyy-MM-dd');
        return examOptions.filter((e) => {
            const s = e.start_date ? String(e.start_date).slice(0, 10) : null;
            const x = e.end_date   ? String(e.end_date).slice(0, 10)   : null;
            if (!s || !x) return false;
            return s <= toStr && x >= fromStr; // overlap
        });
    }, [examOptions, from, to]);

    // If the picked exam falls out of the visible set after a date edit, reset to 'all'.
    useEffect(() => {
        if (exam === 'all') return;
        if (!visibleExams.some((e) => e.id === exam)) {
            setExam('all');
        }
    }, [visibleExams, exam]);

    const sameDay = (a, b) => format(a, 'yyyy-MM-dd') === format(b, 'yyyy-MM-dd');
    const today = new Date();
    const localBadge =
        ((!sameDay(from, today) || !sameDay(to, today)) ? 1 : 0) +
        (exam !== 'all' ? 1 : 0) +
        shifts.length;

    const handleClearAll = () => {
        const t = new Date();
        setFrom(t);
        setTo(t);
        setExam('all');
        setShifts([]);
    };

    const handleApply = () => {
        let f = from;
        let t = to;
        if (f > t) {
            const tmp = f; f = t; t = tmp;
        }
        onApply({ from: f, to: t, exam, shifts });
    };

    const toggleShift = (n) => {
        setShifts((prev) => prev.includes(n)
            ? prev.filter((x) => x !== n)
            : [...prev, n].sort((a, b) => a - b));
    };

    const theme = useTheme();
    const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

    const fieldLabelSx = {
        mb: 0.75,
        color: '#5C5F61',
        fontFamily: 'Inter, sans-serif',
        fontSize: { xs: '12px', sm: '13px' },
        fontWeight: 500,
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            fullScreen={fullScreen}
            PaperProps={{
                sx: {
                    borderRadius: fullScreen ? 0 : '14px',
                    width: fullScreen ? '100%' : 640,
                    maxWidth: fullScreen ? '100%' : '90vw',
                    p: { xs: 2, sm: 2.5 },
                },
            }}
        >
            <LocalizationProvider dateAdapter={AdapterDateFns}>
                {/* Header */}
                <Stack direction="row" alignItems="center" sx={{ mb: 2.5 }}>
                    <TuneRoundedIcon sx={{ fontSize: 18, color: '#191B23' }} />
                    <Typography sx={{
                        ml: 1,
                        color: '#191B23',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '16px',
                        fontWeight: 600,
                    }}>
                        Advanced filters
                    </Typography>
                    {localBadge > 0 && (
                        <Box sx={{
                            ml: 1,
                            minWidth: 18,
                            height: 18,
                            px: 0.5,
                            bgcolor: '#3c81f6',
                            borderRadius: 999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '11px',
                            fontWeight: 700,
                            lineHeight: 1,
                        }}>
                            {localBadge}
                        </Box>
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    <Box
                        component="button"
                        type="button"
                        onClick={handleClearAll}
                        sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.5,
                            border: 'none',
                            bgcolor: 'transparent',
                            cursor: 'pointer',
                            color: '#5C5F61',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '13px',
                            fontWeight: 500,
                            px: 0.5,
                            '&:hover': { color: '#191B23' },
                        }}
                    >
                        <HistoryRoundedIcon sx={{ fontSize: 16 }} />
                        Clear all filters
                    </Box>
                    <Box
                        component="button"
                        type="button"
                        onClick={onClose}
                        aria-label="Close filters"
                        sx={{
                            ml: 1,
                            border: 'none',
                            bgcolor: 'transparent',
                            cursor: 'pointer',
                            color: '#5C5F61',
                            p: 0.5,
                            display: 'flex',
                            '&:hover': { color: '#191B23' },
                        }}
                    >
                        <CloseRoundedIcon sx={{ fontSize: 18 }} />
                    </Box>
                </Stack>

                {/* Body — 2×2 grid */}
                <Grid container spacing={2.5} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6}>
                        <Typography sx={fieldLabelSx}>Exam selection</Typography>
                        <FormControl fullWidth size="small">
                            <Select
                                value={exam}
                                onChange={(e) => setExam(e.target.value)}
                                disabled={examOptionsLoading}
                                sx={{
                                    fontFamily: 'Inter, sans-serif',
                                    fontSize: { xs: '13px', sm: '14px' },
                                    borderRadius: '10px',
                                    '& .MuiSelect-select': { py: 1.25 },
                                }}
                            >
                                <MenuItem value="all">All Exams</MenuItem>
                                {visibleExams.map((ex) => (
                                    <MenuItem key={ex.id} value={ex.id}>
                                        {ex.exam_name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <Typography sx={fieldLabelSx}>Shift selection</Typography>
                        <Stack direction="row" spacing={1}>
                            {SHIFT_INDEXES.map((n) => {
                                const active = shifts.includes(n);
                                return (
                                    <Box
                                        key={n}
                                        component="button"
                                        type="button"
                                        onClick={() => toggleShift(n)}
                                        sx={{
                                            flex: 1,
                                            py: 1.25,
                                            borderRadius: '10px',
                                            bgcolor: active ? '#dbeafe' : '#fff',
                                            color: active ? '#3c81f6' : '#191B23',
                                            border: `1px solid ${active ? '#3c81f6' : '#E5E7EB'}`,
                                            fontFamily: 'Inter, sans-serif',
                                            fontSize: { xs: '13px', sm: '14px' },
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            '&:hover': { borderColor: '#3c81f6' },
                                        }}
                                    >
                                        Shift {n}
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <Typography sx={fieldLabelSx}>From date</Typography>
                        <DatePicker
                            value={from}
                            onChange={(d) => d && setFrom(d)}
                            format="d MMM yyyy"
                            slotProps={{
                                textField: {
                                    fullWidth: true,
                                    size: 'small',
                                    sx: {
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: '10px',
                                            fontFamily: 'Inter, sans-serif',
                                            fontSize: { xs: '13px', sm: '14px' },
                                        },
                                    },
                                },
                            }}
                        />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <Typography sx={fieldLabelSx}>To date</Typography>
                        <DatePicker
                            value={to}
                            onChange={(d) => d && setTo(d)}
                            format="d MMM yyyy"
                            slotProps={{
                                textField: {
                                    fullWidth: true,
                                    size: 'small',
                                    sx: {
                                        '& .MuiOutlinedInput-root': {
                                            borderRadius: '10px',
                                            fontFamily: 'Inter, sans-serif',
                                            fontSize: { xs: '13px', sm: '14px' },
                                        },
                                    },
                                },
                            }}
                        />
                    </Grid>
                </Grid>

                {/* Footer */}
                <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
                    <Button
                        variant="outlined"
                        onClick={onClose}
                        sx={{
                            textTransform: 'none',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 500,
                            fontSize: { xs: '13px', sm: '14px' },
                            color: '#5C5F61',
                            borderColor: '#E5E7EB',
                            borderRadius: '10px',
                            px: 3,
                            py: 1,
                            '&:hover': { borderColor: '#CBD5E1', bgcolor: '#F8FAFC' },
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        disableElevation
                        onClick={handleApply}
                        sx={{
                            bgcolor: '#3c81f6',
                            color: '#fff',
                            textTransform: 'none',
                            fontFamily: 'Inter, sans-serif',
                            fontWeight: 700,
                            fontSize: { xs: '13px', sm: '14px' },
                            borderRadius: '10px',
                            px: 3,
                            py: 1,
                            '&:hover': { bgcolor: '#1e40af' },
                        }}
                    >
                        Apply filters
                    </Button>
                </Stack>
            </LocalizationProvider>
        </Dialog>
    );
};

// ---------------------------------------------------------------------------
// Dashboard (default export)
// ---------------------------------------------------------------------------

const Dashboard = () => {
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

    // Fetch all exams once on mount so we can label active chips + power autocomplete.
    useEffect(() => {
        let cancelled = false;
        examsAPI.getAll({ is_active: 'true' })
            .then((res) => {
                if (cancelled) return;
                const list = res?.data?.data || res?.data || [];
                setExamsList(Array.isArray(list) ? list : []);
            })
            .catch((err) => {
                if (!cancelled) console.error('[Dashboard.examsAPI.getAll]', err);
            });
        return () => { cancelled = true; };
    }, []);

    const examNameById = (id) => examsList.find((e) => e.id === id)?.exam_name;

    // Derive API params + active filter chips from the selected date chip
    // plus any non-default shift/exam set via the Advanced filters modal.
    // Today (with default shift/exam/exam) produces no active chips so Row 4 hides.
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
    // examsList is used by examNameById; re-running on its change keeps the chip
    // label fresh once the exam list arrives.
    }, [dateChip, customRange, selectedShifts, selectedExam, examsList]);

    // Removes a single active filter chip by its key — narrower than Clear all.
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

    // Search keyword autocomplete vocabulary, built from current data.
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
        dashboardAPI
            .getOverview(apiParams)
            .then((res) => {
                if (!cancelled) setOverview(res?.data?.data || null);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('[Dashboard.getOverview]', err);
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

    // Prefill the modal's From/To from the current chip selection so opening
    // the modal shows the same range the dashboard is currently using.
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
            // User effectively cleared the date filter — fall back to Today default.
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
                        fontSize: { xs: '22px', sm: '26px' },
                        lineHeight: { xs: '28px', sm: '32px' },
                        color: '#191B23',
                        letterSpacing: '0.2px',
                    }}>
                        Overview
                    </Typography>
                    <Typography sx={{
                        mt: 0.25,
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 400,
                        fontSize: { xs: '13px', sm: '14px' },
                        lineHeight: '20px',
                        color: '#303336',
                    }}>
                        Monitor Live Exams, Camera Activity, Detections
                    </Typography>
                </Box>
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
                        px: { xs: 1.5, sm: 2 },
                        py: { xs: 1, sm: 1.25 },
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
                            fontSize: { xs: '13px', sm: '14px' },
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
                            maxHeight: { xs: '50vh', sm: 320 },
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
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 1,
                                                '&:hover': { bgcolor: '#F5F6FA' },
                                            }}
                                        >
                                            <Box component="span">{s.label}</Box>
                                            <Box component="span" sx={{
                                                ml: 'auto',
                                                color: '#94A3B8',
                                                fontSize: '11px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                            }}>
                                                {s.category}
                                            </Box>
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
                        width: { xs: 40, sm: 48 },
                        height: { xs: 40, sm: 48 },
                        bgcolor: '#3c81f6',
                        border: 'none',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                        '&:hover': { bgcolor: '#1e40af' },
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
                            border: '1.5px solid #3c81f6',
                            borderRadius: 999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#3c81f6',
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
                                bgcolor: active ? '#3c81f6' : '#fff',
                                color: active ? '#fff' : '#191B23',
                                border: active ? 'none' : '1px solid #E5E7EB',
                                borderRadius: 999,
                                px: { xs: 1.25, sm: 1.75 },
                                py: 0.5,
                                fontFamily: 'Inter, sans-serif',
                                fontSize: { xs: '13px', sm: '14px' },
                                fontWeight: 500,
                                cursor: 'pointer',
                                '&:hover': active ? { bgcolor: '#1e40af' } : { borderColor: '#CBD5E1' },
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
                    sx={{ mb: { xs: 1.5, sm: 2.5 } }}
                >
                    {activeFilters.map((f) => (
                        <Chip
                            key={f.key}
                            label={f.label}
                            onDelete={() => removeFilter(f.key)}
                            deleteIcon={<CloseRoundedIcon sx={{ fontSize: 14 }} />}
                            sx={{
                                bgcolor: '#dbeafe',
                                color: '#3c81f6',
                                fontFamily: 'Inter, sans-serif',
                                fontSize: { xs: '12px', sm: '13px' },
                                fontWeight: 500,
                                borderRadius: 999,
                                height: 28,
                                maxWidth: { xs: 200, sm: 'none' },
                                '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                                '& .MuiChip-deleteIcon': {
                                    color: '#3c81f6',
                                    '&:hover': { color: '#1e40af' },
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
                            color: '#3c81f6',
                            fontFamily: 'Inter, sans-serif',
                            fontSize: { xs: '12px', sm: '13px' },
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
                <Grid container spacing={{ xs: 1.5, sm: 2, lg: 2.5 }} sx={{ mb: { xs: 2, sm: 2.5 } }}>
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

                {/* Row 2 — Distribution + GPU */}
                <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
                    <Grid item xs={12} md={6}>
                        <DetectionDistributionCard
                            distribution={distribution}
                            loading={overviewLoading}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <GpuPerformanceCard />
                    </Grid>
                </Grid>

            {/* Row 3 — Live Exams table */}
            <LiveExamsCard />
        </Box>
    );
};

export default Dashboard;
