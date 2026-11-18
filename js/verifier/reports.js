import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getEvents, getAssignments, getBookings } from '../core/api.js';
import { formatDate, getEventStatus } from '../core/date.js';
import {
    formatNumber,
    isBookingCancelled,
    isEventCancelled,
    summariseBookings,
} from '../core/utils.js';
import { createEl, createButton, showToast } from '../core/dom.js';

const DEFAULT_STATUS = 'all';
const DEFAULT_SORT = 'date-asc';

const state = {
    user: null,
    rows: [],
    statusFilter: DEFAULT_STATUS,
    sortBy: DEFAULT_SORT,
    searchQuery: '',
};

// ===== Data shaping =====

function getRowStatus(event) {
    if (isEventCancelled(event)) {
        return 'cancelled';
    }
    return getEventStatus(event.date, event.endDate);
}

function buildReportRows(events, assignments, bookings, verifierId) {
    const assignedEventIds = new Set(
        assignments
            .filter((a) => Number(a.userId) === Number(verifierId) && a.status !== false)
            .map((a) => Number(a.eventId))
    );

    const bookingsByEvent = new Map();
    bookings.forEach((booking) => {
        const key = Number(booking.eventId);
        if (!bookingsByEvent.has(key)) {
            bookingsByEvent.set(key, []);
        }
        bookingsByEvent.get(key).push(booking);
    });

    return events
        .filter((event) => assignedEventIds.has(Number(event.id)))
        .map((event) => {
            const eventBookings = bookingsByEvent.get(Number(event.id)) || [];
            const summary = summariseBookings(eventBookings);
            const verifiedTickets = eventBookings.reduce((total, booking) => {
                if (isBookingCancelled(booking) || !booking.verified) {
                    return total;
                }
                return total + Number(booking.quantity || 0);
            }, 0);

            return {
                event,
                status: getRowStatus(event),
                memberCount: summary.tickets,
                bookingCount: summary.count,
                verifiedTickets,
            };
        });
}

