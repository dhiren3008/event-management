import { requireRole, saveUser } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';
import { getUserById, updateUser, createUser, deleteUser, getBookingsByUser, getAssignments, getUsers } from '../core/api.js';
import { getTodayISO } from '../core/date.js';
import { getIdParam } from '../core/nav.js';
import { openOverlay, bindOverlayClose, showFormMessage, clearFormMessage } from '../core/dom.js';
import { isValidEmail, isValidMobile } from '../core/utils.js';

const USERS_PAGE = '/pages/admin/users.html';

// The signed-in admin. Loaded in init(); used by the delete guards.
let currentAdmin = null;

bindOverlayClose();

// ===== Buttons =====

document.querySelectorAll('[data-cancel]').forEach((button) => {
    button.addEventListener('click', () => {
        window.location.href = USERS_PAGE;
    });
});

// ===== Page intent =====
// The role comes from data-role on #app (set per page). The old path check read
// the "/admin/" segment present in every admin URL, so "Add New Member"
// resolved to role "admin" and created an admin account. The fallback now looks
// at the file name only, never at a folder.

const BASENAME = window.location.pathname.split('/').pop().toLowerCase();
const isCreatePage = BASENAME.startsWith('add-');

function detectRole() {
    const explicit = document.getElementById('app')?.dataset.role;
    if (explicit === 'admin' || explicit === 'member' || explicit === 'verifier') {
        return explicit;
    }
    if (BASENAME.includes('verifier')) {
        return 'verifier';
    }
    if (BASENAME.includes('admin')) {
        return 'admin';
    }
    return 'member';
}

const PAGE_ROLE = detectRole();

// ===== Shared helpers =====

// Detail pages ship demo values in their markup. Clear them before loading so a
// failed or missing fetch can never leave another person's details on screen.
function clearFormFields() {
    document.querySelectorAll('#user-form input, #user-form select').forEach((field) => {
        field.value = '';
    });
}

// Stop an edit page from ever falling through to "create".
function lockSave(message) {
    const saveButton = document.querySelector('[data-save]');
    if (saveButton) {
        saveButton.disabled = true;
    }
    const deleteButton = document.getElementById('delete-user');
    if (deleteButton) {
        deleteButton.disabled = true;
        deleteButton.classList.add('is-hidden');
    }
    showFormMessage('user-form-message', message);
}

function fieldExists(id) {
    return document.getElementById(id) !== null;
}

// Only fields this page actually renders go into the PATCH.
// verifier-details.html shows a subset of the account fields; sending the
// missing ones as '' used to blank out the verifier's address, GST and team data.
const OPTIONAL_FIELDS = [
    ['location', 'location'],
    ['systemIncharge', 'system-incharge'],
    ['tabTeamName', 'team-name'],
    ['gst', 'gst'],
    ['spouse', 'spouse'],
    ['address1', 'address'],
    ['address2', 'address-2'],
    ['city', 'city'],
    ['state', 'state'],
    ['zip', 'zip'],
];

function buildPayload(name, email, phone, role) {
    const data = { name: name || 'Unnamed User' };

    if (fieldExists('email')) {
        data.email = email;
    }
    if (fieldExists('phone')) {
        data.mobile = phone;
    }

    OPTIONAL_FIELDS.forEach(([key, id]) => {
        if (fieldExists(id)) {
            data[key] = document.getElementById(id).value.trim();
        }
    });

    if (fieldExists('country')) {
        data.country = document.getElementById('country').value.trim() || 'India';
    }

    // Fill location from city and state if location is not explicitly provided
    if (!data.location) {
        const city = fieldExists('city') ? document.getElementById('city').value.trim() : '';
        const state = fieldExists('state') ? document.getElementById('state').value.trim() : '';
        if (city && state) {
            data.location = `${city}, ${state}`;
        } else if (city || state) {
            data.location = city || state;
        }
    }

    // The account-ID input is named differently on each role's page.
    // Display IDs are system-generated and can only be set when creating a new account.
    if (isCreatePage) {
        const idInput = ['member-id', 'verifier-id', 'admin-id'].find(fieldExists);
        if (idInput) {
            const customId = document.getElementById(idInput).value.trim();
            if (customId) {
                data.displayId = customId.startsWith('#') ? customId : `#${customId}`;
            }
        }
    }

    return data;
}

