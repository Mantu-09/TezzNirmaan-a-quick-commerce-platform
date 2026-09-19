import { format, formatDistanceToNow, parseISO, addMinutes, addHours } from 'date-fns';

/**
 * Format an ISO timestamp as a readable order time
 * e.g. "1 Jul, 4:30 PM"
 */
export function formatOrderTime(isoString) {
  if (!isoString) return '';
  return format(parseISO(isoString), 'd MMM, h:mm a');
}

/**
 * Format as "2 hours ago", "just now", etc.
 */
export function timeAgo(isoString) {
  if (!isoString) return '';
  return formatDistanceToNow(parseISO(isoString), { addSuffix: true });
}

/**
 * Format a delivery slot pair
 * e.g. { start: '...T09:00', end: '...T12:00' } → "9:00 AM – 12:00 PM"
 */
export function formatSlot(slotStart, slotEnd) {
  if (!slotStart) return '';
  const s = format(parseISO(slotStart), 'h:mm a');
  const e = slotEnd ? format(parseISO(slotEnd), 'h:mm a') : '';
  return e ? `${s} – ${e}` : s;
}

/**
 * Format estimated delivery time for quick tier
 * e.g. "By 5:45 PM"
 */
export function formatQuickEta(placedAtIso, minutesFromNow = 90) {
  const base = placedAtIso ? parseISO(placedAtIso) : new Date();
  return `By ${format(addMinutes(base, minutesFromNow), 'h:mm a')}`;
}

/**
 * Generate tomorrow's delivery slot options (8 AM–8 PM in 3h windows)
 */
export function getTomorrowSlots() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);

  const slots = [];
  let cursor = new Date(tomorrow);
  while (cursor.getHours() < 20) {
    const start = new Date(cursor);
    const end   = addHours(cursor, 3);
    slots.push({
      id:    start.toISOString(),
      label: `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`,
      start: start.toISOString(),
      end:   end.toISOString(),
    });
    cursor = end;
  }
  return slots;
}

/**
 * Format a full date for order history
 * e.g. "Tuesday, 1 Jul 2025"
 */
export function formatFullDate(isoString) {
  if (!isoString) return '';
  return format(parseISO(isoString), 'EEEE, d MMM yyyy');
}
