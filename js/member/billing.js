import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getBookingsByUser, getEvents } from '../core/api.js';
import { isEventCancelled, isBookingCancelled } from '../core/utils.js';
import { formatDate, formatTime, getTodayISO } from '../core/date.js';
import { showToast } from '../core/dom.js';

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

// Populate the Invoice modal elements with real booking, event, and member details
function populateInvoice(booking, event, user) {
    const isCancelled = isBookingCancelled(booking) || isEventCancelled(event);

    // Header & Meta
    const invNumberEl = document.getElementById('inv-number');
    const invEventNameEl = document.getElementById('inv-event-name');
    const invIssuedOnEl = document.getElementById('inv-issued-on');
    const invUserNameEl = document.getElementById('inv-user-name');
    const invUserAddressEl = document.getElementById('inv-user-address');
    const invPaymentStatusEl = document.getElementById('inv-payment-status');
    const invDetailsListEl = document.getElementById('inv-details-list');
    const invSubtotalEl = document.getElementById('inv-subtotal');
    const invTotalEl = document.getElementById('inv-total');
    const invNoticeEl = document.getElementById('inv-notice');
    const invNoticeTextEl = document.getElementById('inv-notice-text');

    if (invNumberEl) invNumberEl.textContent = `#${booking.id}`;
    if (invEventNameEl) invEventNameEl.textContent = event ? event.name : 'Event Booking';
    if (invIssuedOnEl) {
        invIssuedOnEl.textContent = formatDate(booking.bookedAt || booking.createdAt || getTodayISO());
    }

    if (invUserNameEl) invUserNameEl.textContent = user.name || 'Member';
    if (invUserAddressEl) {
        const addrParts = [
            user.address1,
            user.address2,
            [user.city, user.state].filter(Boolean).join(', ') + (user.zip ? ` - ${user.zip}` : ''),
            user.country || 'India',
        ].filter(Boolean);
        invUserAddressEl.innerHTML = addrParts.length > 0 ? addrParts.join('<br>') : 'Address on file';
    }

    // Payment Status & Cancellation notice
    if (invPaymentStatusEl) {
        if (isCancelled) {
            invPaymentStatusEl.textContent = 'Cancelled (Refunded)';
            invPaymentStatusEl.style.color = 'var(--color-error, #ef4444)';
        } else {
            invPaymentStatusEl.textContent = 'Paid';
            invPaymentStatusEl.style.color = '#10b981';
        }
    }

    if (invNoticeEl && invNoticeTextEl) {
        if (isCancelled) {
            invNoticeEl.style.display = 'flex';
            invNoticeTextEl.textContent = booking.cancelledAt
                ? `This booking was cancelled on ${formatDate(booking.cancelledAt)}. Retained for audit and record keeping.`
                : 'This event was cancelled. Retained for audit and record keeping.';
        } else {
            invNoticeEl.style.display = 'none';
        }
    }

    // Ticket Particulars Breakdown
    if (invDetailsListEl) {
        const details = [
            { label: 'Date', value: event && event.date ? formatDate(event.date) : '-' },
            { label: 'Time', value: event && event.startTime ? `${formatTime(event.startTime)} Onwards` : '-' },
            { label: 'Venue', value: event && event.location ? event.location : '-' },
            { label: 'Ticket Type', value: booking.ticketType || (booking.quantity > 1 ? 'Double' : 'Single') },
            { label: 'Quantity', value: `${booking.quantity || 1} Seat(s)` },
            { label: 'TAB Team Name', value: user.tabTeamName || 'NA' },
            { label: 'System Incharge', value: user.systemIncharge || 'NA' },
            { label: 'Meal Preference', value: booking.userMeal || 'Standard' },
        ];

        if (booking.spouseName) {
            details.push({ label: 'Spouse Name', value: booking.spouseName });
            details.push({ label: 'Spouse Meal', value: booking.spouseMeal || 'Standard' });
        }

        details.push({ label: 'User ID', value: user.email || 'NA' });
        details.push({ label: 'GST', value: user.gst || 'NA' });

        invDetailsListEl.innerHTML = details.map((d) => `
            <div class="details-row">
                <dt>${d.label}</dt>
                <dd>: ${d.value}</dd>
            </div>
        `).join('');
    }

    // Pricing Totals
    const formattedAmount = booking.amount ? `${booking.amount}/-` : '0/-';
    if (invSubtotalEl) invSubtotalEl.textContent = formattedAmount;
    if (invTotalEl) invTotalEl.textContent = formattedAmount;
}

// Generate the HTML for an individual billing row
function createBillingRow(booking, event) {
    const isCancelled = isBookingCancelled(booking) || isEventCancelled(event);
    const eventName = event ? event.name : 'Unknown Event';
    const billDate = event && event.date ? formatShortDate(event.date) : formatShortDate(booking.bookedAt);
    const ticketType = booking.ticketType || (booking.quantity > 1 ? 'Double' : 'Single');
    const amount = booking.amount ? `${booking.amount}/-` : '0/-';

    let statusText = 'Paid';
    let statusClass = 'status-pill--confirm';

    if (isEventCancelled(event)) {
        statusText = 'Event Cancelled';
        statusClass = 'status-pill--cancel';
    } else if (isBookingCancelled(booking)) {
        statusText = 'Cancelled';
        statusClass = 'status-pill--cancel';
    }

    return `
        <tr class="billing-row${isCancelled ? ' billing-row--cancelled' : ''}">
            <td class="bill-id">#${booking.id}</td>
            <td class="event-name">${eventName}</td>
            <td class="bill-date">${billDate}</td>
            <td class="bill-type">${ticketType}</td>
            <td class="bill-amount">${amount}</td>
            <td>
                <span class="status-pill ${statusClass}">${statusText}</span>
            </td>
            <td class="bill-action">
                <button type="button" class="btn-view" data-action="view-invoice" data-booking-id="${booking.id}">
                    View
                </button>
            </td>
        </tr>
    `;
}

