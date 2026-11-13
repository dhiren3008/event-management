import { requireRole, saveUser } from '../core/auth.js';
import { isValidEmail, isValidMobile, isValidPassword } from '../core/utils.js';
import { updateUser, getUserById, getUsers } from '../core/api.js';
import { renderLayout } from '../core/layout.js';
import { bindOverlayClose, openOverlay, showFormMessage, clearFormMessage, showToast } from '../core/dom.js';

bindOverlayClose();

function updateInitials(name) {
    const words = (name || '').trim().split(/\s+/);
    const first = words[0] ? words[0][0] : '';
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    const initials = (first + last).toUpperCase() || '?';

    const pageInitialsEl = document.querySelector('[data-profile-initials]');
    if (pageInitialsEl) {
        pageInitialsEl.textContent = initials;
    }

    const topbarAvatarEl = document.querySelector('.topbar .avatar, .avatar--button');
    if (topbarAvatarEl) {
        topbarAvatarEl.textContent = initials;
        topbarAvatarEl.setAttribute('aria-label', `Profile details — ${name || ''}`);
        topbarAvatarEl.setAttribute('title', `Profile details — ${name || ''}`);
    }
}

async function initProfile() {
    // 1. Guard check: only verifiers can access this page
    const user = requireRole('verifier');
    if (!user) return;

    // 2. Render sidebar and topbar shell
    renderLayout({
        user,
        activeKey: 'settings',
        title: '',
        subtitle: '',
    });

    updateInitials(user.name || user.email);

    // Hide unconnected topbar search
    const searchEl = document.querySelector('.search');
    if (searchEl) {
        searchEl.classList.add('is-hidden');
    }

    // Cancel / Back button
    const cancelBtn = document.querySelector('[data-cancel]');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = '/pages/verifier/settings.html';
            }
        });
    }

    // Form submit prevention on Enter
    const form = document.getElementById('user-form');
    if (form) {
        form.addEventListener('submit', (e) => e.preventDefault());
    }

    // 3. Fetch fresh copy from server
    let activeData = user;
    try {
        const fresh = await getUserById(user.id);
        if (fresh) activeData = fresh;
    } catch (e) {
        console.error('Could not fetch fresh verifier profile:', e);
    }

    const userNameEl = document.getElementById('user-name');
    const verifierIdEl = document.getElementById('verifier-id');
    const emailEl = document.getElementById('email');
    const phoneEl = document.getElementById('phone');
    const locationEl = document.getElementById('location');
    const passwordEl = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const iconEye = document.getElementById('icon-eye');
    const iconEyeOff = document.getElementById('icon-eye-off');

    // Populate inputs
    if (userNameEl) userNameEl.value = activeData.name || '';
    if (verifierIdEl) {
        verifierIdEl.value = activeData.displayId || `#${activeData.id}`;
        verifierIdEl.readOnly = true;
    }
    if (emailEl) emailEl.value = activeData.email || '';
    if (phoneEl) phoneEl.value = activeData.mobile || '';
    if (locationEl) locationEl.value = activeData.location || 'All Venues';
    if (passwordEl) passwordEl.value = activeData.password || '';

    if (togglePasswordBtn && passwordEl) {
        togglePasswordBtn.addEventListener('click', () => {
            const isHidden = passwordEl.type === 'password';
            passwordEl.type = isHidden ? 'text' : 'password';
            togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
            togglePasswordBtn.setAttribute('aria-pressed', String(isHidden));
            if (iconEye) iconEye.classList.toggle('is-hidden', isHidden);
            if (iconEyeOff) iconEyeOff.classList.toggle('is-hidden', !isHidden);
        });
    }

    // 4. Save Updates click handler
    const saveBtn = document.getElementById('btn-save-profile') || document.querySelector('[data-save]');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            clearFormMessage('profile-message');

            const newName = userNameEl?.value?.trim() || '';
            const newEmail = emailEl?.value?.trim() || '';
            const newPhone = phoneEl?.value?.trim() || '';
            const newLocation = locationEl?.value?.trim() || 'All Venues';
            const newPassword = passwordEl?.value || '';

            // Basic validation
            if (!newName) {
                showFormMessage('profile-message', 'Name cannot be empty.', 'error');
                userNameEl?.focus();
                return;
            }

            if (!newEmail || !isValidEmail(newEmail)) {
                showFormMessage('profile-message', 'Please enter a valid email address.', 'error');
                emailEl?.focus();
                return;
            }

            if (newPhone && !isValidMobile(newPhone)) {
                showFormMessage('profile-message', 'Phone must be between 10 and 12 digits.', 'error');
                phoneEl?.focus();
                return;
            }

            if (!newPassword.trim()) {
                showFormMessage('profile-message', 'Please enter a password.', 'error');
                passwordEl?.focus();
                return;
            }

            if (!isValidPassword(newPassword)) {
                showFormMessage('profile-message', 'Password must be at least 6 characters long.', 'error');
                passwordEl?.focus();
                return;
            }

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

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
                    emailEl?.focus();
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
                        phoneEl?.focus();
                        return;
                    }
                }

                const changes = {
                    name: newName,
                    email: newEmail,
                    mobile: newPhone,
                    location: newLocation,
                    password: newPassword,
                };

                const updated = await updateUser(activeData.id, changes);
                activeData = { ...activeData, ...updated, ...changes };

                // Keep session synchronized in localStorage
                saveUser(activeData);
                updateInitials(newName);

                showFormMessage('profile-message', 'Profile updated successfully!', 'success');
                showToast('Profile updated successfully!', 'success');

                const popupText = document.querySelector('.user-form__popup-text');
                if (popupText) popupText.textContent = 'Your profile details have been saved successfully.';
                openOverlay('save-overlay');

            } catch (err) {
                console.error('Failed to update profile:', err);
                showFormMessage('profile-message', 'Could not save profile changes. Please try again.', 'error');
                showToast('Could not save profile changes', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Updates';
            }
        });
    }
}

initProfile();
