// Window geometry for the floating companion. The mascot never moves when the
// usage panel opens or closes: the panel takes whichever side of the mascot has
// room (above, then below, then right, then left) and the window grows around
// both. All values are screen DIPs; `mascot` is the mascot box's top-left corner.
// Above or below is preferred even when the full height does not fit there: a
// laptop screen (a Mac's work area is ~800 tall) rarely has 590 above the mascot,
// so the panel gets shorter and scrolls rather than jumping to the side, as long
// as `vertical` is left.
const MASCOT = 174;
// Mascot-only window: 210×216 with the mascot box at (18, 31).
const COMPACT = { left: 18, top: 31, right: 18, bottom: 11 };
const PANEL = { width: 406, height: 590, vertical: 420, minHeight: 300 };
const GAP = 8;
// Room around the panel for its shadow, which falls downward.
const PAD = { top: 12, right: 12, bottom: 22, left: 12 };
const PLACEMENTS = ['above', 'below', 'right', 'left'];

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

function compactBounds(mascot) {
  return { x: mascot.x - COMPACT.left, y: mascot.y - COMPACT.top,
    width: COMPACT.left + MASCOT + COMPACT.right, height: COMPACT.top + MASCOT + COMPACT.bottom };
}
function mascotInCompact(position) { return { x: position.x + COMPACT.left, y: position.y + COMPACT.top }; }

function panelRect(mascot, area, prefer) {
  const right = mascot.x + MASCOT, bottom = mascot.y + MASCOT;
  const minX = area.x + PAD.left, maxX = area.x + area.width - PAD.right;
  const minY = area.y + PAD.top, maxY = area.y + area.height - PAD.bottom;
  const width = Math.max(1, Math.min(PANEL.width, maxX - minX));
  const height = Math.max(1, Math.min(PANEL.height, maxY - minY));
  const room = { above: mascot.y - GAP - minY, below: maxY - bottom - GAP, right: maxX - right - GAP, left: mascot.x - GAP - minX };
  const centeredX = clamp(Math.round(mascot.x + MASCOT / 2 - width / 2), minX, maxX - width);
  const place = (placement, h = height) => {
    if (placement === 'above') return { placement, x: centeredX, y: mascot.y - GAP - h, width, height: h };
    if (placement === 'below') return { placement, x: centeredX, y: bottom + GAP, width, height: h };
    const y = clamp(Math.round(mascot.y + MASCOT / 2 - h / 2), minY, maxY - h);
    return { placement, x: placement === 'right' ? right + GAP : mascot.x - GAP - width, y, width, height: h };
  };
  const vertical = placement => placement === 'above' || placement === 'below';
  const fits = placement => room[placement] >= (vertical(placement) ? height : width);
  // Above/below at a shorter height: everything that is left there, if that is at least PANEL.vertical.
  const shortFits = placement => vertical(placement) && room[placement] >= Math.min(height, PANEL.vertical);
  const shortPlace = placement => place(placement, Math.min(height, room[placement]));
  // A panel that still fits keeps its side, so dropping the mascot does not flip it.
  if (PLACEMENTS.includes(prefer) && fits(prefer)) return place(prefer);
  if (PLACEMENTS.includes(prefer) && shortFits(prefer)) return shortPlace(prefer);
  for (const placement of ['above', 'below']) if (fits(placement)) return place(placement);
  const roomier = room.above >= room.below ? 'above' : 'below';
  if (shortFits(roomier)) return shortPlace(roomier);
  for (const placement of ['right', 'left']) if (fits(placement)) return place(placement);
  // Small display: a shorter, scrolling panel on the roomier of above and below.
  const best = room.above >= room.below ? 'above' : 'below';
  const short = place(best, Math.max(PANEL.minHeight, Math.min(height, room[best])));
  short.y = clamp(short.y, minY, Math.max(minY, maxY - short.height));
  return short;
}

function layoutFor({ compact, mascot, workArea, prefer }) {
  const size = { width: MASCOT, height: MASCOT };
  if (compact) {
    return { compact: true, placement: 'none', bounds: compactBounds(mascot),
      mascot: { x: COMPACT.left, y: COMPACT.top, ...size }, panel: null };
  }
  const panel = panelRect(mascot, workArea, prefer);
  const left = Math.min(mascot.x, panel.x - PAD.left), top = Math.min(mascot.y, panel.y - PAD.top);
  const right = Math.max(mascot.x + MASCOT, panel.x + panel.width + PAD.right);
  const bottom = Math.max(mascot.y + MASCOT, panel.y + panel.height + PAD.bottom);
  return { compact: false, placement: panel.placement, bounds: { x: left, y: top, width: right - left, height: bottom - top },
    mascot: { x: mascot.x - left, y: mascot.y - top, ...size },
    panel: { x: panel.x - left, y: panel.y - top, width: panel.width, height: panel.height } };
}

module.exports = { MASCOT, COMPACT, PANEL, layoutFor, compactBounds, mascotInCompact };
