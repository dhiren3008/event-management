import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getEventById, getBookingsByEvent, getUsers, updateBooking } from '../core/api.js';
import { formatDate, formatTime, getTodayISO } from '../core/date.js';
import { isBookingCancelled } from '../core/utils.js';
import { showToast } from '../core/dom.js';

// Standard deterministic image pool shared across admin and member panels
const IMAGE_POOL = [
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=80',
    'https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=1200&q=80',
];

function getEventImage(event) {
    if (event && event.image && event.image.trim()) {
        return event.image;
    }
    const index = ((event && event.id) || 0) % IMAGE_POOL.length;
    return IMAGE_POOL[index];
}

function formatEventDateTime(dateStr, timeStr) {
    if (!dateStr) return 'Date TBA';
    try {
        const [year, month, day] = dateStr.split('-').map(Number);
        const d = new Date(year, month - 1, day);
        const dateFormatted = d.toLocaleDateString('en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
        });
        const timeFormatted = timeStr ? formatTime(timeStr) : '10:00 AM';
        return `${dateFormatted} ${timeFormatted}`;
    } catch {
        return formatDate(dateStr);
    }
}

const state = {
    user: null,
    event: null,
    bookings: [],
    usersById: new Map(),
    currentIndex: 0,
};

// Update the Ticket Frame display with current active booking
function displayCurrentTicket() {
    const badgeEl = document.getElementById('ticket-id-badge');
    const eventNameEl = document.getElementById('ticket-event-name');
    const memberNameEl = document.getElementById('ticket-member-name');
    const typeEl = document.getElementById('ticket-type');
    const datetimeEl = document.getElementById('ticket-datetime');
    const locationEl = document.getElementById('ticket-location');
    const imageEl = document.getElementById('ticket-image');
    const verifyBtn = document.getElementById('btn-verify-ticket');
    const navEl = document.getElementById('ticket-nav');
    const navInfoEl = document.getElementById('ticket-nav-info');
    const prevBtn = document.getElementById('ticket-prev-btn');
    const nextBtn = document.getElementById('ticket-next-btn');

    const event = state.event;
    if (event) {
        if (eventNameEl) eventNameEl.textContent = event.name;
        if (locationEl) locationEl.textContent = event.location || 'Trade Centre';
        if (datetimeEl) datetimeEl.textContent = formatEventDateTime(event.date, event.startTime);
        if (imageEl) imageEl.src = getEventImage(event);
    }

    const currentBooking = state.bookings[state.currentIndex];
    if (!currentBooking) {
        if (badgeEl) badgeEl.textContent = 'No Active Bookings';
        if (memberNameEl) memberNameEl.textContent = 'None';
        if (typeEl) typeEl.textContent = '-';
        if (verifyBtn) {
            verifyBtn.textContent = 'No Tickets to Verify';
            verifyBtn.disabled = true;
            verifyBtn.classList.remove('is-verified');
        }
        if (navEl) navEl.classList.add('is-hidden');
        return;
    }

    const attendee = state.usersById.get(Number(currentBooking.userId));

    if (badgeEl) badgeEl.textContent = `Ticket ID: #${currentBooking.id}`;
    if (memberNameEl) memberNameEl.textContent = attendee ? attendee.name : `User #${currentBooking.userId}`;
    if (typeEl) typeEl.textContent = currentBooking.ticketType || 'Single';

    // Verify button state
    if (verifyBtn) {
        verifyBtn.disabled = false;
        if (currentBooking.verified) {
            verifyBtn.textContent = 'Ticket Verified ✓';
            verifyBtn.classList.add('is-verified');
        } else {
            verifyBtn.textContent = 'Verify Ticket';
            verifyBtn.classList.remove('is-verified');
        }
    }

    // Multiple tickets navigation controls
    if (navEl && navInfoEl && prevBtn && nextBtn) {
        if (state.bookings.length > 1) {
            navEl.classList.remove('is-hidden');
            navInfoEl.textContent = `Ticket ${state.currentIndex + 1} of ${state.bookings.length}`;
            prevBtn.disabled = state.currentIndex === 0;
            nextBtn.disabled = state.currentIndex === state.bookings.length - 1;
        } else {
            navEl.classList.add('is-hidden');
        }
    }
}

