import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getBookingsByUser, getEvents, updateBooking } from '../core/api.js';
import { isEventCancelled, isBookingCancelled } from '../core/utils.js';
import { formatDate, getTodayISO } from '../core/date.js';
import { openOverlay, closeOverlay, bindOverlayClose, showToast } from '../core/dom.js';

// Format ISO date (e.g. "2026-10-24") to DD/MM/YY (e.g. "24/10/26")
function formatShortDate(isoDate) {
    if (!isoDate || typeof isoDate !== 'string') return '-';
    const parts = isoDate.split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        return `${day}/${month}/${year.slice(-2)}`;
    }
    return formatDate(isoDate);
}

// Generate the HTML string for an individual ticket row (including action cell)
function createTicketRow(booking, event, today) {
    let statusText = 'Confirm';
    let statusClass = 'status-pill--confirm';

    const eventCancelled = isEventCancelled(event);
    const bookingCancelled = isBookingCancelled(booking);

    if (eventCancelled) {
        statusText = 'Event Cancelled';
        statusClass = 'status-pill--cancel';
    } else if (bookingCancelled) {
        statusText = 'Cancelled';
        statusClass = 'status-pill--cancel';
    }

    const eventName = event ? event.name : 'Unknown Event';
    const eventDate = event && event.date ? formatShortDate(event.date) : formatShortDate(booking.bookedAt);
    const ticketType = booking.ticketType || (booking.quantity > 1 ? 'Double' : 'Single');
    const amount = booking.amount ? `${booking.amount}/-` : '0/-';

    // Cancellation Action Logic (24-hour cutoff rule)
    let actionHtml = '';
    if (eventCancelled || bookingCancelled) {
        actionHtml = '<span style="color: var(--color-text-muted); font-size: 0.8rem;">-</span>';
    } else if (event && event.date && event.date < today) {
        actionHtml = '<span style="color: var(--color-text-muted); font-size: 0.78rem;">Completed</span>';
    } else if (event && event.date && event.date === today) {
        actionHtml = '<span style="color: var(--color-text-muted); font-size: 0.75rem;" title="Cancellations close 24 hours prior to event">Cutoff passed</span>';
    } else {
        actionHtml = `
            <button type="button" class="btn-cancel-ticket" data-action="cancel-ticket" data-booking-id="${booking.id}">
                Cancel
            </button>
        `;
    }

    return `
        <tr class="ticket-row">
            <td class="ticket-id">#${booking.id}</td>
            <td class="event-name">${eventName}</td>
            <td>
                <span class="status-pill ${statusClass}">${statusText}</span>
            </td>
            <td class="ticket-date">${eventDate}</td>
            <td class="ticket-type">${ticketType}</td>
            <td class="ticket-amount">${amount}</td>
            <td>${actionHtml}</td>
        </tr>
    `;
}

// Render the list of tickets or show an empty state
function renderTickets(tbodyEl, bookings, eventMap, isSearching = false) {
    if (!tbodyEl) return;
    const today = getTodayISO();

    if (bookings.length === 0) {
        if (isSearching) {
            tbodyEl.innerHTML = `
                <tr class="ticket-row">
                    <td colspan="7" class="tickets-empty" style="text-align: center; padding: 3rem 1rem;">
                        <p style="margin-bottom: 0.5rem; color: var(--color-text-muted);">No tickets match your search.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbodyEl.innerHTML = `
            <tr class="ticket-row">
                <td colspan="7" class="tickets-empty" style="text-align: center; padding: 3rem 1rem;">
                    <p style="margin-bottom: 1rem; color: var(--color-text-muted);">You have not booked any tickets yet.</p>
                    <a href="/pages/member/events.html" class="btn-book" style="display: inline-block; text-decoration: none;">Browse Events</a>
                </td>
            </tr>
        `;
        return;
    }

    tbodyEl.innerHTML = bookings.map((booking) => {
        const event = eventMap.get(booking.eventId);
        return createTicketRow(booking, event, today);
    }).join('');
}

// Filter bookings based on live search query (matching event name, event ID, ticket ID, ticket type, and status)
export function filterTickets(bookings, eventMap, query) {
    const rawQuery = (query || '').trim().toLowerCase();
    if (!rawQuery) return bookings;

    const cleanQuery = rawQuery.replace(/^#/, '');

    return bookings.filter((b) => {
        const event = eventMap.get(b.eventId);
        const eventName = (event?.name || '').toLowerCase();
        const eventId = String(b.eventId || '');
        const ticketId = String(b.id || '');
        const ticketType = (b.ticketType || (b.quantity > 1 ? 'double' : 'single')).toLowerCase();

        const eventCancelled = isEventCancelled(event);
        const bookingCancelled = isBookingCancelled(b);
        const statusText = eventCancelled
            ? 'event cancelled'
            : bookingCancelled
            ? 'cancelled'
            : 'confirm confirmed';

        const matchesTicketId = ticketId.includes(cleanQuery) || `#${ticketId}`.includes(rawQuery);
        const matchesEventId = eventId.includes(cleanQuery) || `#${eventId}`.includes(rawQuery);
        const matchesEventName = eventName.includes(cleanQuery) || eventName.includes(rawQuery);
        const matchesTicketType = ticketType.includes(cleanQuery);
        const matchesStatus = statusText.includes(cleanQuery);

        return (
            matchesTicketId ||
            matchesEventId ||
            matchesEventName ||
            matchesTicketType ||
            matchesStatus
        );
    });
}

