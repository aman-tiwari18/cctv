import { useEffect } from 'react';
import { Box, Dialog, IconButton, Tooltip, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { ChevronLeft, ChevronRight, Close } from '@mui/icons-material';

/**
 * Previous / next navigation for an open detection card (admin, operator and client pages).
 *
 *   useDetectionNav(...)   Left / Right arrow keys step through the list the card was opened from.
 *   DetectionNavButtons    the same two steps as buttons over the image, plus a "3 / 50" counter.
 *
 * `index` is the open item's position in `items` (-1 = not in the list: no navigation, the card
 * behaves as before). The list stops at both ends. Index and count are recomputed by the page on every
 * render from the item's key, so a live detection arriving while a card is open does not move it.
 */

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/** Index the arrow key should move to, or null when the key does nothing. */
export function stepForKey(key, index, count) {
  if (index < 0 || count < 2) return null;
  if (key === 'ArrowLeft') return index > 0 ? index - 1 : null;
  if (key === 'ArrowRight') return index < count - 1 ? index + 1 : null;
  return null;
}

/** A key press that belongs to something else (typing in a field, a shortcut) must not navigate. */
export function isNavKeyEvent(e) {
  if (!e || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  const t = e.target;
  if (t && (TYPING_TAGS.has(t.tagName) || t.isContentEditable)) return false;
  return true;
}

export function useDetectionNav({ index, count, onNavigate, neighbourUrls = [] }) {
  useEffect(() => {
    if (index < 0 || count < 2) return undefined;
    const onKey = (e) => {
      if (!isNavKeyEvent(e)) return;
      const to = stepForKey(e.key, index, count);
      if (to == null) return;
      e.preventDefault();
      onNavigate(to);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, count, onNavigate]);

  // Fetch the neighbours' images ahead of time so a step shows the next image straight away.
  const urlKey = neighbourUrls.filter(Boolean).join('|');
  useEffect(() => {
    if (!urlKey) return;
    urlKey.split('|').forEach((src) => { const img = new Image(); img.src = src; });
  }, [urlKey]);
}

const arrowSx = (side) => ({
  position: 'absolute',
  top: '50%',
  [side]: { xs: 4, sm: 12 },
  transform: 'translateY(-50%)',
  zIndex: 5,
  color: '#0f172a',
  bgcolor: 'rgba(255,255,255,0.92)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
  width: { xs: 44, sm: 52 },
  height: { xs: 44, sm: 52 },
  '&:hover': { bgcolor: '#fff' },
  '&.Mui-disabled': { color: 'rgba(15,23,42,0.35)', bgcolor: 'rgba(255,255,255,0.28)', boxShadow: 'none' },
});

export function DetectionNavButtons({ index, count, onNavigate }) {
  if (index < 0 || count < 2) return null;
  const atStart = index === 0;
  const atEnd = index === count - 1;
  return (
    <>
      <Tooltip title="Previous detection (←)" placement="right">
        {/* span: a disabled button cannot show a tooltip on its own */}
        <span>
          <IconButton
            aria-label="Previous detection"
            disabled={atStart}
            onClick={() => onNavigate(index - 1)}
            sx={arrowSx('left')}
          >
            <ChevronLeft sx={{ fontSize: 32 }} />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Next detection (→)" placement="left">
        <span>
          <IconButton
            aria-label="Next detection"
            disabled={atEnd}
            onClick={() => onNavigate(index + 1)}
            sx={arrowSx('right')}
          >
            <ChevronRight sx={{ fontSize: 32 }} />
          </IconButton>
        </span>
      </Tooltip>
      <Box
        aria-live="polite"
        sx={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 5,
          px: 1.25, py: 0.25, borderRadius: 99, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff',
          fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
        }}
      >
        {index + 1} / {count}
      </Box>
    </>
  );
}

/**
 * The opened detection card, same layout on every page: the image takes whatever height is left, and a
 * footer with the details and the role's buttons (admin/operator: Skip + Push to client; client: Accept +
 * Remove) always stays on screen, so nothing needs scrolling to be reached.
 *   banner  small chip over the image, top left (e.g. "3 new detections waiting")
 *   info    details shown in the footer          actions  the role's buttons
 */
export function DetectionDialog({ onClose, imageSrc, alt, banner, nav, info, actions, dialogProps = {} }) {
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Dialog
      open
      onClose={onClose}
      {...dialogProps}
      maxWidth="lg"
      fullWidth
      fullScreen={isSmDown}
      PaperProps={{ sx: { bgcolor: '#0f172a', m: { xs: 0, sm: 2 }, height: { xs: '100dvh', sm: 'calc(100vh - 32px)' }, maxHeight: 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden' } }}
    >
      <Box sx={{ position: 'relative', flex: '1 1 auto', minHeight: 140, bgcolor: '#020617' }}>
        <IconButton
          aria-label="Close"
          onClick={onClose}
          sx={{
            position: 'absolute', top: 8, right: 8, zIndex: 10, color: '#fff', bgcolor: 'rgba(0,0,0,0.55)',
            width: { xs: 44, sm: 40 }, height: { xs: 44, sm: 40 }, '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
          }}
        >
          <Close sx={{ fontSize: { xs: 26, sm: 24 } }} />
        </IconButton>
        {banner && <Box sx={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}>{banner}</Box>}
        <Box component="img" src={imageSrc} alt={alt} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />
        {nav && <DetectionNavButtons index={nav.index} count={nav.count} onNavigate={nav.onNavigate} />}
      </Box>
      <Box sx={{ flexShrink: 0, borderTop: '1px solid #1e293b', px: { xs: 1.5, sm: 2.5 }, py: { xs: 1, sm: 1.5 }, color: '#fff', display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 1, md: 2.5 }, alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0, maxHeight: { xs: '18vh', md: 'none' }, overflowY: 'auto' }}>{info}</Box>
        {actions && <Box sx={{ display: 'flex', gap: 1.5, flexShrink: 0, '& > button': { height: 44, minWidth: { xs: 0, sm: 150 }, flex: { xs: 1, md: '0 0 auto' } } }}>{actions}</Box>}
      </Box>
    </Dialog>
  );
}
