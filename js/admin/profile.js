import { requireRole, saveUser } from '../core/auth.js';
import { updateUser, getUserById, getUsers } from '../core/api.js';
import { renderLayout } from '../core/layout.js';
import { bindOverlayClose, openOverlay, showFormMessage, clearFormMessage } from '../core/dom.js';
import { isValidEmail, isValidMobile } from '../core/utils.js';

// Profile page — admin editing their own account.
// Intentionally does NOT import user-form.js to avoid the double [data-save]
// listener that would call createUser() (treating the missing ?id= as a new
// account creation) before the real update runs.

bindOverlayClose();

const user = requireRole('admin');

function updateInitials(name) {
    const words = (name || '').trim().split(/\s+/);
    const first = words[0] ? words[0][0] : '';
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    const initials = (first + last).toUpperCase() || '?';

    const initialsEl = document.querySelector('[data-profile-initials]');
    if (initialsEl) {
        initialsEl.textContent = initials;
    }

    const topbarAvatar = document.querySelector('.topbar .avatar, .avatar--button');
    if (topbarAvatar) {
        topbarAvatar.textContent = initials;
        topbarAvatar.setAttribute('aria-label', `Profile details — ${name || ''}`);
        topbarAvatar.setAttribute('title', `Profile details — ${name || ''}`);
    }
}

async function initProfile() {
    if (!user) return;

    renderLayout({
        user,
        activeKey: 'profile',
        title: '',
        subtitle: '',
    });

    updateInitials(user.name || user.email);

    // Fetch a fresh copy so we show any server-side changes.
    let activeData = user;
    try {
        const fresh = await getUserById(user.id);
        if (fresh) activeData = fresh;
    } catch (e) {
        console.error(e);
    }

    const userNameEl = document.getElementById('user-name');
    const adminIdEl  = document.getElementById('admin-id');
    const emailEl    = document.getElementById('email');
    const phoneEl    = document.getElementById('phone');

    if (userNameEl) userNameEl.value = activeData.name        || '';
    if (adminIdEl)  adminIdEl.value  = activeData.displayId   || `#${activeData.id}`;
    if (emailEl)    emailEl.value    = activeData.email        || '';
    if (phoneEl)    phoneEl.value    = activeData.mobile       || '';

    // Cancel / Back button
    const cancelBtn = document.querySelector('[data-cancel]');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = '/pages/admin/dashboard.html';
            }
        });
    }

    // Form submit prevention on Enter
    const form = document.getElementById('user-form');
    if (form) {
        form.addEventListener('submit', (e) => e.preventDefault());
    }

    // Wire up the Save button (single listener — no user-form.js involved).
    const saveBtn = document.querySelector('[data-save]');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            clearFormMessage('profile-message');

            const newName      = userNameEl?.value?.trim() || '';
            const newEmail     = emailEl?.value?.trim()    || '';
            const newPhone     = phoneEl?.value?.trim()    || '';
            const newDisplayId = adminIdEl?.value?.trim()  || activeData.displayId;

            // Name, email and mobile validation
            if (!newName) {
                showFormMessage('profile-message', 'Please enter a user name.', 'error');
                return;
            }
            if (!newEmail || !isValidEmail(newEmail)) {
                showFormMessage('profile-message', 'Please enter a valid email address.', 'error');
                return;
            }
            if (newPhone && !isValidMobile(newPhone)) {
                showFormMessage('profile-message', 'Phone must be between 10 and 12 digits.', 'error');
                return;
            }

            saveBtn.disabled = true;

            try {
                // Email and mobile uniqueness check against other users
                const allUsers = await getUsers();
                const normalizedEmail = newEmail.toLowerCase();
                const duplicateEmail = allUsers.find((u) =>
                    u.email &&
                    u.email.trim().toLowerCase() === normalizedEmail &&
                    Number(u.id) !== Number(activeData.id)
                );
                if (duplicateEmail) {
                    showFormMessage('profile-message', 'This email address is already in use by another user.', 'error');
                    return;
                }

                if (newPhone) {
                    const duplicatePhone = allUsers.find((u) =>
                        u.mobile &&
                        u.mobile.trim() === newPhone &&
                        Number(u.id) !== Number(activeData.id)
                    );
                    if (duplicatePhone) {
                        showFormMessage('profile-message', 'This phone number is already in use by another user.', 'error');
                        return;
                    }
                }

                const changes = {
                    name:      newName,
                    email:     newEmail,
                    mobile:    newPhone,
                    displayId: newDisplayId,
                };

                const updated = await updateUser(activeData.id, changes);
                activeData = { ...activeData, ...updated, ...changes };

                // Keep the in-memory session fresh; saveUser strips the password.
                saveUser(activeData);
                updateInitials(newName);

                const popup = document.querySelector('.user-form__popup-text');
                if (popup) popup.textContent = 'Profile successfully updated!';
                openOverlay('save-overlay');
            } catch (err) {
                console.error('Failed to update profile:', err);
                showFormMessage('profile-message', 'Could not save profile. Please try again.', 'error');
            } finally {
                saveBtn.disabled = false;
            }
        });
    }
}

initProfile();
