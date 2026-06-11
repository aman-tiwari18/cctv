import React from 'react';
import {
  Box,
  Button,
  Drawer,
  IconButton,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  ChevronRight,
  KeyboardArrowLeft,
  KeyboardArrowRight,
} from '@mui/icons-material';
import { ExamsSvgIcon } from './ExamsSvgIcon';

// Height of the fixed top app bar (mirrors APPBAR_HEIGHT in Layout.jsx). The
// mobile overlay drawer + backdrop are offset by this so the header stays clear.
const APP_BAR_HEIGHT = 64;

/**
 * Reusable collapsible exam sidebar component.
 *
 * Desktop (md+): inline collapsible rail — 56px collapsed, 280px expanded,
 * pushing the page content. Controlled via the `open` / `onToggle` props.
 *
 * Mobile (< md): the inline footprint stays a fixed 56px rail (the expand
 * trigger); expanding opens the full panel as a temporary Drawer overlay with
 * a dimmed backdrop (mirrors the main hamburger nav) so it never squishes the
 * page content. The overlay uses internal state, independent of `open`.
 *
 * @param {Object} props
 * @param {boolean} props.open - Whether sidebar is open/expanded (desktop)
 * @param {function} props.onToggle - Callback when desktop toggle is clicked
 * @param {Array} props.exams - Array of exam objects
 * @param {string|number} props.selectedExamId - Currently selected exam ID
 * @param {function} props.onSelectExam - Callback when exam is selected (receives exam.id)
 * @param {boolean} props.viewingArchived - Whether viewing archived exams
 * @param {function} props.onToggleArchived - Callback when archive toggle is clicked
 * @param {string} props.title - Optional custom title (defaults to "Available Exams" / "Archived Exams")
 * @param {React.ReactNode} props.icon - Optional custom icon (defaults to ExamsSvgIcon)
 */
