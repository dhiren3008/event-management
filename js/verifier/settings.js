import { requireRole } from '../core/auth.js';
import { renderLayout } from '../core/layout.js';

export const VERIFIER_PROFILE_PAGE = '/pages/verifier/profile.html';

export function setupSettingsNavigation() {
    const rows = document.querySelectorAll('.settings-row');
    rows.forEach((row, index) => {
        row.addEventListener('click', () => {
            rows.forEach((r) => r.classList.remove('is-active'));
            row.classList.add('is-active');

            if (index === 0 || row.id === 'btn-profile-row' || row.dataset.action === 'profile') {
                window.location.href = VERIFIER_PROFILE_PAGE;
            }
        });
    });
}

function init() {
    const user = requireRole('verifier');
    if (!user) {
        return;
    }

    renderLayout({
        user,
        activeKey: 'settings',
        title: '',
        subtitle: '',
    });

    // Hide unconnected topbar search on settings
    const searchEl = document.querySelector('.search');
    if (searchEl) {
        searchEl.classList.add('is-hidden');
    }

    setupSettingsNavigation();
}

init();