function getFilteredAndSortedRows() {
    const query = state.searchQuery.trim().toLowerCase();
    const cleanQuery = query.replace(/^#/, '').trim();

    const filtered = state.rows.filter((row) => {
        if (state.statusFilter !== 'all' && row.status !== state.statusFilter) {
            return false;
        }

        if (!query) {
            return true;
        }

        const { event } = row;
        const formattedDate = formatDate(event.date);
        const haystack = `#${event.id} ${event.id} ${event.name || ''} ${event.location || ''} ${formattedDate}`.toLowerCase();
        return haystack.includes(query) || (cleanQuery !== '' && haystack.includes(cleanQuery));
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
        if (state.sortBy === 'date-desc') {
            return (b.event.date + (b.event.startTime || '')).localeCompare(a.event.date + (a.event.startTime || ''));
        }
        if (state.sortBy === 'members-desc') {
            return b.memberCount - a.memberCount || (a.event.date || '').localeCompare(b.event.date || '');
        }
        if (state.sortBy === 'name-asc') {
            return (a.event.name || '').localeCompare(b.event.name || '');
        }
        // Default: date-asc (earliest first)
        return (a.event.date + (a.event.startTime || '')).localeCompare(b.event.date + (b.event.startTime || ''));
    });

    return sorted;
}

// ===== Rendering =====

function buildStatusBadge(status) {
    if (status === 'cancelled') {
        return createEl('span', 'status-badge status-badge--cancelled', 'Cancelled');
    }
    if (status === 'today') {
        return createEl('span', 'status-badge status-badge--active', 'Today');
    }
    if (status === 'past') {
        return createEl('span', 'status-badge status-badge--muted', 'Past');
    }
    return null;
}

function buildTableRow(row) {
    const { event, status, memberCount, verifiedTickets } = row;
    const isBlocked = status === 'cancelled' || status === 'past';

    const tr = createEl('tr', isBlocked ? 'report-row is-muted' : 'report-row');

    const orderCell = createEl('td', 'report-order', `#${event.id}`);

    const nameCell = createEl('td', 'report-event-name');
    const nameWrap = createEl('span', 'report-event-name__wrap');
    nameWrap.append(createEl('span', '', event.name || 'Untitled Event'));
    const badge = buildStatusBadge(status);
    if (badge) {
        nameWrap.append(badge);
    }
    nameCell.append(nameWrap);

    const dateCell = createEl('td', 'report-date', formatDate(event.date) || 'TBA');
    const locationCell = createEl('td', 'report-location', event.location || 'TBA');

    const countCell = createEl('td', 'report-count');
    const countWrap = createEl('span', 'report-count__wrap');
    const unit = memberCount === 1 ? 'Member' : 'Members';
    countWrap.append(
        createEl('span', '', `${formatNumber(memberCount)} ${unit}`),
        createEl('span', 'report-count__sub', `${formatNumber(verifiedTickets)} verified`)
    );
    countCell.append(countWrap);

    const actionCell = createEl('td', 'report-action');
    const scanBtn = createButton('btn-scan-ticket', 'Scan Ticket');
    scanBtn.dataset.eventId = String(event.id);
    scanBtn.dataset.status = status;
    if (isBlocked) {
        scanBtn.classList.add('is-disabled');
        scanBtn.title = status === 'cancelled'
            ? 'Cannot scan tickets for a cancelled event'
            : 'This event has already ended';
    }
    actionCell.append(scanBtn);

    tr.append(orderCell, nameCell, dateCell, locationCell, countCell, actionCell);
    return tr;
}

function buildEmptyRow(message, hint = '', showReset = false) {
    const tr = createEl('tr', 'report-empty-row');
    const td = createEl('td', 'report-empty-cell');
    td.colSpan = 6;

    const wrap = createEl('div', 'report-empty__wrap');
    wrap.append(createEl('p', '', message));
    if (hint) {
        wrap.append(createEl('p', 'report-empty__hint', hint));
    }
    if (showReset) {
        const resetBtn = createButton('report-empty__reset', 'Reset Filters');
        resetBtn.dataset.resetFilters = 'true';
        wrap.append(resetBtn);
    }

    td.append(wrap);
    tr.append(td);
    return tr;
}

function updateFilterIndicators() {
    const hasActiveFilter =
        state.statusFilter !== DEFAULT_STATUS ||
        state.sortBy !== DEFAULT_SORT ||
        state.searchQuery.trim() !== '';

    const dotEl = document.getElementById('reports-filter-dot');
    if (dotEl) {
        dotEl.classList.toggle('is-hidden', state.statusFilter === DEFAULT_STATUS && state.sortBy === DEFAULT_SORT);
    }

    const resetBtn = document.getElementById('reports-filter-reset');
    if (resetBtn) {
        resetBtn.disabled = !hasActiveFilter;
    }

    const chips = document.querySelectorAll('#reports-status-chips .filter-chip');
    chips.forEach((chip) => {
        chip.classList.toggle('is-active', chip.dataset.status === state.statusFilter);
    });

    const sortSelect = document.getElementById('reports-sort-select');
    if (sortSelect && sortSelect.value !== state.sortBy) {
        sortSelect.value = state.sortBy;
    }
}

function renderTable() {
    const tbody = document.getElementById('reports-table-body');
    if (!tbody) return;

    updateFilterIndicators();

    if (state.rows.length === 0) {
        tbody.replaceChildren(
            buildEmptyRow(
                'No events have been assigned to you yet.',
                'Ask an administrator to assign you to an event from Event Management.'
            )
        );
        return;
    }

    const visibleRows = getFilteredAndSortedRows();

    if (visibleRows.length === 0) {
        tbody.replaceChildren(
            buildEmptyRow(
                'No assigned events match your current search or filter.',
                'Try clearing your search or switching back to All events.',
                true
            )
        );
        return;
    }

    tbody.replaceChildren(...visibleRows.map(buildTableRow));
}

// ===== Interactions =====

function resetAllFilters() {
    state.statusFilter = DEFAULT_STATUS;
    state.sortBy = DEFAULT_SORT;
    state.searchQuery = '';

    const searchInput = document.querySelector('.search__input');
    if (searchInput) {
        searchInput.value = '';
    }

    renderTable();
}

function setupFilterPopover() {
    const wrap = document.getElementById('reports-filter-wrap');
    const toggleBtn = document.getElementById('reports-filter-btn');
    const menu = document.getElementById('reports-filter-menu');
    const chipsWrap = document.getElementById('reports-status-chips');
    const sortSelect = document.getElementById('reports-sort-select');
    const resetBtn = document.getElementById('reports-filter-reset');

    if (!wrap || !toggleBtn || !menu) return;

    function closeMenu() {
        menu.classList.add('is-hidden');
        toggleBtn.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
        menu.classList.remove('is-hidden');
        toggleBtn.classList.add('is-open');
        toggleBtn.setAttribute('aria-expanded', 'true');
    }

    toggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isHidden = menu.classList.contains('is-hidden');
        if (isHidden) {
            openMenu();
        } else {
            closeMenu();
        }
    });

    document.addEventListener('click', (event) => {
        if (!wrap.contains(event.target) && !menu.classList.contains('is-hidden')) {
            closeMenu();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !menu.classList.contains('is-hidden')) {
            closeMenu();
        }
    });

    if (chipsWrap) {
        chipsWrap.addEventListener('click', (event) => {
            const chip = event.target.closest('.filter-chip');
            if (!chip || !chip.dataset.status) return;
            state.statusFilter = chip.dataset.status;
            renderTable();
        });
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (event) => {
            state.sortBy = event.target.value;
            renderTable();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            resetAllFilters();
            closeMenu();
        });
    }
}