// Wire verification button click
function setupVerifyAction() {
    const verifyBtn = document.getElementById('btn-verify-ticket');
    if (!verifyBtn) return;

    verifyBtn.addEventListener('click', async () => {
        const currentBooking = state.bookings[state.currentIndex];
        if (!currentBooking) return;

        const newVerified = !currentBooking.verified;
        verifyBtn.disabled = true;

        try {
            await updateBooking(currentBooking.id, {
                verified: newVerified,
                verifiedAt: newVerified ? getTodayISO() : null,
            });

            currentBooking.verified = newVerified;

            if (newVerified) {
                verifyBtn.textContent = 'Ticket Verified ✓';
                verifyBtn.classList.add('is-verified');
                showToast(`Ticket #${currentBooking.id} verified successfully!`, 'success');
            } else {
                verifyBtn.textContent = 'Verify Ticket';
                verifyBtn.classList.remove('is-verified');
                showToast(`Verification for ticket #${currentBooking.id} undone.`, 'success');
            }
        } catch (err) {
            console.error('Error toggling ticket verification:', err);
            showToast('Could not update verification status.', 'error');
        } finally {
            verifyBtn.disabled = false;
        }
    });

    // Navigation buttons for multiple tickets
    const prevBtn = document.getElementById('ticket-prev-btn');
    const nextBtn = document.getElementById('ticket-next-btn');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (state.currentIndex > 0) {
                state.currentIndex -= 1;
                displayCurrentTicket();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (state.currentIndex < state.bookings.length - 1) {
                state.currentIndex += 1;
                displayCurrentTicket();
            }
        });
    }

    // Topbar search input to quickly find a ticket by ID, member name, or mobile
    const searchInput = document.querySelector('.search__input');
    if (searchInput) {
        searchInput.placeholder = 'Search Ticket ID, name or phone...';
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            if (!query) return;

            const cleanQuery = query.replace(/^#/, '').trim();

            const foundIndex = state.bookings.findIndex((b) => {
                const u = state.usersById.get(Number(b.userId));
                const bId = String(b.id || '').toLowerCase();
                const fullTicketId = `#${bId}`;
                const uName = (u?.name || '').toLowerCase();
                const uMobile = (u?.mobile || '').toLowerCase();
                return (
                    fullTicketId.includes(query) ||
                    bId.includes(query) ||
                    (cleanQuery !== '' && bId.includes(cleanQuery)) ||
                    uName.includes(query) ||
                    (cleanQuery !== '' && uName.includes(cleanQuery)) ||
                    uMobile.includes(query)
                );
            });

            if (foundIndex !== -1 && foundIndex !== state.currentIndex) {
                state.currentIndex = foundIndex;
                displayCurrentTicket();
            }
        });
    }
}

async function init() {
    // 1. Guard route: must be logged in as verifier
    const user = requireRole('verifier');
    if (!user) return;
    state.user = user;

    // 2. Render sidebar and topbar shell
    renderLayout({
        user,
        activeKey: 'events',
        title: '',
        subtitle: '',
    });

    const urlParams = new URLSearchParams(window.location.search);
    const eventId = urlParams.get('eventId');
    const targetBookingId = urlParams.get('bookingId');

    setupVerifyAction();

    if (eventId) {
        try {
            const [event, allBookings, users] = await Promise.all([
                getEventById(eventId),
                getBookingsByEvent(eventId),
                getUsers(),
            ]);

            state.event = event;
            state.usersById = new Map(users.map((u) => [Number(u.id), u]));

            // Filter out cancelled bookings
            state.bookings = allBookings.filter((b) => !isBookingCancelled(b));

            // If a specific bookingId was requested, jump to it
            if (targetBookingId) {
                const targetIdx = state.bookings.findIndex((b) => Number(b.id) === Number(targetBookingId));
                if (targetIdx !== -1) {
                    state.currentIndex = targetIdx;
                }
            }

            displayCurrentTicket();
        } catch (err) {
            console.error('Error fetching ticket details:', err);
            showToast('Could not load ticket details.', 'error');
        }
    } else {
        // Fallback demo values if accessed directly
        displayCurrentTicket();
    }
}

init();
