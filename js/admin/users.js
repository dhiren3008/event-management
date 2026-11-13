import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getUsers, updateUser } from '../core/api.js';
import { createEl, createButton, showToast, showFormMessage } from '../core/dom.js';

// The markup lives in pages/admin/users.html. This module fills rows,
// switches tabs, persists active/inactive status, and sends "User Details"
// to the details pages with the user's ID.

// ===== State =====

let users = []; // every account, fetched once
let activeTab = 'member';
let currentUser = null; // the signed-in admin, used for self-protection

// The tab ids double as role names (`data-tab="member"` ↔ role "member"),
// so filtering is a straight match.
function tabUsers() {
    return users.filter((user) => user.role === activeTab);
}

// ===== Details pages =====

const MEMBER_DETAILS_PAGE = '/pages/admin/member-details.html';
const VERIFIER_DETAILS_PAGE = '/pages/admin/verifier-details.html';
const ADMIN_DETAILS_PAGE = '/pages/admin/admin-details.html';

function detailsPageFor(user) {
    if (user.role === 'verifier') {
        return `${VERIFIER_DETAILS_PAGE}?id=${encodeURIComponent(user.id)}`;
    }
    if (user.role === 'admin') {
        return `${ADMIN_DETAILS_PAGE}?id=${encodeURIComponent(user.id)}`;
    }
    return `${MEMBER_DETAILS_PAGE}?id=${encodeURIComponent(user.id)}`;
}

// ===== User table =====

function buildRow(user) {
    const tr = createEl('tr');

    const toggle = createButton('switch');
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-label', `${user.name} active`);

    const on = user.status !== false;
    toggle.setAttribute('aria-checked', String(on));
    toggle.classList.toggle('is-on', on);
    toggle.append(createEl('span', 'switch__knob'));

    // The signed-in admin cannot lock themselves out, and the last active admin cannot be deactivated.
    const isSelf = currentUser && Number(user.id) === Number(currentUser.id);
    const isLastActiveAdmin = user.role === 'admin' && on && users.filter((u) => u.role === 'admin' && u.status !== false).length <= 1;

    if (isSelf) {
        toggle.disabled = true;
        toggle.title = 'You cannot deactivate your own account.';
        toggle.setAttribute('aria-label', `${user.name} active (your own account)`);
    } else if (isLastActiveAdmin) {
        toggle.disabled = true;
        toggle.title = 'You cannot deactivate the last admin account.';
        toggle.setAttribute('aria-label', `${user.name} active (last admin account)`);
    } else {
        toggle.addEventListener('click', async () => {
            const next = !toggle.classList.contains('is-on');
            if (!next && user.role === 'admin') {
                const activeAdmins = users.filter((u) => u.role === 'admin' && u.status !== false);
                if (activeAdmins.length <= 1) {
                    showToast('You cannot deactivate the last admin account.', 'error');
                    return;
                }
            }
            toggle.classList.toggle('is-on', next);
            toggle.setAttribute('aria-checked', String(next));
            user.status = next;
            try {
                await updateUser(user.id, { status: next });
            } catch (error) {
                console.error('Failed to update user status:', error);
                // Revert on error
                user.status = !next;
                toggle.classList.toggle('is-on', !next);
                toggle.setAttribute('aria-checked', String(!next));
            }
        });
    }

    const details = createButton('pill', 'User Details');
    details.addEventListener('click', () => {
        window.location.href = detailsPageFor(user);
    });

    const statusCell = createEl('td');
    statusCell.append(toggle);
    const detailsCell = createEl('td');
    detailsCell.append(details);

    tr.append(
        createEl('td', 'users-table__id', user.displayId || `#${user.id}`),
        createEl('td', 'users-table__name', user.name),
        createEl('td', 'users-table__muted', user.location || '\u2014'),
        statusCell,
        detailsCell
    );

    return tr;
}

const searchInput = () => document.querySelector('.search__input');

// Hides rows the topbar search does not match and refreshes the empty state.
function applySearch() {
    const input = searchInput();
    const query = (input ? input.value : '').trim().toLowerCase();
    const cleanQuery = query.replace(/^#/, '');
    const rows = [...document.querySelectorAll('#users-body tr')];
    let shown = 0;

    rows.forEach((row) => {
        const rowText = row.textContent.toLowerCase();
        const match = query === '' || rowText.includes(query) || (cleanQuery !== '' && rowText.includes(cleanQuery));
        row.hidden = !match;
        if (match) {
            shown += 1;
        }
    });

    const scroll = document.querySelector('.users-card__scroll');
    const empty = document.getElementById('users-empty');

    if (rows.length === 0) {
        scroll.classList.add('is-hidden');
        empty.textContent = 'No users yet';
        empty.classList.remove('is-hidden');
    } else if (shown === 0) {
        scroll.classList.add('is-hidden');
        empty.textContent = 'No users match your search';
        empty.classList.remove('is-hidden');
    } else {
        scroll.classList.remove('is-hidden');
        empty.classList.add('is-hidden');
    }
}

function renderRows() {
    document.getElementById('users-body')
        .replaceChildren(...tabUsers().map(buildRow));
    applySearch();
}

function updateAddButton() {
    document.querySelectorAll('.users-page__add').forEach((btn) => {
        btn.classList.toggle('is-hidden', btn.dataset.tab !== activeTab);
    });
}

// ===== Tabs =====

document.querySelectorAll('.users-page__tabs .tabs__btn').forEach((button) => {
    button.addEventListener('click', () => {
        activeTab = button.dataset.tab;

        document.querySelectorAll('.users-page__tabs .tabs__btn').forEach((other) => {
            const selected = other === button;
            other.classList.toggle('is-active', selected);
            other.setAttribute('aria-selected', String(selected));
        });

        updateAddButton();
        renderRows();
    });
});

// ===== Topbar search =====
// The topbar input only exists once renderLayout() has run, so it is bound
// inside init() below.

// ===== Entry point =====

async function init() {
    const user = requireRole('admin');
    if (!user) {
        return;
    }

    currentUser = user;

    const { contentEl } = renderLayout({
        user,
        activeKey: 'users',
        title: '',
        subtitle: '',
    });

    const status = createEl('p', 'users-page__status', 'Loading users\u2026');
    contentEl.querySelector('.users-page').prepend(status);

    // Confirmation left behind by the details pages after a deletion.
    const notice = new URLSearchParams(window.location.search).get('notice');
    if (notice === 'deleted') {
        showFormMessage('users-message', 'Account deleted.', 'success');
        history.replaceState(null, '', window.location.pathname);
    }

    // The topbar input is only wired up after the shell exists.
    const input = searchInput();
    if (input) {
        input.addEventListener('input', applySearch);
    }

    try {
        users = await getUsers();
        status.remove();
        updateAddButton();
        renderRows();
    } catch (error) {
        console.error(error);
        status.className = 'form-message form-message--error';
        status.textContent = 'Could not load users. Please try again.';
    }
}

init();
