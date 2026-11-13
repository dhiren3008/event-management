import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import {
    getEventById,
    getBookingsByEvent,
    getAssignments,
    getUsers,
    deleteAssignment,
    deleteBooking,
    deleteEvent,
    updateEvent,
} from '../core/api.js';
import { formatDate, formatTime, getTodayISO } from '../core/date.js';
import { getIdParam, goToPage } from '../core/nav.js';
import {
    isEmpty,
    formatNumber,
    formatCurrency,
    isEventCancelled,
    isBookingCancelled,
    summariseBookings,
} from '../core/utils.js';
import {
    createEl,
    openOverlay,
    closeOverlay,
    bindOverlayClose,
    showFormMessage,
    clearFormMessage,
    showToast,
} from '../core/dom.js';

// One event, read from ?id= in pages/admin/event-details.html: every #detail-*
// hook is filled here, the ticket stats come from /bookings, and Delete
// removes the event (assignments first) unless bookings are attached.

const EVENTS_PAGE = '/pages/admin/events.html';
const EDIT_PAGE = '/pages/admin/create-event.html';

// The page has two overlay families: the shared .modal-overlay (delete
// confirmation) and its own .event-popup-overlay (Export PDF).
bindOverlayClose('.modal-overlay, .event-popup-overlay');

// The event currently on screen (null until init resolves, and whenever the
// id is missing or unknown).
let currentEvent = null;

// ===== Filling =====

function setText(id, value) {
    document.getElementById(id).textContent = isEmpty(value) ? '\u2014' : value;
}

function fillEvent(event) {
    setText('detail-name', event.name);
    setText('detail-place', event.location);
    setText('detail-date', formatDate(event.date));
    setText('detail-time', range(event.startTime, event.endTime, ' - '));

    // Description is optional; dates/times fall back to '—' via setText.
    setText('detail-description', isEmpty(event.description)
        ? 'No description provided.'
        : event.description);

    setText('detail-start-date', formatDate(event.date));
    setText('detail-end-date', formatDate(event.endDate));
    setText('detail-booking-start', formatDate(event.bookingStart));
    setText('detail-booking-end', formatDate(event.bookingEnd));
    setText('detail-start-time', formatTime(event.startTime));
    setText('detail-end-time', formatTime(event.endTime));

    setText('detail-price', isEmpty(event.price) ? '' : formatCurrency(event.price));
    setText('detail-capacity', isEmpty(event.capacity) ? '' : formatNumber(event.capacity));
    setText('detail-location', event.location);
    setText('detail-pin', event.pinLevel);
}

function range(from, to, separator) {
    if (isEmpty(from) && isEmpty(to)) {
        return '';
    }
    return `${formatTime(from)}${separator}${formatTime(to)}`;
}

// Reflects the event's cancellation state in the badge and the action button.
function refreshStatusUi(event) {
    const cancelled = isEventCancelled(event);

    const badge = document.getElementById('detail-status');
    if (badge) {
        badge.classList.toggle('is-hidden', !cancelled);
    }

    const cancelButton = document.getElementById('cancel-event');
    if (cancelButton) {
        cancelButton.textContent = cancelled ? 'Reactivate Event' : 'Cancel Event';
    }
}

function fillStats(event, bookings) {
    const summary = summariseBookings(bookings);
    const left = Math.max(Number(event.capacity || 0) - summary.tickets, 0);

    document.getElementById('detail-sold').textContent = formatNumber(summary.tickets);
    document.getElementById('detail-left').textContent = formatNumber(left);
    document.getElementById('detail-revenue').textContent = formatCurrency(summary.revenue);
}

function renderAttendees(bookings, users) {
    const body = document.getElementById('attendees-body');
    const empty = document.getElementById('attendees-empty');
    if (!body || !empty) return;

    if (!bookings || bookings.length === 0) {
        body.innerHTML = '';
        empty.classList.remove('is-hidden');
        return;
    }

    empty.classList.add('is-hidden');
    const userMap = new Map(users.map((u) => [Number(u.id), u]));

    const rows = bookings.map((booking) => {
        const user = userMap.get(Number(booking.userId)) || {};
        const cancelled = isBookingCancelled(booking);
        const tr = createEl('tr', cancelled ? 'is-cancelled' : '');
        const statusCell = createEl('td');
        statusCell.append(
            createEl(
                'span',
                cancelled ? 'status-badge status-badge--cancelled' : 'status-badge status-badge--active',
                cancelled ? 'Cancelled' : 'Confirmed'
            )
        );
        tr.append(
            createEl('td', 'events-table__id', `#${booking.id}`),
            createEl('td', 'events-table__name', user.name || `User #${booking.userId}`),
            createEl('td', '', user.email || '\u2014'),
            createEl('td', '', formatNumber(booking.quantity || 1)),
            createEl('td', '', formatCurrency(booking.amount || 0)),
            createEl('td', '', formatDate(booking.bookedAt)),
            statusCell
        );
        return tr;
    });

    body.replaceChildren(...rows);
}

// No id, unknown id or a failed load: hide the whole page body instead of
// showing sample data.
function showMissing(message) {
    document.getElementById('details-missing-text').textContent = message;
    document.getElementById('details-missing').classList.remove('is-hidden');
    document.getElementById('details-view').classList.add('is-hidden');
}

// ===== Buttons =====

document.getElementById('export-pdf').addEventListener('click', () => {
    openOverlay('export-overlay');
});