export function generateNextDisplayId(users) {
    const numbers = users.map((u) => {
        const idStr = u.displayId ? u.displayId.replace(/\D/g, '') : String(u.id);
        const num = parseInt(idStr, 10);
        return isNaN(num) ? 0 : num;
    });
    const max = Math.max(2000, ...numbers);
    let nextNum = max + 1;
    const existingIds = new Set(
        users.flatMap((u) => [
            u.displayId ? u.displayId.toLowerCase() : '',
            `#${u.id}`,
            String(u.id),
        ])
    );
    while (existingIds.has(`#${nextNum}`)) {
        nextNum += 1;
    }
    return `#${nextNum}`;
}

document.querySelectorAll('[data-save]').forEach((button) => {
    button.addEventListener('click', async () => {
        clearFormMessage('user-form-message');
        const getVal = (id) => document.getElementById(id)?.value?.trim() || '';
        const userId = getIdParam();
        const role = PAGE_ROLE;

        // A details page without ?id= must never fall through to create — it
        // used to POST the demo values in the markup as a brand-new account.
        if (!isCreatePage && !userId) {
            showFormMessage(
                'user-form-message',
                'No user was selected. Go back to User Management and pick a user.'
            );
            return;
        }

        const firstName = getVal('first-name');
        const lastName = getVal('last-name');
        const userName = getVal('user-name');
        const name = (firstName || lastName) ? `${firstName} ${lastName}`.trim() : userName;
        const email = getVal('email');
        const phone = getVal('phone');

        // Validation for both create and edit
        if (!name) {
            showFormMessage('user-form-message', 'Please enter a user name.');
            return;
        }
        if (fieldExists('email')) {
            if (!email || !isValidEmail(email)) {
                showFormMessage('user-form-message', 'Please enter a valid email address.');
                return;
            }
        }
        if (fieldExists('phone')) {
            if (!phone) {
                showFormMessage('user-form-message', 'Please enter a phone number.');
                return;
            }
            if (!isValidMobile(phone)) {
                showFormMessage('user-form-message', 'Phone must be between 10 and 12 digits.');
                return;
            }
        }

        button.disabled = true;

        try {
            // Check that email (case-insensitive) and mobile are not already used by another user
            const allUsers = await getUsers();
            const normalizedEmail = (email || '').toLowerCase();
            if (normalizedEmail) {
                const duplicateEmail = allUsers.find((u) =>
                    u.email &&
                    u.email.trim().toLowerCase() === normalizedEmail &&
                    (!userId || Number(u.id) !== Number(userId))
                );
                if (duplicateEmail) {
                    showFormMessage('user-form-message', 'This email address is already in use by another user.');
                    return;
                }
            }

            if (phone) {
                const duplicatePhone = allUsers.find((u) =>
                    u.mobile &&
                    u.mobile.trim() === phone &&
                    (!userId || Number(u.id) !== Number(userId))
                );
                if (duplicatePhone) {
                    showFormMessage('user-form-message', 'This phone number is already in use by another user.');
                    return;
                }
            }

            const data = buildPayload(name, email, phone, role);

            if (!userId) {
                // When creating a new user, ensure a unique display ID is assigned
                if (!data.displayId) {
                    data.displayId = generateNextDisplayId(allUsers);
                } else {
                    const duplicateId = allUsers.find((u) =>
                        u.displayId &&
                        u.displayId.trim().toLowerCase() === data.displayId.trim().toLowerCase()
                    );
                    if (duplicateId) {
                        data.displayId = generateNextDisplayId(allUsers);
                    }
                }
            } else {
                // Existing user IDs must never be modified
                delete data.displayId;
            }

            const messageEl = document.querySelector('.user-form__popup-text');

            if (userId) {
                const updated = await updateUser(userId, data);
                if (currentAdmin && Number(userId) === Number(currentAdmin.id)) {
                    saveUser({ ...currentAdmin, ...updated, ...data });
                    const avatarEl = document.querySelector('.avatar');
                    if (avatarEl) {
                        const words = (data.name || '').trim().split(/\s+/);
                        const first = words[0] ? words[0][0] : '';
                        const last = words.length > 1 ? words[words.length - 1][0] : '';
                        avatarEl.textContent = (first + last).toUpperCase();
                        avatarEl.setAttribute('aria-label', `Profile details — ${data.name}`);
                        avatarEl.setAttribute('title', `Profile details — ${data.name}`);
                    }
                }
                if (messageEl) {
                    messageEl.textContent = 'User details successfully saved to the database!';
                }
            } else {
                // Generate a random 8-character temporary password instead of
                // the predictable role-based default (BUG-05).
                const tempPassword = Array.from(crypto.getRandomValues(new Uint8Array(6)))
                    .map((b) => b.toString(36))
                    .join('')
                    .slice(0, 8);
                data.password = tempPassword;
                data.role = role;
                data.status = true;
                data.createdAt = getTodayISO();
                data.photo = '';
                await createUser(data);
                if (messageEl) {
                    messageEl.textContent = `${role.charAt(0).toUpperCase() + role.slice(1)} account created.\nTemporary password: ${tempPassword} (share this with the user).`;
                }
            }
            openOverlay('save-overlay');
        } catch (error) {
            console.error('Failed to save user:', error);
            const messageEl = document.querySelector('.user-form__popup-text');
            if (messageEl) {
                messageEl.textContent = 'Could not save. Please check your data and try again.';
            }
            openOverlay('save-overlay');
        } finally {
            button.disabled = false;
        }
    });
});

