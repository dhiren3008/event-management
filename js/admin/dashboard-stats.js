import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getGreeting, formatDate, formatTime, isThisWeek, getTodayISO } from '../core/date.js';
import { formatNumber, formatCurrency, isEventCancelled, summariseBookings } from '../core/utils.js';
import { createEl } from '../core/dom.js';
import { getEvents, getBookings, getUsers } from '../core/api.js';

const ICONS_SVG = {
    location: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    clock: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
};

// ===== Recent Event Updates list =====

function renderUpdates(events) {
    const container = document.getElementById('updates-list');
    if (!container) return;

    if (!events || events.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-muted); font-size: 0.85rem;">No updates found.</p>';
        return;
    }

    // Sort by createdAt or date descending to show latest updates
    const sorted = [...events].sort((a, b) => {
        const dateA = a.createdAt || a.date || '';
        const dateB = b.createdAt || b.date || '';
        return dateB.localeCompare(dateA);
    }).slice(0, 6);

    container.innerHTML = sorted.map((ev, index) => {
        const isActive = index === 0;
        const activeClass = isActive ? ' update-item--active' : '';
        const btnClass = isActive ? 'btn-detail-pill--light' : 'btn-detail-pill--primary';
        const timeString = ev.startTime ? formatTime(ev.startTime) : '10:00 AM';

        return `
            <article class="update-item${activeClass}">
                <div class="update-item__top">
                    <h4 class="update-item__title">${ev.name || 'Untitled Event'}</h4>
                    <a href="/pages/admin/event-details.html?id=${encodeURIComponent(ev.id || '')}" class="btn-detail-pill ${btnClass}">View Details</a>
                </div>
                <div class="update-item__meta">
                    <div class="update-item__meta-row">
                        ${ICONS_SVG.location}
                        <span>${ev.location || 'Online'}</span>
                    </div>
                    <div class="update-item__meta-row">
                        ${ICONS_SVG.calendar}
                        <span>${formatDate(ev.date)}</span>
                        ${ICONS_SVG.clock}
                        <span>${timeString}</span>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

// ===== Hero: Next Upcoming Event =====

function renderHero(events, bookings) {
    const today = getTodayISO();

    // Upcoming events: date >= today, sorted ascending (closest upcoming first)
    const upcoming = events
        .filter((e) => !isEventCancelled(e))
        .filter((e) => (e.date || '') >= today)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // If no upcoming, take the latest non-cancelled event as fallback
    const targetEvent = upcoming[0]
        || [...events]
            .filter((event) => !isEventCancelled(event))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];

    const titleEl = document.getElementById('hero-title');
    const locationEl = document.getElementById('hero-location');
    const dateEl = document.getElementById('hero-date');
    const timeEl = document.getElementById('hero-time');
    const soldEl = document.getElementById('hero-sold');
    const leftEl = document.getElementById('hero-left');
    if (!targetEvent) {
        if (titleEl) titleEl.textContent = 'No events yet';
        if (locationEl) locationEl.textContent = '\u2014';
        if (dateEl) dateEl.textContent = '\u2014';
        if (timeEl) timeEl.textContent = '\u2014';
        if (soldEl) soldEl.textContent = '0';
        if (leftEl) leftEl.textContent = '0';
        return;
    }

    if (titleEl) titleEl.textContent = targetEvent.name || 'No Upcoming Events';
    if (locationEl) locationEl.textContent = targetEvent.location || 'TBD';
    if (dateEl) dateEl.textContent = formatDate(targetEvent.date);
    if (timeEl) {
        const start = formatTime(targetEvent.startTime);
        const end = formatTime(targetEvent.endTime);
        timeEl.textContent = start && end ? `${start} – ${end}` : (start || end || 'All Day');
    }

    // Calculate tickets sold for this event from bookings
    const eventBookings = bookings.filter((b) => Number(b.eventId) === Number(targetEvent.id));
    const ticketsSold = summariseBookings(eventBookings).tickets;
    const capacity = Number(targetEvent.capacity) || 0;
    const ticketsLeft = Math.max(0, capacity - ticketsSold);

    if (soldEl) soldEl.textContent = formatNumber(ticketsSold);
    if (leftEl) leftEl.textContent = formatNumber(ticketsLeft);

    const heroSection = document.querySelector('.hero');
    if (heroSection && targetEvent.id) {
        heroSection.style.cursor = 'pointer';
        heroSection.title = 'View Event Details';
        heroSection.onclick = () => {
            window.location.href = `/pages/admin/event-details.html?id=${encodeURIComponent(targetEvent.id)}`;
        };
    }
}

// ===== Weekly Basis Status =====

function renderWeeklyStats(events, bookings, users) {
    // 1. Bookings created this week — cancelled bookings are excluded from the
    //    ticket and revenue totals.
    const weekBookings = bookings.filter((b) => isThisWeek(b.bookedAt || ''));
    const weekSummary = summariseBookings(weekBookings);
    const ticketsSoldWeek = weekSummary.tickets;
    const revenueWeek = weekSummary.revenue;

    // 2. Events scheduled this week (by event.date), cancelled ones excluded
    const weekEvents = events.filter(
        (e) => !isEventCancelled(e) && isThisWeek(e.date || '')
    );

    // 3. Users registered this week (by user.createdAt)
    const weekUsers = users.filter((u) => isThisWeek(u.createdAt || ''));

    const statTickets = document.getElementById('stat-tickets');
    const statRevenue = document.getElementById('stat-revenue');
    const statEvents = document.getElementById('stat-events');
    const statUsers = document.getElementById('stat-users');

    if (statTickets) statTickets.textContent = formatNumber(ticketsSoldWeek);
    if (statRevenue) statRevenue.textContent = formatCurrency(revenueWeek);
    if (statEvents) statEvents.textContent = formatNumber(weekEvents.length);
    if (statUsers) statUsers.textContent = formatNumber(weekUsers.length);
}

// ===== Load / error state =====

function setDashboardStatus(text, type = '') {
    const notice = document.getElementById('dashboard-notice');
    const message = document.getElementById('dashboard-message');
    const retry = document.getElementById('dashboard-retry');
    if (!notice || !message) {
        return;
    }

    if (!text) {
        notice.classList.add('is-hidden');
        message.textContent = '';
        message.classList.remove('form-message--error', 'form-message--success');
        return;
    }

    notice.classList.remove('is-hidden');
    message.textContent = text;
    message.classList.toggle('form-message--error', type === 'error');
    message.classList.toggle('form-message--success', type === 'success');
    if (retry) {
        retry.classList.toggle('is-hidden', type !== 'error');
    }
}

let cachedEvents = [];

async function loadDashboard() {
    setDashboardStatus('Loading dashboard\u2026');

    try {
        const [events, bookings, users] = await Promise.all([
            getEvents(),
            getBookings(),
            getUsers(),
        ]);

        cachedEvents = events || [];
        renderHero(events, bookings);
        renderWeeklyStats(events, bookings, users);
        renderUpdates(events);
        setDashboardStatus('');
    } catch (error) {
        console.error('Failed to load dashboard data:', error);
        setDashboardStatus(
            'Could not load dashboard data. Check that the server is running and try again.',
            'error'
        );
    }
}

async function init() {
    const user = requireRole('admin');
    if (!user) {
        return;
    }

    const firstName = (user.name || '').split(' ')[0];

    renderLayout({
        user,
        activeKey: 'dashboard',
        title: `${getGreeting()},`,
        titleAccent: firstName,
        subtitle: 'Have a nice day!',
    });

    document.getElementById('dashboard-retry')?.addEventListener('click', loadDashboard);

    // Filter updates on topbar search input
    const searchInput = document.querySelector('.search__input');
    if (searchInput) {
        searchInput.placeholder = 'Search recent events';
        searchInput.setAttribute('aria-label', 'Search recent events');
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            const cleanQuery = query.replace(/^#/, '').trim();
            const filtered = cachedEvents.filter((ev) => {
                const target = `#${ev.id || ''} ${ev.id || ''} ${ev.name || ''} ${ev.location || ''}`.toLowerCase();
                return query === '' || target.includes(query) || (cleanQuery !== '' && target.includes(cleanQuery));
            });
            renderUpdates(filtered);
        });
    }

    await loadDashboard();
}

init();