document.getElementById('edit-event').addEventListener('click', () => {
    if (currentEvent) {
        goToPage(EDIT_PAGE, currentEvent.id);
    }
});

// Cancel keeps the event (and its bookings) in the database, unlike Delete.
document.getElementById('cancel-event').addEventListener('click', () => {
    if (!currentEvent) {
        return;
    }

    clearFormMessage('cancel-message');
    document.getElementById('cancel-title').textContent = isEventCancelled(currentEvent)
        ? 'Reactivate Event'
        : 'Cancel Event';
    document.getElementById('cancel-text').textContent = isEventCancelled(currentEvent)
        ? 'The event will be marked active again. Ticket sales are not re-opened automatically.'
        : 'The event stays in the list marked as cancelled. Existing bookings are kept, and the event no longer appears on the verifier dashboard.';
    document.getElementById('confirm-cancel').textContent = isEventCancelled(currentEvent)
        ? 'Reactivate Event'
        : 'Cancel Event';
    openOverlay('cancel-overlay');
});

document.getElementById('confirm-cancel').addEventListener('click', async () => {
    if (!currentEvent) {
        return;
    }

    const button = document.getElementById('confirm-cancel');
    const idleLabel = button.textContent;
    const reactivating = isEventCancelled(currentEvent);
    button.disabled = true;
    button.textContent = reactivating ? 'Reactivating\u2026' : 'Cancelling\u2026';
    clearFormMessage('cancel-message');

    try {
        const changes = reactivating
            ? { status: 'active', cancelledAt: null }
            : { status: 'cancelled', cancelledAt: getTodayISO() };

        await updateEvent(currentEvent.id, changes);
        currentEvent = { ...currentEvent, ...changes };
        fillEvent(currentEvent);
        refreshStatusUi(currentEvent);

        closeOverlay('cancel-overlay');
        showFormMessage(
            'delete-message',
            reactivating ? 'Event reactivated.' : 'Event cancelled.',
            'success'
        );
    } catch (error) {
        console.error(error);
        showFormMessage('cancel-message', 'Could not update the event. Please try again.', 'error');
    } finally {
        button.disabled = false;
        button.textContent = idleLabel;
    }
});

// Blocked when bookings exist — json-server has no cascade and customer
// bookings are never removed silently.
document.getElementById('delete-event').addEventListener('click', async () => {
    if (!currentEvent) {
        return;
    }

    clearFormMessage('delete-message');
    const button = document.getElementById('delete-event');
    button.disabled = true;

    try {
        const bookings = await getBookingsByEvent(currentEvent.id);
        // Only block deletion if the event is NOT cancelled and has bookings.
        // Once cancelled, the event can be deleted directly.
        if (!isEventCancelled(currentEvent) && bookings.length > 0) {
            const message = 'If you have to delete this event, first you have to cancel it.';
            showFormMessage('delete-message', message, 'error');
            showToast(message, 'error');
            return;
        }
        openOverlay('delete-overlay');
    } catch (error) {
        console.error(error);
        showFormMessage('delete-message', 'Could not check this event\u2019s bookings.', 'error');
    } finally {
        button.disabled = false;
    }
});

document.getElementById('confirm-delete').addEventListener('click', async () => {
    if (!currentEvent) {
        return;
    }

    const button = document.getElementById('confirm-delete');
    const idleLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Deleting\u2026';
    clearFormMessage('confirm-message');

    try {
        // Delete the event first so if it fails, no assignments or bookings are lost.
        await deleteEvent(currentEvent.id);

        // json-server does not cascade: clean up this event's verifier assignments and bookings
        try {
            const [assignments, bookings] = await Promise.all([
                getAssignments(),
                getBookingsByEvent(currentEvent.id),
            ]);
            const ownAssignments = assignments.filter(
                (assignment) => String(assignment.eventId) === String(currentEvent.id)
            );
            for (const assignment of ownAssignments) {
                await deleteAssignment(assignment.id);
            }
            for (const booking of bookings) {
                await deleteBooking(booking.id);
            }
        } catch (cleanupError) {
            console.warn('Could not clean up assignments/bookings after event deletion:', cleanupError);
        }

        window.location.href = `${EVENTS_PAGE}?notice=deleted`;
    } catch (error) {
        console.error(error);
        showFormMessage('confirm-message', 'Could not delete the event. Please try again.', 'error');
        button.disabled = false;
        button.textContent = idleLabel;
    }
});

// ===== Entry point =====

async function init() {
    const user = requireRole('admin');
    if (!user) {
        return;
    }

    renderLayout({
        user,
        activeKey: 'events',
        title: '',
        subtitle: '',
    });

    const id = getIdParam();
    if (!id) {
        showMissing('No event was selected.');
        return;
    }

    let event;
    try {
        event = await getEventById(id);
    } catch (error) {
        console.error(error);
        showMissing('Could not load this event. Please try again.');
        return;
    }

    if (!event) {
        showMissing('That event could not be found.');
        return;
    }

    currentEvent = event;
    fillEvent(event);
    refreshStatusUi(event);

    // Stats and attendees:
    try {
        const [bookings, users] = await Promise.all([
            getBookingsByEvent(id),
            getUsers(),
        ]);
        fillStats(event, bookings);
        renderAttendees(bookings, users);
    } catch (error) {
        console.error('Failed to load event bookings/attendees:', error);
    }
}

init();
