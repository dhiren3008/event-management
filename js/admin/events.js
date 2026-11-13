import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import {
    getEvents,
    getUsers,
    getAssignments,
    createAssignment,
    updateAssignment,
    deleteAssignment,
} from '../core/api.js';
import { formatDate, getEventStatus } from '../core/date.js';
import { goToPage } from '../core/nav.js';
import { isEventCancelled } from '../core/utils.js';
import {
    createEl,
    createButton,
    openOverlay,
    closeOverlay,
    bindOverlayClose,
    showFormMessage,
    clearFormMessage,
    showToast,
} from '../core/dom.js';

// The markup lives in pages/admin/events.html. This module fills rows
// and drives the assign event dialog.

// ===== Pure helpers =====

export function getVerifierCandidates(users) {
    return users.filter((user) => user.role === 'verifier' && user.status !== false);
}

export function findAssignment(assignments, eventId, userId) {
    return assignments.find(
        (assignment) => Number(assignment.eventId) === Number(eventId) && Number(assignment.userId) === Number(userId)
    ) || null;
}

// ===== Page data (set once the fetch resolves) =====

let data = null;
let assignRows = [];

// Status tab (all/upcoming/today/past) and the topbar query, both applied
// every time the table renders.
let activeStatus = 'all';
let searchQuery = '';

const EMPTY_BY_STATUS = {
    all: 'No events yet',
    upcoming: 'No upcoming events',
    today: 'No events today',
    past: 'No past events',
};

// ===== Dialog plumbing =====

bindOverlayClose();

function detailRows(pairs) {
    return pairs.map(([label, value]) => {
        const row = createEl('div', 'detail-list__row');
        row.append(
            createEl('dt', 'detail-list__label', label),
            createEl('dd', 'detail-list__value', value)
        );
        return row;
    });
}

// ===== User details dialog =====

function openUserDetails(user) {
    document.getElementById('user-list').replaceChildren(
        ...detailRows([
            ['Name', user.name],
            ['Verifier ID', user.displayId || `#${user.id}`],
            ['Email', user.email],
            ['Mobile', user.mobile || '\u2014'],
            ['Role', user.role],
            ['PIN Level', user.pinLevel || '\u2014'],
            ['Registered', formatDate(user.createdAt)],
        ])
    );

    openOverlay('user-overlay');
}

// ===== Assign event =====

function buildAssignRow(row) {
    const tr = createEl('tr');

    const check = createEl('input', 'check');
    check.type = 'checkbox';
    check.checked = row.checked;
    check.setAttribute('aria-label', `Select ${row.user.name}`);

    const toggle = createButton('switch');
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', `${row.user.name} active`);
    toggle.setAttribute('aria-checked', String(row.status));
    toggle.append(createEl('span', 'switch__knob'));
    toggle.classList.toggle('is-on', row.status);

    check.addEventListener('change', () => {
        row.checked = check.checked;
        row.status = check.checked;
        toggle.classList.toggle('is-on', row.status);
        toggle.setAttribute('aria-checked', String(row.status));
        updateAssignAllCheckbox();
    });

    toggle.addEventListener('click', () => {
        row.status = !row.status;
        toggle.classList.toggle('is-on', row.status);
        toggle.setAttribute('aria-checked', String(row.status));
        if (row.status) {
            row.checked = true;
            check.checked = true;
        } else if (!row.assignmentId) {
            row.checked = false;
            check.checked = false;
        }
        updateAssignAllCheckbox();
    });

    const details = createButton('pill', 'User Details');
    details.addEventListener('click', () => openUserDetails(row.user));

    const checkCell = createEl('td', 'assign-table__check-cell');
    checkCell.append(check);
    const statusCell = createEl('td');
    statusCell.append(toggle);
    const detailsCell = createEl('td');
    detailsCell.append(details);

    const displayId = row.user.displayId || `#${row.user.id}`;

    tr.append(
        checkCell,
        createEl('td', 'assign-table__id', displayId),
        createEl('td', 'assign-table__name', row.user.name),
        createEl('td', '', row.user.location || '\u2014'),
        createEl('td', '', row.user.pinLevel || '\u2014'),
        statusCell,
        detailsCell
    );

    row.tr = tr;
    return tr;
}

function updateAssignAllCheckbox() {
    const assignAll = document.getElementById('assign-all');
    if (!assignAll) return;
    const visibleRows = assignRows.filter((row) => row.tr && !row.tr.hidden);
    assignAll.checked = visibleRows.length > 0 && visibleRows.every((row) => row.checked);
}

