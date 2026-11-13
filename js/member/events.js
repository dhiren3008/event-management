import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getEvents } from '../core/api.js';
import { isEventCancelled, formatCurrency } from '../core/utils.js';
import { formatDate, formatTime, getTodayISO } from '../core/date.js';

// Fallback pool of high quality images when an event has no custom image
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
        const timeFormatted = timeStr ? formatTime(timeStr) : '';
        return timeFormatted ? `${dateFormatted} - ${timeFormatted}` : dateFormatted;
    } catch {
        return formatDate(dateStr);
    }
}

function createEventCard(event, isHighlighted = false) {
    const activeClass = isHighlighted ? ' event-card--active' : '';
    const imgUrl = getEventImage(event);
    const dateTime = formatEventDateTime(event.date, event.startTime);
    const description = event.description || 'Join this exciting event with industry leaders!';
    const priceText = event.price ? `${event.price}/-` : 'Free';

    return `
        <article class="event-card${activeClass}">
            <div class="event-card__image-wrap">
                <img src="${imgUrl}" alt="${event.name}" class="event-card__image" loading="lazy">
            </div>
            <div class="event-card__body">
                <h3 class="event-card__title">${event.name}</h3>
                <p class="event-card__date">${dateTime}</p>
                <p class="event-card__desc">${description}</p>
                <div class="event-card__footer">
                    <span class="event-card__price">${priceText}</span>
                    <a href="/pages/member/event-details.html?id=${event.id}" class="btn-book">Book a ticket</a>
                </div>
            </div>
        </article>
    `;
}

function renderGrid(containerEl, events, emptyMessage) {
    if (!containerEl) return;
    if (events.length === 0) {
        containerEl.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 2rem 0; text-align: center; color: var(--color-text-muted);">
                <p>${emptyMessage}</p>
            </div>
        `;
        return;
    }
    containerEl.innerHTML = events.map((ev, idx) => createEventCard(ev, idx === 0)).join('');
}

async function init() {
    const user = requireRole('member');
    if (!user) return;

    renderLayout({
        user,
        activeKey: 'events',
        title: '',
        subtitle: '',
    });

    const upcomingGrid = document.getElementById('upcoming-events-grid');
    const recommendedGrid = document.getElementById('recommended-events-grid');

    try {
        const allEvents = await getEvents();
        const today = getTodayISO();

        // 1. Filter out cancelled events and sort chronologically
        const activeEvents = allEvents
            .filter((ev) => !isEventCancelled(ev))
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        // 2. Upcoming events: dates from today onwards
        let upcomingEvents = activeEvents.filter((ev) => (ev.date || '') >= today);
        if (upcomingEvents.length === 0 && activeEvents.length > 0) {
            upcomingEvents = activeEvents;
        }

        // 3. Recommended events pool
        let recommendedEvents = activeEvents.slice(2, 6);
        if (recommendedEvents.length === 0) {
            recommendedEvents = activeEvents;
        }

        // Initial render
        renderGrid(upcomingGrid, upcomingEvents, 'No upcoming events scheduled right now.');
        renderGrid(recommendedGrid, recommendedEvents, 'No recommendations available.');

        // 4. Live Search Filtering via topbar search input
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

                const filteredUpcoming = upcomingEvents.filter(matches);
                const filteredRecommended = recommendedEvents.filter(matches);

                renderGrid(upcomingGrid, filteredUpcoming, 'No upcoming events match your search.');
                renderGrid(recommendedGrid, filteredRecommended, 'No recommended events match your search.');
            });
        }

    } catch (err) {
        console.error('Failed to load events:', err);
        if (upcomingGrid) {
            upcomingGrid.innerHTML = `<p style="color: var(--color-error); grid-column: 1 / -1;">Failed to load events. Please refresh.</p>`;
        }
    }
}

init();
