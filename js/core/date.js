const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Local date to 'YYYY-MM-DD'. Never use toISOString() here, it returns the UTC date.
function toISO(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getTodayISO() {
    return toISO(new Date());
}

// '2026-10-23' -> '23 Oct 2026'. Anything that is not an ISO date is
// returned untouched instead of rendering as 'NaN undefined NaN'.
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

export function formatDate(isoDate) {
    if (typeof isoDate !== 'string' || !ISO_DATE_PATTERN.test(isoDate)) {
        return isoDate || '';
    }
    const [year, month, day] = isoDate.split('-').map(Number);
    return `${day} ${MONTHS[month - 1]} ${year}`;
}

// '13:05' -> '1:05 PM'
export function formatTime(time24) {
    if (typeof time24 !== 'string' || !TIME_PATTERN.test(time24)) {
        return time24 || '';
    }
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${period}`;
}

// Returns 'today', 'upcoming' or 'past'
export function getEventStatus(isoDate, endDate) {
    const today = getTodayISO();

    if (!isoDate) {
        return 'past';
    }

    if (isoDate > today) {
        return 'upcoming';
    }

    const end = endDate || isoDate;

    if (isoDate <= today && end >= today) {
        return 'today';
    }

    return 'past';
}

export function isThisMonth(isoDate) {
    return isoDate.slice(0, 7) === getTodayISO().slice(0, 7);
}

// Monday to Sunday of the current week, as ISO strings
export function getWeekRange() {
    const now = new Date();
    const offsetFromMonday = (now.getDay() + 6) % 7;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetFromMonday);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    return { start: toISO(start), end: toISO(end) };
}

export function isThisWeek(isoDate) {
    const { start, end } = getWeekRange();
    return isoDate >= start && isoDate <= end;
}

export function getGreeting() {
    const hour = new Date().getHours();

    if (hour < 12) {
        return 'Good Morning';
    }
    if (hour < 17) {
        return 'Good Afternoon';
    }
    return 'Good Evening';
}
