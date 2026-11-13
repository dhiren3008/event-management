import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getEventById, getBookingsByEvent, getBookingsByUser } from '../core/api.js';
import { summariseBookings, isEventCancelled, isBookingCancelled } from '../core/utils.js';
import { formatDate, formatTime, getTodayISO } from '../core/date.js';

const IMAGE_POOL = [
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
];

function getEventBanner(event) {
    if (event.image && event.image.trim()) {
        return event.image;
    }
    const index = (event.id || 0) % IMAGE_POOL.length;
    return IMAGE_POOL[index];
}

function formatEventDateTime(event) {
    if (!event.date) return 'Date TBA';
    const dateFormatted = formatDate(event.date);
    let timeFormatted = '';
    if (event.startTime && event.endTime) {
        timeFormatted = `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`;
    } else if (event.startTime) {
        timeFormatted = formatTime(event.startTime);
    }
    return timeFormatted ? `${dateFormatted} (${timeFormatted})` : dateFormatted;
}

async function init() {
    const user = requireRole('member');
    if (!user) return;

    // 1. Render layout shell
    renderLayout({
        user,
        activeKey: 'events',
        title: '',
        subtitle: '',
    });

    // 2. Read "?id=..." parameter from the URL
    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('id');
    const cardEl = document.getElementById('event-card');

    if (!eventId) {
        cardEl.innerHTML = `
            <div style="padding: 2.5rem; text-align: center;">
                <h2>No event specified</h2>
                <p style="color: var(--color-text-muted); margin: 1rem 0;">Please select an event from the events catalog.</p>
                <a href="/pages/member/events.html" class="btn btn--primary" style="display: inline-block;">Back to Events</a>
            </div>
        `;
        return;
    }

    try {
        // 3. Fetch event, its bookings, and current user's bookings in parallel
        const [event, bookings, userBookings] = await Promise.all([
            getEventById(eventId),
            getBookingsByEvent(eventId),
            getBookingsByUser(user.id),
        ]);

        if (!event) {
            cardEl.innerHTML = `
                <div style="padding: 2.5rem; text-align: center;">
                    <h2>Event not found</h2>
                    <p style="color: var(--color-text-muted); margin: 1rem 0;">This event does not exist or may have been removed.</p>
                    <a href="/pages/member/events.html" class="btn btn--primary" style="display: inline-block;">Back to Events</a>
                </div>
            `;
            return;
        }

        const today = getTodayISO();

        // 4. Calculate live seats remaining
        const totalCapacity = Number(event.capacity || 0);
        const bookingSummary = summariseBookings(bookings);
        const bookedTickets = bookingSummary.tickets;
        const seatsLeft = Math.max(0, totalCapacity - bookedTickets);
        const isCancelled = isEventCancelled(event);
        const isSoldOut = seatsLeft <= 0;

        // Check if member already booked this event
        const alreadyBooked = userBookings.some(
            (b) => Number(b.eventId) === Number(event.id) && !isBookingCancelled(b)
        );

        // 5. Populate HTML elements with real event info
        const imgEl = document.getElementById('event-image');
        imgEl.src = getEventBanner(event);
        imgEl.alt = event.name;

        document.getElementById('event-name').textContent = event.name;
        document.getElementById('event-tagline').textContent = event.location 
            ? `Venue: ${event.location}` 
            : 'Venue TBA';

        document.getElementById('event-price').textContent = event.price ? `₹${event.price}` : 'Free';
        document.getElementById('event-description').textContent = event.description || 'No description provided.';
        document.getElementById('event-datetime').textContent = formatEventDateTime(event);
        document.getElementById('event-seats-left').textContent = `${seatsLeft} Seats are Left`;

        // 6. Configure "Book Now" button based on cancellation, booking window, and duplicate status
        const bookBtn = document.getElementById('btn-book-now');

        if (isCancelled) {
            bookBtn.textContent = 'Event Cancelled';
            bookBtn.style.pointerEvents = 'none';
            bookBtn.style.opacity = '0.5';
            bookBtn.removeAttribute('href');
        } else if (alreadyBooked) {
            bookBtn.textContent = 'Already Booked';
            bookBtn.href = '/pages/member/tickets.html';
            bookBtn.style.background = 'var(--color-primary-dark, #57209e)';
            bookBtn.style.opacity = '1';
        } else if (event.date && today > event.date) {
            bookBtn.textContent = 'Event Ended';
            bookBtn.style.pointerEvents = 'none';
            bookBtn.style.opacity = '0.5';
            bookBtn.removeAttribute('href');
        } else if (event.bookingStart && today < event.bookingStart) {
            bookBtn.textContent = `Opens on ${formatDate(event.bookingStart)}`;
            bookBtn.style.pointerEvents = 'none';
            bookBtn.style.opacity = '0.6';
            bookBtn.removeAttribute('href');
        } else if (event.bookingEnd && today > event.bookingEnd) {
            bookBtn.textContent = 'Bookings Closed';
            bookBtn.style.pointerEvents = 'none';
            bookBtn.style.opacity = '0.6';
            bookBtn.removeAttribute('href');
        } else if (isSoldOut) {
            bookBtn.textContent = 'Sold Out';
            bookBtn.style.pointerEvents = 'none';
            bookBtn.style.opacity = '0.5';
            bookBtn.removeAttribute('href');
        } else {
            bookBtn.textContent = 'Book Now';
            bookBtn.href = `/pages/member/ticket-details.html?id=${event.id}`;
            bookBtn.style.pointerEvents = '';
            bookBtn.style.opacity = '';
        }

    } catch (err) {
        console.error('Failed to load event details:', err);
        cardEl.innerHTML = `<p style="color: var(--color-error); padding: 2rem; text-align: center;">Error loading event. Please refresh or try again.</p>`;
    }
}

init();
