export const API_BASE = '';

export const STORAGE_KEY = 'infinite_success_user';

// Pending password reset: carries the verified user from the
// forgot-password page to the reset-password page (sessionStorage only).
export const RESET_STORAGE_KEY = 'infinite_success_reset_user';

export const LOGIN_PAGE = '/login.html';

export const ROLE_HOME = {
    admin: '/pages/admin/dashboard.html',
    member: '/pages/member/dashboard.html',
    verifier: '/pages/verifier/dashboard.html',
};

// Topbar avatar (admin only) opens the profile sheet.
export const PROFILE_PAGE = '/pages/admin/profile.html';

export const ROLE_MENU = {
    admin: [
        { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: ROLE_HOME.admin },
        { key: 'events', label: 'Event Management', icon: 'events', href: '/pages/admin/events.html' },
        { key: 'users', label: 'User Management', icon: 'users', href: '/pages/admin/users.html' },
        { key: 'settings', label: 'Settings', icon: 'settings', href: '/pages/admin/settings.html' },
        { key: 'logout', label: 'Log out', icon: 'logout', action: 'logout' },
    ],
    member: [
        { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: ROLE_HOME.member },
        { key: 'events', label: 'Events', icon: 'events', href: '/pages/member/events.html' },
        { key: 'tickets', label: 'My Tickets', icon: 'ticket', href: '/pages/member/tickets.html' },
        { key: 'billing', label: 'Billing', icon: 'billing', href: '/pages/member/billing.html' },
        { key: 'settings', label: 'Settings', icon: 'settings', href: '/pages/member/settings.html' },
        { key: 'logout', label: 'Log out', icon: 'logout', action: 'logout' },
    ],
    verifier: [
        { key: 'events', label: 'Events', icon: 'events', href: ROLE_HOME.verifier },
        { key: 'reports', label: 'Reports', icon: 'users', href: '/pages/verifier/reports.html' },
        { key: 'settings', label: 'Settings', icon: 'settings', href: '/pages/verifier/settings.html' },
        { key: 'logout', label: 'Log out', icon: 'logout', action: 'logout' },
    ],
};