const ExamSidebar = ({
  open,
  onToggle,
  exams = [],
  selectedExamId,
  onSelectExam,
  viewingArchived = false,
  onToggleArchived,
  title,
  icon,
}) => {
  const displayTitle = title || (viewingArchived ? 'Archived Exams' : 'Available Exams');
  const IconComponent = icon || ExamsSvgIcon;

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  // Overlay state for the mobile Drawer — independent of the `open` prop so the
  // drawer never auto-opens over content when the parent defaults `open` to true.
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Expand/collapse: on mobile drive the overlay, on desktop bubble to parent.
  const handleToggle = () => {
    if (isMobile) setMobileOpen((o) => !o);
    else onToggle();
  };

  // Selecting an exam closes the overlay on mobile so the content is visible.
  const handleSelect = (id) => {
    onSelectExam(id);
    if (isMobile) setMobileOpen(false);
  };

  // ── Header (icon + title + expand/collapse button) ──
  const renderHeader = (expanded) => (
    <Box
      sx={{
        px: expanded ? 2.5 : 1,
        pt: 2.5,
        pb: 1.5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: expanded ? 'space-between' : 'center',
        flexShrink: 0,
      }}
    >
      {expanded && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
          <IconComponent sx={{ fontSize: 17, color: '#64748b' }} />
          <Typography
            sx={{
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#334155',
            }}
          >
            {displayTitle}
          </Typography>
        </Box>
      )}
      <Tooltip title={expanded ? 'Collapse sidebar' : 'Expand sidebar'} placement="right">
        <IconButton
          size="small"
          // .blur() releases focus so MUI's .Mui-focusVisible doesn't linger.
          // disableRipple kills the ripple animation that can leave a brief
          // dark residue independent of focus/hover. Together they prevent
          // the "stuck darker color sometimes" the user was seeing.
          disableRipple
          onClick={(e) => { handleToggle(); e.currentTarget.blur(); }}
          sx={{
            color: '#fff',
            bgcolor: '#3b82f6',
            // `:active` (mouse-down) gives a brief darker press feedback;
            // `:hover` is forced to the base color so the button can't get
            // "stuck dark" when the cursor lingers over it after the click.
            '&:hover':  { bgcolor: '#3b82f6' },
            '&:active': { bgcolor: '#2563eb' },
            borderRadius: 2,
            width: 32,
            height: 32,
          }}
        >
          {expanded ? (
            <KeyboardArrowLeft sx={{ fontSize: 20 }} />
          ) : (
            <KeyboardArrowRight sx={{ fontSize: 20 }} />
          )}
        </IconButton>
      </Tooltip>
    </Box>
  );

  // ── Exam list (full rows when expanded, letter boxes when collapsed) ──
  const renderExamList = (expanded) => (
    <Box
      sx={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {exams.map((exam) => {
        const active = String(exam.id) === String(selectedExamId);
        return (
          <Tooltip
            key={exam.id}
            title={!expanded ? `${exam.exam_name} (${exam.exam_body})` : ''}
            placement="right"
          >
            <Box
              onClick={() => handleSelect(String(exam.id))}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: expanded ? 'space-between' : 'center',
                px: expanded ? 2.5 : 0,
                py: 1.8,
                cursor: 'pointer',
                borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                bgcolor: active ? '#f0f6ff' : 'transparent',
                transition: 'all 0.15s ease',
                '&:hover': { bgcolor: active ? '#f0f6ff' : '#f8fafc' },
              }}
            >
              {expanded ? (
                <>
                  <Typography
                    sx={{
                      fontSize: '0.88rem',
                      fontWeight: active ? 600 : 400,
                      color: active ? '#3b82f6' : '#334155',
                      lineHeight: 1.4,
                      pr: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {exam.exam_name} ({exam.exam_body})
                  </Typography>
                  <ChevronRight
                    sx={{ fontSize: 20, color: active ? '#3b82f6' : '#94a3b8', flexShrink: 0 }}
                  />
                </>
              ) : (
                /* Collapsed: show first letter of exam name in a styled box.
                   Selected uses a very light blue tint + primary-blue letter
                   to mirror the main left-nav "current page" treatment. */
                <Box
                  sx={{
                    width: 34,
                    height: 34,
                    borderRadius: 2,
                    bgcolor: active ? '#dbeafe' : '#f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.15s',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      color: active ? '#3c81f6' : '#64748b',
                      textTransform: 'uppercase',
                    }}
                  >
                    {exam.exam_name.charAt(0)}
                  </Typography>
                </Box>
              )}
            </Box>
          </Tooltip>
        );
      })}
      {exams.length === 0 && expanded && (
        <Typography sx={{ px: 2.5, py: 2, fontSize: '0.82rem', color: '#94a3b8' }}>
          No exams found.
        </Typography>
      )}
    </Box>
  );

  // ── "View Archived / Active" button (expanded only) ──
  const renderArchivedToggle = () =>
    onToggleArchived ? (
      <Box sx={{ px: 2.5, py: 2, flexShrink: 0 }}>
        <Button
          variant="outlined"
          fullWidth
          onClick={onToggleArchived}
          sx={{
            textTransform: 'uppercase',
            fontWeight: 500,
            fontSize: '0.72rem',
            letterSpacing: '0.04em',
            borderColor: '#cbd5e1',
            color: '#777',
            borderRadius: 2,
            py: 1,
            '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' },
          }}
        >
          {viewingArchived ? 'View Active Exams' : 'View Archived Exams'}
        </Button>
      </Box>
    ) : null;

  const collapsedContent = (
    <>
      {renderHeader(false)}
      {renderExamList(false)}
    </>
  );

  const expandedContent = (
    <>
      {renderHeader(true)}
      {renderExamList(true)}
      {renderArchivedToggle()}
    </>
  );

  return (
    <>
      {/* ── Desktop (md+): inline collapsible rail, pushes content ── */}
      <Box
        sx={{
          width: open ? { xs: 200, sm: 280 } : 56,
          flexShrink: 0,
          borderRight: '1px solid #e8ecf1',
          bgcolor: '#fff',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {open ? expandedContent : collapsedContent}
      </Box>

      {/* ── Mobile (< md): fixed 56px rail acts as the expand trigger ── */}
      <Box
        sx={{
          width: 56,
          flexShrink: 0,
          borderRight: '1px solid #e8ecf1',
          bgcolor: '#fff',
          display: { xs: 'flex', md: 'none' },
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {collapsedContent}
      </Box>

      {/* ── Mobile (< md): expanded panel as an overlay drawer with backdrop ──
           Offset below the fixed top app bar (APPBAR_HEIGHT = 64 in Layout.jsx)
           so the header — hamburger, page title, profile — stays visible and is
           not covered or dimmed by the overlay. */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { top: `${APP_BAR_HEIGHT}px`, height: `calc(100% - ${APP_BAR_HEIGHT}px)` },
          '& .MuiBackdrop-root': { top: `${APP_BAR_HEIGHT}px` },
        }}
        PaperProps={{ sx: { width: 280, bgcolor: '#fff' } }}
      >
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {expandedContent}
        </Box>
      </Drawer>
    </>
  );
};

export default ExamSidebar;