async function init() {
    // 1. Guard check: only members can view this page
    const user = requireRole('member');
    if (!user) return;

    // 2. Render sidebar and topbar shell
    renderLayout({
        user,
        activeKey: 'tickets',
        title: '',
        subtitle: '',
    });

    bindOverlayClose('modal-overlay');

    const tbodyEl = document.getElementById('tickets-table-body');
    const cancelModal = document.getElementById('cancel-ticket-overlay');
    const cancelMsgEl = document.getElementById('cancel-ticket-message');
    const confirmCancelBtn = document.getElementById('btn-confirm-cancel');

    let pendingBookingToCancel = null;
    let localBookings = [];
    let eventMap = new Map();

    try {
        // 3. Fetch user's bookings and all events in parallel
        const [userBookings, allEvents] = await Promise.all([
            getBookingsByUser(user.id),
            getEvents(),
        ]);

        // 4. Map events by their ID for fast O(1) lookup
        eventMap = new Map(allEvents.map((ev) => [ev.id, ev]));

        // 5. Sort bookings newest first (descending by ID)
        localBookings = [...userBookings].sort((a, b) => Number(b.id) - Number(a.id));

        // 6. Initial render of ticket rows
        renderTickets(tbodyEl, localBookings, eventMap);

        // 7. Setup cancellation click handler on table
        if (tbodyEl) {
            tbodyEl.addEventListener('click', (e) => {
                const cancelBtn = e.target.closest('[data-action="cancel-ticket"]');
                if (!cancelBtn) return;

                const bookingId = Number(cancelBtn.dataset.bookingId);
                const booking = localBookings.find((b) => Number(b.id) === bookingId);
                if (!booking) return;

                const event = eventMap.get(booking.eventId);
                const eventName = event ? event.name : 'this event';

                pendingBookingToCancel = booking;
                if (cancelMsgEl) {
                    cancelMsgEl.textContent = `Are you sure you want to cancel your ticket for "${eventName}" (Ticket #${booking.id})? Your seats will be released and this cannot be undone.`;
                }

                openOverlay('cancel-ticket-overlay');
            });
        }

        // 8. Confirm Cancellation inside dialog
        if (confirmCancelBtn) {
            confirmCancelBtn.addEventListener('click', async () => {
                if (!pendingBookingToCancel) return;

                confirmCancelBtn.disabled = true;
                confirmCancelBtn.textContent = 'Cancelling...';

                try {
                    const cancellationPayload = {
                        status: 'cancelled',
                        cancelledAt: getTodayISO(),
                    };

                    await updateBooking(pendingBookingToCancel.id, cancellationPayload);

                    // Update in-memory state
                    pendingBookingToCancel.status = 'cancelled';
                    pendingBookingToCancel.cancelledAt = cancellationPayload.cancelledAt;

                    closeOverlay('cancel-ticket-overlay');
                    showToast('Ticket cancelled successfully', 'success');

                    // Re-render table to immediately reflect changes
                    renderTickets(tbodyEl, localBookings, eventMap);

                } catch (cancelErr) {
                    console.error('Failed to cancel ticket:', cancelErr);
                    showToast('Failed to cancel ticket. Please try again.', 'error');
                } finally {
                    confirmCancelBtn.disabled = false;
                    confirmCancelBtn.textContent = 'Yes, Cancel Ticket';
                    pendingBookingToCancel = null;
                }
            });
        }

        // 9. Live search filter from the topbar input
        const searchInput = document.querySelector('.search__input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                const filteredBookings = filterTickets(localBookings, eventMap, query);
                renderTickets(tbodyEl, filteredBookings, eventMap, query.trim() !== '');
            });
        }

    } catch (err) {
        console.error('Failed to load tickets:', err);
        if (tbodyEl) {
            tbodyEl.innerHTML = `
                <tr class="ticket-row">
                    <td colspan="7" style="text-align: center; color: var(--color-error); padding: 2rem;">
                        Failed to load tickets. Please refresh the page.
                    </td>
                </tr>
            `;
        }
    }
}

init();