async function openAssign(event) {
    if (isEventCancelled(event)) {
        showToast('Cannot assign verifiers to a cancelled event.', 'error');
        return;
    }
    if (getEventStatus(event.date, event.endDate) === 'past') {
        showToast('Cannot assign verifiers to a past event.', 'error');
        return;
    }

    try {
        const [users, assignments] = await Promise.all([
            getUsers(),
            getAssignments(),
        ]);
        data.users = users;
        data.members = getVerifierCandidates(users);
        data.assignments = assignments;
    } catch (err) {
        console.warn('Failed to refresh assign data:', err);
    }

    const { members, assignments } = data;

    document.getElementById('assign-title').textContent =
        `Assign Event \u2014 ${event.name}`;
    document.getElementById('assign-search').value = '';
    document.getElementById('assign-submit').disabled = false;
    clearFormMessage('assign-message');

    // Staged locally — nothing is written until the Assign button is pressed.
    assignRows = members.map((user) => {
        const existing = findAssignment(assignments, event.id, user.id);
        const isAssigned = Boolean(existing);
        return {
            user,
            assignmentId: existing ? existing.id : null,
            checked: isAssigned,
            status: isAssigned ? (existing.status !== false) : false,
            tr: null,
        };
    });

    document.getElementById('assign-body')
        .replaceChildren(...assignRows.map(buildAssignRow));

    updateAssignAllCheckbox();

    document.getElementById('assign-overlay').dataset.eventId = String(event.id);
    openOverlay('assign-overlay');
}

async function saveAssignments(eventId) {
    const targetEvent = data.events.find((e) => Number(e.id) === Number(eventId));
    if (targetEvent) {
        if (isEventCancelled(targetEvent)) {
            showToast('Cannot assign verifiers to a cancelled event.', 'error');
            return;
        }
        if (getEventStatus(targetEvent.date, targetEvent.endDate) === 'past') {
            showToast('Cannot assign verifiers to a past event.', 'error');
            return;
        }
    }

    const currentAssignments = await getAssignments();
    for (const row of assignRows) {
        const existing = findAssignment(currentAssignments, eventId, row.user.id);
        if (existing) {
            row.assignmentId = existing.id;
            if (row.checked) {
                await updateAssignment(existing.id, { status: row.status });
            } else {
                await deleteAssignment(existing.id);
                row.assignmentId = null;
            }
        } else if (row.checked) {
            const created = await createAssignment({
                eventId: Number(eventId),
                userId: Number(row.user.id),
                status: row.status !== false,
            });
            row.assignmentId = created.id;
        }
    }

    data.assignments = await getAssignments();
}

// ===== Assign dialog wiring =====

document.getElementById('assign-all').addEventListener('change', (event) => {
    const isChecked = event.target.checked;
    assignRows.forEach((row) => {
        if (!row.tr || row.tr.hidden) return;
        row.checked = isChecked;
        row.status = isChecked;
        const check = row.tr.querySelector('.check');
        if (check) check.checked = isChecked;
        const toggle = row.tr.querySelector('.switch');
        if (toggle) {
            toggle.classList.toggle('is-on', isChecked);
            toggle.setAttribute('aria-checked', String(isChecked));
        }
    });
});

document.getElementById('assign-search').addEventListener('input', (event) => {
    const raw = event.target.value.trim().toLowerCase();
    const query = raw.replace(/^#/, '').trim();
    assignRows.forEach((row) => {
        if (!row.tr) return;
        const displayId = row.user.displayId || `#${row.user.id}`;
        const haystack = `${displayId} ${row.user.id} ${row.user.name} ${row.user.location || ''} ${row.user.pinLevel || ''}`.toLowerCase();
        row.tr.hidden = query !== '' && !haystack.includes(query) && !haystack.includes(raw);
    });
    updateAssignAllCheckbox();
});

document.getElementById('assign-search-btn').addEventListener('click', () => {
    document.getElementById('assign-search').focus();
});

document.getElementById('assign-submit').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const eventId = Number(document.getElementById('assign-overlay').dataset.eventId);

    try {
        await saveAssignments(eventId);
        renderEvents();
        showFormMessage('assign-message', 'Event assigned successfully.', 'success');
        setTimeout(() => closeOverlay('assign-overlay'), 900);
    } catch (error) {
        console.error(error);
        showFormMessage('assign-message', 'Could not save. Please try again.', 'error');
        button.disabled = false;
    }
});

// ===== Event table =====

function buildEventRow(event) {
    const tr = createEl('tr', isEventCancelled(event) ? 'is-cancelled' : '');

    const nameCell = createEl('td', 'events-table__name');
    nameCell.append(createEl('span', '', event.name));
    if (isEventCancelled(event)) {
        nameCell.append(createEl('span', 'status-badge status-badge--cancelled', 'Cancelled'));
    }

    const details = createButton('pill', 'Event Details');
    details.dataset.action = 'details';
    details.dataset.eventId = String(event.id);

    const assign = createButton('pill', 'Assign Event');
    assign.dataset.action = 'assign';
    assign.dataset.eventId = String(event.id);
    const isPast = getEventStatus(event.date, event.endDate) === 'past';
    const isCancelled = isEventCancelled(event);
    if (isPast || isCancelled) {
        assign.classList.add('is-disabled');
        assign.title = isCancelled
            ? 'Cannot assign verifiers to a cancelled event'
            : 'Cannot assign verifiers to a past event';
    }

    const detailsCell = createEl('td');
    detailsCell.append(details);
    const assignCell = createEl('td');
    assignCell.append(assign);

    tr.append(
        createEl('td', 'events-table__id', `#${event.id}`),
        nameCell,
        createEl('td', '', formatDate(event.date)),
        createEl('td', '', event.location),
        detailsCell,
        assignCell
    );

    return tr;
}

