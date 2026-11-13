import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getEvents, getAssignments } from '../core/api.js';
import { formatDate, formatTime, getTodayISO } from '../core/date.js';
import { isEventCancelled } from '../core/utils.js';

// Standard deterministic image pool shared across admin and member panels
const IMAGE_POOL = [
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
];

function getEventImage(event) {
    if (event.image && event.image.trim()) {
        return event.image;
    }
    const index = (event.id || 0) % IMAGE_POOL.length;
    return IMAGE_POOL[index];
}

function formatEventDateTime(dateStr, timeStr) {
    if (!dateStr) return 'Date TBA';
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        const dateFormatted = d.toLocaleDateString('en-US', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
        const timeFormatted = timeStr ? formatTime(timeStr).toLowerCase() : '';
        return timeFormatted ? `${dateFormatted} - ${timeFormatted}` : dateFormatted;
    } catch {
        return formatDate(dateStr);
    }
}

const state = {
    user: null,
    assignedEvents: [],
    searchQuery: '',
};

// 1. Populate the Hero Card (Primary / nearest upcoming assigned event)
function populateHero(event) {
    const heroCard = document.getElementById('hero-card');
    const heroTitle = document.getElementById('hero-title');
    const heroVenue = document.getElementById('hero-venue');
    const heroDate = document.getElementById('hero-date');
    const heroTime = document.getElementById('hero-time');
    const heroScanBtn = document.getElementById('hero-scan-btn');

    if (!event) {
        if (heroTitle) heroTitle.textContent = 'No Upcoming Events Assigned';
        if (heroVenue) heroVenue.textContent = 'Venue TBA';
        if (heroDate) heroDate.textContent = 'Date TBA';
        if (heroTime) heroTime.textContent = 'Time TBA';
        if (heroScanBtn) {
            heroScanBtn.disabled = true;
            heroScanBtn.style.opacity = '0.5';
            heroScanBtn.style.cursor = 'not-allowed';
        }
        return;
    }

    if (heroTitle) heroTitle.textContent = event.name;
    if (heroVenue) heroVenue.textContent = event.location || 'Trade Centre';
    if (heroDate) heroDate.textContent = formatDate(event.date);

    if (heroTime) {
        if (event.startTime && event.endTime) {
            heroTime.textContent = `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`;
        } else if (event.startTime) {
            heroTime.textContent = formatTime(event.startTime);
        } else {
            heroTime.textContent = '10:00 AM – 12:00 PM';
        }
    }

    if (heroCard) {
        const bgImg = getEventImage(event);
        heroCard.style.background = `linear-gradient(90deg, rgba(20, 16, 32, 0.92) 0%, rgba(20, 16, 32, 0.75) 50%, rgba(20, 16, 32, 0.3) 100%), url('${bgImg}') right center/cover no-repeat`;
    }

    if (heroScanBtn) {
        heroScanBtn.dataset.eventId = String(event.id);
        heroScanBtn.disabled = false;
        heroScanBtn.style.opacity = '1';
        heroScanBtn.style.cursor = 'pointer';
    }
}

