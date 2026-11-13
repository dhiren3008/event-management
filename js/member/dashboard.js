import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getEvents, getBookingsByUser } from '../core/api.js';
import { formatDate, formatTime, getGreeting, getTodayISO, isThisWeek } from '../core/date.js';
import { isEventCancelled, isBookingCancelled } from '../core/utils.js';

// SVG Icons helpers for meta rows
const ICONS_SVG = {
    location: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
    calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    clock: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
};

const DEFAULT_EVENT_IMAGE = 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=500&q=80';

// Fallback images pool for events without a custom image
const IMAGE_POOL = [
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=500&q=80',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=500&q=80',
];

function getEventImage(event) {
    if (event.image && event.image.trim()) {
        return event.image;
    }
    const index = (event.id || 0) % IMAGE_POOL.length;
    return IMAGE_POOL[index] || DEFAULT_EVENT_IMAGE;
}

// 1. Render Hero Card with the nearest upcoming event
function renderHero(nextEvent) {
    const titleEl = document.getElementById('hero-title');
    const metaEl = document.getElementById('hero-meta');
    const btnEl = document.getElementById('hero-btn');

    if (!nextEvent) {
        titleEl.textContent = 'No Upcoming Events';
        metaEl.innerHTML = '<p style="opacity: 0.85;">Check back soon for new events!</p>';
        btnEl.style.display = 'none';
        return;
    }

    titleEl.textContent = nextEvent.name;
    const timeString = nextEvent.startTime
        ? (nextEvent.endTime ? `${formatTime(nextEvent.startTime)} – ${formatTime(nextEvent.endTime)}` : formatTime(nextEvent.startTime))
        : 'Time TBA';

    metaEl.innerHTML = `
        <div class="member-hero__meta-item member-hero__meta-item--full">
            <span class="meta-icon">${ICONS_SVG.location}</span>
            <span>${nextEvent.location || 'Location TBA'}</span>
        </div>
        <div class="member-hero__meta-item">
            <span class="meta-icon">${ICONS_SVG.calendar}</span>
            <span>${formatDate(nextEvent.date)}</span>
        </div>
        <div class="member-hero__meta-item">
            <span class="meta-icon">${ICONS_SVG.clock}</span>
            <span>${timeString}</span>
        </div>
    `;

    btnEl.href = `/pages/member/event-details.html?id=${nextEvent.id}`;
    btnEl.textContent = 'Book Now';
    btnEl.style.display = 'inline-flex';
}

// 2. Render Weekly Stats (Attended & Scheduled), excluding cancelled records
function renderWeeklyStats(events, userBookings) {
    const today = getTodayISO();
    const eventMap = new Map(events.map((e) => [e.id, e]));

    let attended = 0;
    let scheduled = 0;

    userBookings.forEach((b) => {
        if (isBookingCancelled(b)) return;

        const ev = eventMap.get(b.eventId);
        if (!ev || !ev.date || isEventCancelled(ev)) return;

        if (isThisWeek(ev.date)) {
            if (b.verified || ev.date < today) {
                attended += 1;
            } else {
                scheduled += 1;
            }
        }
    });

    const attendedEl = document.getElementById('weekly-attended-count');
    const scheduledEl = document.getElementById('weekly-scheduled-count');
    if (attendedEl) attendedEl.textContent = String(attended);
    if (scheduledEl) scheduledEl.textContent = String(scheduled);
}

// 3. Render Recommended Events
function renderRecommended(events) {
    const container = document.getElementById('recommended-list');
    if (!container) return;

    if (events.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-muted); font-size: 0.9rem;">No recommended events at the moment.</p>';
        return;
    }

    container.innerHTML = events.map((ev) => {
        const timeString = ev.startTime ? formatTime(ev.startTime) : '10:00 AM';
        const img = getEventImage(ev);
        const desc = ev.description || 'Join this exciting session with industry experts!';

        return `
            <article class="recommended-card">
                <div class="recommended-card__image-wrap">
                    <img src="${img}" alt="${ev.name}" class="recommended-card__image">
                </div>
                <div class="recommended-card__body">
                    <h4 class="recommended-card__title">${ev.name}</h4>
                    <p class="recommended-card__desc">${desc}</p>
                    <div class="recommended-card__meta">
                        <span class="meta-item">
                            ${ICONS_SVG.location}
                            <span>${ev.location || 'Online'}</span>
                        </span>
                        <span class="meta-item">
                            ${ICONS_SVG.calendar}
                            <span>${formatDate(ev.date)}</span>
                        </span>
                        <span class="meta-item">
                            ${ICONS_SVG.clock}
                            <span>${timeString}</span>
                        </span>
                    </div>
                </div>
                <a href="/pages/member/event-details.html?id=${ev.id}" class="btn-book-pill">Book Now</a>
            </article>
        `;
    }).join('');
}

