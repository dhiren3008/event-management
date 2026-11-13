const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^\d{10,12}$/;
export const PASSWORD_MIN_LENGTH = 6;

export function normalizeEmail(value) {
    return value.trim().toLowerCase();
}

export function isEmpty(value) {
    return value === undefined || value === null || String(value).trim() === '';
}

export function isValidEmail(value) {
    return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}

export function isValidMobile(value) {
    return typeof value === 'string' && MOBILE_PATTERN.test(value.trim());
}

// Passwords are length-checked as typed: spaces count, so no trim here
// (the "is it filled in at all" check stays with isEmpty).
export function isValidPassword(value) {
    return typeof value === 'string' && value.length >= PASSWORD_MIN_LENGTH;
}

export function formatNumber(value) {
    return Number(value).toLocaleString('en-IN');
}

export function formatCurrency(value) {
    return `\u20B9${formatNumber(value)}`;
}

// ===== Cancellation state =====
// Events and bookings can be cancelled. The field is optional: every record
// written before cancelling existed has no status, and those must keep working
// as active/confirmed. Only the explicit value 'cancelled' counts.

export function isEventCancelled(event) {
    return Boolean(event) && event.status === 'cancelled';
}

export function isBookingCancelled(booking) {
    return Boolean(booking) && booking.status === 'cancelled';
}

// Single source of truth for the totals the dashboard and the event details
// page display. Cancelled bookings stay in the database as history but never
// count towards tickets sold or revenue — otherwise each page would drift as
// soon as one of them forgot the filter.
export function summariseBookings(bookings) {
    return (bookings || []).reduce((summary, booking) => {
        if (isBookingCancelled(booking)) {
            return summary;
        }
        summary.count += 1;
        summary.tickets += Number(booking.quantity || 0);
        summary.revenue += Number(booking.amount || 0);
        return summary;
    }, { count: 0, tickets: 0, revenue: 0 });
}