// Navigate back to user list when popup is dismissed
document.querySelectorAll('.user-form__popup-ok').forEach((btn) => {
    btn.addEventListener('click', () => {
        const path = window.location.pathname;
        if (path.includes('add-')) {
            window.location.href = USERS_PAGE;
        }
    });
});

// ===== Delete account (details pages only) =====
// Blocked for the signed-in admin and for anyone with bookings or event
// assignments — deactivating is the safe alternative there.

document.getElementById('delete-user')?.addEventListener('click', async () => {
    const id = getIdParam();
    clearFormMessage('user-form-message');
    clearFormMessage('delete-user-message');

    if (!id) {
        showFormMessage('user-form-message', 'No user was selected.', 'error');
        return;
    }
    if (currentAdmin && Number(id) === Number(currentAdmin.id)) {
        showFormMessage('user-form-message', 'You cannot delete your own account.', 'error');
        return;
    }

    const button = document.getElementById('delete-user');
    button.disabled = true;

    try {
        const [targetUser, allUsers, bookings, assignments] = await Promise.all([
            getUserById(id),
            getUsers(),
            getBookingsByUser(id),
            getAssignments(),
        ]);

        if (targetUser && targetUser.role === 'admin') {
            const adminCount = allUsers.filter((u) => u.role === 'admin').length;
            if (adminCount <= 1) {
                showFormMessage('user-form-message', 'You cannot delete the last admin account.', 'error');
                return;
            }
        }

        const ownAssignments = assignments.filter(
            (assignment) => String(assignment.userId) === String(id)
        );

        if (bookings.length > 0 || ownAssignments.length > 0) {
            const reasons = [];
            if (bookings.length > 0) {
                reasons.push(`${bookings.length} booking${bookings.length === 1 ? '' : 's'}`);
            }
            if (ownAssignments.length > 0) {
                reasons.push(`${ownAssignments.length} event assignment${ownAssignments.length === 1 ? '' : 's'}`);
            }
            showFormMessage(
                'user-form-message',
                `This account has ${reasons.join(' and ')} and can\u2019t be deleted. Deactivate it instead.`,
                'error'
            );
            return;
        }

        document.getElementById('delete-user-text').textContent =
            'This permanently removes the account. This cannot be undone.';
        openOverlay('delete-user-overlay');
    } catch (error) {
        console.error('Failed to check account links:', error);
        showFormMessage('user-form-message', 'Could not check this account\u2019s records. Please try again.', 'error');
    } finally {
        button.disabled = false;
    }
});