function setupSearch() {
    const searchInput = document.querySelector('.search__input');
    if (!searchInput) return;

    searchInput.placeholder = 'Search by order ID, event name, or location...';

    searchInput.addEventListener('input', (event) => {
        state.searchQuery = event.target.value;
        renderTable();
    });
}

function setupTableActions() {
    const tbody = document.getElementById('reports-table-body');
    if (!tbody) return;

    tbody.addEventListener('click', (event) => {
        const resetBtn = event.target.closest('[data-reset-filters]');
        if (resetBtn) {
            resetAllFilters();
            return;
        }

        const scanBtn = event.target.closest('.btn-scan-ticket');
        if (!scanBtn) return;

        const status = scanBtn.dataset.status;
        if (status === 'cancelled') {
            showToast('Cannot scan tickets for a cancelled event.', 'error');
            return;
        }
        if (status === 'past') {
            showToast('This event has already ended.', 'error');
            return;
        }

        const eventId = scanBtn.dataset.eventId;
        if (eventId) {
            window.location.href = `/pages/verifier/ticket-details.html?eventId=${encodeURIComponent(eventId)}`;
        }
    });
}

// ===== Main Init =====

async function init() {
    const user = requireRole('verifier');
    if (!user) {
        return;
    }
    state.user = user;

    renderLayout({
        user,
        activeKey: 'reports',
        title: '',
        subtitle: '',
    });

    setupFilterPopover();
    setupSearch();
    setupTableActions();

    try {
        const [events, assignments, bookings] = await Promise.all([
            getEvents(),
            getAssignments(),
            getBookings(),
        ]);

        state.rows = buildReportRows(events, assignments, bookings, user.id);
        renderTable();
    } catch (error) {
        console.error('Error loading verifier reports:', error);
        showToast('Could not load assigned events. Please try again.', 'error');

        const tbody = document.getElementById('reports-table-body');
        if (tbody) {
            tbody.replaceChildren(
                buildEmptyRow(
                    'Could not load assigned events.',
                    'Please check that the server is running and refresh the page.'
                )
            );
        }
    }
}

init();