// 4. Render Recent Event Updates (Right Column)
function renderUpdates(events) {
    const container = document.getElementById('updates-list');
    if (!container) return;

    if (events.length === 0) {
        container.innerHTML = '<p style="color: var(--color-text-muted); font-size: 0.85rem;">No updates found.</p>';
        return;
    }

    container.innerHTML = events.map((ev, index) => {
        const isActive = index === 0;
        const activeClass = isActive ? ' update-item--active' : '';
        const btnClass = isActive ? 'btn-detail-pill--light' : 'btn-detail-pill--primary';
        const timeString = ev.startTime ? formatTime(ev.startTime) : '10:00 AM';

        return `
            <article class="update-item${activeClass}">
                <div class="update-item__top">
                    <h4 class="update-item__title">${ev.name}</h4>
                    <a href="/pages/member/event-details.html?id=${ev.id}" class="btn-detail-pill ${btnClass}">View Details</a>
                </div>
                <div class="update-item__meta">
                    <div class="update-item__meta-row">
                        ${ICONS_SVG.location}
                        <span>${ev.location || 'Trade Centre'}</span>
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

// ===== Initializer =====
async function init() {
    const user = requireRole('member');
    if (!user) {
        return;
    }

    const firstName = (user.name || 'Member').split(' ')[0];
    const greeting = getGreeting();

    renderLayout({
        user,
        activeKey: 'dashboard',
        title: `${greeting},`,
        titleAccent: firstName,
        subtitle: 'Have a nice day!',
    });

    try {
        const [allEvents, userBookings] = await Promise.all([
            getEvents(),
            getBookingsByUser(user.id)
        ]);

        const today = getTodayISO();

        // Filter out cancelled events
        const activeEvents = allEvents.filter((ev) => !isEventCancelled(ev));

        // Sort events chronologically
        const sortedEvents = [...activeEvents].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        // Upcoming events from today onwards
        const upcomingEvents = sortedEvents.filter((e) => (e.date || '') >= today);
        const nextEvent = upcomingEvents[0] || null;

        // 1. Hero Card (only active upcoming event)
        renderHero(nextEvent);

        // 2. Weekly Stats (excluding cancelled)
        renderWeeklyStats(allEvents, userBookings);

        // 3. Recommended Events (Top 3 upcoming active events)
        const recommendedEvents = upcomingEvents.slice(0, 3);
        renderRecommended(recommendedEvents);

        // 4. Recent Updates (Latest 6 active events sorted descending)
        const recentEvents = [...activeEvents]
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            .slice(0, 6);
        renderUpdates(recentEvents);

        // 5. Connect Topbar Search
        const searchInput = document.querySelector('.search__input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim().toLowerCase();
                const cleanQuery = query.replace(/^#/, '').trim();
                const matches = (ev) => {
                    if (!query) return true;
                    const target = `#${ev.id || ''} ${ev.id || ''} ${ev.name || ''} ${ev.location || ''} ${ev.description || ''}`.toLowerCase();
                    return target.includes(query) || (cleanQuery !== '' && target.includes(cleanQuery));
                };

                const filteredRecommended = recommendedEvents.filter(matches);
                const filteredUpdates = recentEvents.filter(matches);
                renderRecommended(filteredRecommended);
                renderUpdates(filteredUpdates);
            });
        }

    } catch (error) {
        console.error('Failed to load member dashboard data:', error);
    }
}

init();