document.getElementById('confirm-delete-user')?.addEventListener('click', async () => {
    const id = getIdParam();
    clearFormMessage('delete-user-message');

    if (!id) {
        return;
    }
    if (currentAdmin && Number(id) === Number(currentAdmin.id)) {
        showFormMessage('delete-user-message', 'You cannot delete your own account.', 'error');
        return;
    }

    const button = document.getElementById('confirm-delete-user');
    const idleLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Deleting\u2026';

    try {
        const targetUser = await getUserById(id);
        if (targetUser && targetUser.role === 'admin') {
            const allUsers = await getUsers();
            const adminCount = allUsers.filter((u) => u.role === 'admin').length;
            if (adminCount <= 1) {
                showFormMessage('delete-user-message', 'You cannot delete the last admin account.', 'error');
                button.disabled = false;
                button.textContent = idleLabel;
                return;
            }
        }

        await deleteUser(id);
        window.location.href = `${USERS_PAGE}?notice=deleted`;
    } catch (error) {
        console.error('Failed to delete user:', error);
        showFormMessage('delete-user-message', 'Could not delete this account. Please try again.', 'error');
        button.disabled = false;
        button.textContent = idleLabel;
    }
});

// Enter inside a field must not submit the form
const form = document.getElementById('user-form');
if (form) {
    form.addEventListener('submit', (event) => {
        event.preventDefault();
    });
}

// ===== Populate user details if ?id= is present =====

async function populateUserDetails(id) {
    try {
        const user = await getUserById(id);
        if (!user) {
            lockSave('That user could not be found. Go back to User Management and pick a user.');
            return;
        }

        const setVal = (fieldId, val) => {
            const el = document.getElementById(fieldId);
            if (el && val !== undefined && val !== null) {
                el.value = val;
            }
        };

        const parts = (user.name || '').split(' ');
        setVal('first-name', parts[0] || '');
        setVal('last-name', parts.slice(1).join(' ') || '');
        setVal('user-name', user.name || '');
        setVal('member-id', user.displayId || `#${user.id}`);
        setVal('verifier-id', user.displayId || `#${user.id}`);
        setVal('admin-id', user.displayId || `#${user.id}`);
        ['member-id', 'verifier-id', 'admin-id'].forEach((idField) => {
            const el = document.getElementById(idField);
            if (el) el.readOnly = true;
        });
        setVal('email', user.email || '');
        setVal('phone', user.mobile || '');
        setVal('location', user.location || '');
        setVal('system-incharge', user.systemIncharge || '');
        setVal('team-name', user.tabTeamName || '');
        setVal('gst', user.gst || '');
        setVal('spouse', user.spouse || '');
        setVal('address', user.address1 || '');
        setVal('address-2', user.address2 || '');
        setVal('city', user.city || '');
        setVal('state', user.state || '');
        setVal('country', user.country || '');
        setVal('zip', user.zip || '');
    } catch (error) {
        console.error('Failed to load user details:', error);
        lockSave('Could not load this user. Check that the server is running and try again.');
    }
}

// ===== Entry point =====

async function init() {
    const user = requireRole('admin');
    if (!user) {
        return;
    }

    currentAdmin = user;

    const root = document.getElementById('app');
    const activeKey = root?.dataset.activeKey || 'users';

    renderLayout({
        user,
        activeKey,
        title: '',
        subtitle: '',
    });

    if (isCreatePage) {
        try {
            const allUsers = await getUsers();
            const nextId = generateNextDisplayId(allUsers);
            const idInput = ['member-id', 'verifier-id', 'admin-id'].find(fieldExists);
            if (idInput) {
                const el = document.getElementById(idInput);
                if (el) {
                    el.value = nextId;
                    el.readOnly = true;
                }
            }
        } catch (error) {
            console.error('Failed to prefill display ID:', error);
        }
        return;
    }

    clearFormFields();

    const targetUserId = getIdParam();
    if (!targetUserId) {
        const deleteButton = document.getElementById('delete-user');
        if (deleteButton) {
            deleteButton.disabled = true;
            deleteButton.classList.add('is-hidden');
        }
        lockSave('No user was selected. Go back to User Management and pick a user.');
        return;
    }

    await populateUserDetails(targetUserId);
}

init();