// Render list of billing rows into tbody
function renderBillingTable(tbodyEl, bookings, eventMap, isSearching = false) {
    if (!tbodyEl) return;

    if (bookings.length === 0) {
        if (isSearching) {
            tbodyEl.innerHTML = `
                <tr class="billing-row">
                    <td colspan="7" class="billing-empty">
                        <p style="margin-bottom: 0.5rem; color: var(--color-text-muted);">No invoices match your search.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbodyEl.innerHTML = `
            <tr class="billing-row">
                <td colspan="7" class="billing-empty">
                    <p style="margin-bottom: 1rem; color: var(--color-text-muted);">No billing history or invoices found.</p>
                    <a href="/pages/member/events.html" class="btn-view" style="text-decoration: none; display: inline-flex;">Browse Events</a>
                </td>
            </tr>
        `;
        return;
    }

    tbodyEl.innerHTML = bookings.map((booking) => {
        const event = eventMap.get(booking.eventId);
        return createBillingRow(booking, event);
    }).join('');
}

// Filter billing records based on live search query
export function filterBillingRecords(bookings, eventMap, query) {
    const rawQuery = (query || '').trim().toLowerCase();
    if (!rawQuery) return bookings;

    const cleanQuery = rawQuery.replace(/^#/, '');

    return bookings.filter((b) => {
        const event = eventMap.get(b.eventId);
        const eventName = (event?.name || '').toLowerCase();
        const eventId = String(b.eventId || '');
        const billId = String(b.id || '');
        const ticketType = (b.ticketType || (b.quantity > 1 ? 'double' : 'single')).toLowerCase();

        const eventCancelled = isEventCancelled(event);
        const bookingCancelled = isBookingCancelled(b);
        const statusText = (eventCancelled || bookingCancelled)
            ? 'cancelled refunded'
            : 'paid confirm confirmed';

        const matchesBillId = billId.includes(cleanQuery) || `#${billId}`.includes(rawQuery);
        const matchesEventId = eventId.includes(cleanQuery) || `#${eventId}`.includes(rawQuery);
        const matchesEventName = eventName.includes(cleanQuery) || eventName.includes(rawQuery);
        const matchesTicketType = ticketType.includes(cleanQuery);
        const matchesStatus = statusText.includes(cleanQuery);

        return (
            matchesBillId ||
            matchesEventId ||
            matchesEventName ||
            matchesTicketType ||
            matchesStatus
        );
    });
}

async function init() {
    // 1. Guard check: only members can access billing
    const user = requireRole('member');
    if (!user) return;

    // 2. Render sidebar and topbar shell
    renderLayout({
        user,
        activeKey: 'billing',
        title: '',
        subtitle: '',
    });

    const tbodyEl = document.getElementById('billing-table-body');
    const invoiceModal = document.getElementById('invoiceModal');
    const closeBtn = document.getElementById('btnInvoiceCancel');
    const backdrop = document.querySelector('.invoice-modal__backdrop');
    const printBtn = document.getElementById('btnInvoicePrint');
    const sendBtn = document.getElementById('btnInvoiceSend');

    let localBookings = [];
    let eventMap = new Map();

    const openModal = () => {
        if (invoiceModal) invoiceModal.classList.add('is-open');
    };

    const closeModal = () => {
        if (invoiceModal) invoiceModal.classList.remove('is-open');
    };

    // Close handlers
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);

    // Print handler
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    // Send Invoice simulation handler
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            showToast(`Invoice sent to ${user.email}`, 'success');
        });
    }

    try {
        // 3. Concurrently fetch user bookings and events
        const [userBookings, allEvents] = await Promise.all([
            getBookingsByUser(user.id),
            getEvents(),
        ]);

        // 4. Create event map for fast O(1) lookup
        eventMap = new Map(allEvents.map((ev) => [ev.id, ev]));

        // 5. Sort newest first (descending by booking ID)
        localBookings = [...userBookings].sort((a, b) => Number(b.id) - Number(a.id));

        // 6. Render the billing rows
        renderBillingTable(tbodyEl, localBookings, eventMap);

        // 7. Attach delegated click handler for View buttons
        if (tbodyEl) {
            tbodyEl.addEventListener('click', (e) => {
                const viewBtn = e.target.closest('[data-action="view-invoice"]');
                if (!viewBtn) return;

                const bookingId = Number(viewBtn.dataset.bookingId);
                const booking = localBookings.find((b) => Number(b.id) === bookingId);
                if (!booking) return;

                const event = eventMap.get(booking.eventId);
                populateInvoice(booking, event, user);
                openModal();
            });
        }

        // 8. Live search filtering via topbar input
        const searchInput = document.querySelector('.search__input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value;
                const filteredBookings = filterBillingRecords(localBookings, eventMap, query);
                renderBillingTable(tbodyEl, filteredBookings, eventMap, query.trim() !== '');
            });
        }

    } catch (err) {
        console.error('Failed to load billing history:', err);
        if (tbodyEl) {
            tbodyEl.innerHTML = `
                <tr class="billing-row">
                    <td colspan="7" style="text-align: center; color: var(--color-error); padding: 2rem;">
                        Failed to load billing history. Please refresh the page.
                    </td>
                </tr>
            `;
        }
    }
}

init();