// 2. Populate Upcoming Events Grid
function populateGrid(events, query = '') {
    const gridEl = document.getElementById('upcoming-events-grid');
    if (!gridEl) return;

    if (!events || events.length === 0) {
        if (query) {
            gridEl.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 2.5rem; text-align: center; color: var(--color-text-muted);">
                    <p style="margin: 0; font-size: 0.95rem; font-weight: 500;">No events match "${query}".</p>
                    <p style="margin: 0.35rem 0 0; font-size: 0.8rem;">Try searching with a different event name or location.</p>
                </div>
            `;
        } else {
            gridEl.innerHTML = `
                <div style="grid-column: 1 / -1; padding: 2.5rem; text-align: center; color: var(--color-text-muted);">
                    <p style="margin: 0; font-size: 0.95rem; font-weight: 500;">No upcoming events have been assigned to you yet.</p>
                    <p style="margin: 0.35rem 0 0; font-size: 0.8rem;">Ask an administrator to assign you to an event from Event Management.</p>
                </div>
            `;
        }
        return;
    }

    gridEl.innerHTML = events.map((event) => {
        const dateTimeStr = formatEventDateTime(event.date, event.startTime);
        const descStr = event.description || 'Lorem ipsum dolor sit amet consectetur. Nibh dictum in dui adipiscing nisi ut mattis. Et velit vitae dolor morbi sit tellus platea.';
        const imgUrl = getEventImage(event);

        return `
            <article class="verifier-card" data-event-id="${event.id}">
                <div class="verifier-card__image-wrap">
                    <img class="verifier-card__image" src="${imgUrl}" alt="${event.name}">
                </div>
                <div class="verifier-card__content">
                    <h3 class="verifier-card__title">${event.name}</h3>
                    <p class="verifier-card__datetime">${dateTimeStr}</p>
                    <p class="verifier-card__desc">${descStr}</p>
                    <div class="verifier-card__action">
                        <button type="button" class="btn-scan btn-scan--card" data-event-id="${event.id}">Verify Now</button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

// 3. Navigation handler: click on any "Verify Now" button redirects to ticket-details.html
function setupNavigation() {
    document.addEventListener('click', (e) => {
        const scanBtn = e.target.closest('[data-event-id]');
        if (scanBtn && (scanBtn.classList.contains('btn-scan') || scanBtn.id === 'hero-scan-btn')) {
            const eventId = scanBtn.dataset.eventId;
            if (eventId) {
                window.location.href = `/pages/verifier/ticket-details.html?eventId=${encodeURIComponent(eventId)}`;
            }
        }
    });
}

// 4. Topbar search: filters assigned events in real-time
function setupSearch() {
    const searchInput = document.querySelector('.search__input');
    if (!searchInput) return;

    searchInput.placeholder = 'Search assigned events by name or location...';

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim().toLowerCase();
        state.searchQuery = query;

        if (!query) {
            populateGrid(state.assignedEvents);
            return;
        }

        const cleanQuery = query.replace(/^#/, '').trim();
        const filtered = state.assignedEvents.filter((event) => {
            const target = `#${event.id || ''} ${event.id || ''} ${event.name || ''} ${event.location || ''}`.toLowerCase();
            return target.includes(query) || (cleanQuery !== '' && target.includes(cleanQuery));
        });

        populateGrid(filtered, query);
    });
}

// 5. Main Init
async function init() {
    const user = requireRole('verifier');
    if (!user) {
        return;
    }
    state.user = user;

    renderLayout({
        user,
        activeKey: 'events',
        title: '',
        subtitle: '',
    });

    setupNavigation();
    setupSearch();

    try {
        const [events, assignments] = await Promise.all([
            getEvents(),
            getAssignments(),
        ]);

        const today = getTodayISO();

        // Filter: only events assigned to this verifier where assignment status is active
        const assignedIds = new Set(
            assignments
                .filter((a) => Number(a.userId) === Number(user.id) && a.status !== false)
                .map((a) => Number(a.eventId))
        );

        // Filter: active, non-cancelled, date >= today, sorted chronologically
        state.assignedEvents = events
            .filter((event) => assignedIds.has(Number(event.id)))
            .filter((event) => !isEventCancelled(event))
            .filter((event) => event.date >= today)
            .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));

        // Populate Hero Card with nearest upcoming assigned event
        const primaryEvent = state.assignedEvents.length > 0 ? state.assignedEvents[0] : null;
        populateHero(primaryEvent);

        // Populate Upcoming Events Grid
        populateGrid(state.assignedEvents);

    } catch (error) {
        console.error('Error loading verifier assigned events:', error);
        const gridEl = document.getElementById('upcoming-events-grid');
        if (gridEl) {
            gridEl.innerHTML = `<p style="grid-column: 1 / -1; color: var(--color-error); text-align: center;">Could not load assigned events. Please try again.</p>`;
        }
    }
}

init();