function renderEvents() {
    if (!data) {
        return;
    }

    const visible = data.events.filter(
        (event) => activeStatus === 'all' || getEventStatus(event.date, event.endDate) === activeStatus
    );

    document.getElementById('events-body')
        .replaceChildren(...visible.map(buildEventRow));

    const rows = [...document.querySelectorAll('#events-body tr')];
    let shown = 0;
    const cleanQuery = searchQuery.replace(/^#/, '').trim();
    rows.forEach((row, index) => {
        const event = visible[index];
        if (!event) return;
        const haystack = `#${event.id} ${event.id} ${event.name} ${event.location || ''} ${formatDate(event.date)}`.toLowerCase();
        const match = searchQuery === '' || haystack.includes(searchQuery) || (cleanQuery !== '' && haystack.includes(cleanQuery));
        row.hidden = !match;
        if (match) {
            shown += 1;
        }
    });

    const scroll = document.querySelector('.events-card__scroll');
    const empty = document.getElementById('events-empty');

    if (data.events.length === 0) {
        scroll.classList.add('is-hidden');
        empty.textContent = 'No events yet';
        empty.classList.remove('is-hidden');
    } else if (shown === 0) {
        scroll.classList.add('is-hidden');
        const tabFiltered = data.events.filter(
            (event) => activeStatus === 'all' || getEventStatus(event.date, event.endDate) === activeStatus
        ).length;
        empty.textContent = tabFiltered === 0
            ? (EMPTY_BY_STATUS[activeStatus] || 'No events')
            : 'No events match your search';
        empty.classList.remove('is-hidden');
    } else {
        scroll.classList.remove('is-hidden');
        empty.classList.add('is-hidden');
    }
}

// ===== Status tabs =====

document.querySelectorAll('.event-page__filters .tabs__btn').forEach((button) => {
    button.addEventListener('click', () => {
        activeStatus = button.dataset.tab;
        document.querySelectorAll('.event-page__filters .tabs__btn').forEach((other) => {
            const isActive = other === button;
            other.classList.toggle('is-active', isActive);
            other.setAttribute('aria-selected', String(isActive));
        });
        clearFormMessage('events-message');
        renderEvents();
    });
});

// Listener for row action buttons and FAB.
document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger || trigger.disabled || !data) {
        return;
    }

    if (trigger.dataset.action === 'assign-first') {
        const next = data.events.find(
            (e) => !isEventCancelled(e) && getEventStatus(e.date, e.endDate) !== 'past'
        );
        if (next) {
            openAssign(next);
        } else {
            showToast('No upcoming active events to assign.', 'error');
        }
        return;
    }

    const target = data.events.find((item) => item.id === Number(trigger.dataset.eventId));
    if (!target) {
        return;
    }

    if (trigger.dataset.action === 'details') {
        goToPage('/pages/admin/event-details.html', target.id);
    } else if (trigger.dataset.action === 'assign') {
        if (isEventCancelled(target)) {
            showToast('Cannot assign verifiers to a cancelled event.', 'error');
            return;
        }
        if (getEventStatus(target.date, target.endDate) === 'past') {
            showToast('Cannot assign verifiers to a past event.', 'error');
            return;
        }
        openAssign(target);
    }
});

// ===== Entry point =====

async function init() {
    const user = requireRole('admin');
    if (!user) {
        return;
    }

    const { contentEl } = renderLayout({
        user,
        activeKey: 'events',
        title: '',
        subtitle: '',
    });

    const notice = new URLSearchParams(window.location.search).get('notice');
    const notices = {
        created: 'Event created successfully.',
        updated: 'Event updated successfully.',
        deleted: 'Event deleted.',
    };
    if (notice && notices[notice]) {
        showFormMessage('events-message', notices[notice], 'success');
        history.replaceState(null, '', window.location.pathname);
    }

    const search = document.querySelector('.search__input');
    if (search) {
        search.addEventListener('input', (event) => {
            searchQuery = event.target.value.trim().toLowerCase();
            clearFormMessage('events-message');
            renderEvents();
        });
    }

    const status = createEl('p', 'event-page__status', 'Loading events\u2026');
    contentEl.querySelector('.event-page').prepend(status);

    try {
        const [events, users, assignments] = await Promise.all([
            getEvents(),
            getUsers(),
            getAssignments(),
        ]);

        const sorted = [...events].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        data = {
            events: sorted,
            users,
            members: getVerifierCandidates(users),
            assignments,
        };

        status.remove();
        renderEvents();
    } catch (error) {
        console.error(error);
        status.className = 'form-message form-message--error';
        status.textContent = 'Could not load events. Please try again.';
    }
}

init();
