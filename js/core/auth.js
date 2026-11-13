import { API_BASE, STORAGE_KEY, RESET_STORAGE_KEY, LOGIN_PAGE, ROLE_HOME } from "./config.js";

export function saveUser(user){
    const safeUser = { ...user };
    delete safeUser.password;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(safeUser));
}

export function getUser(){
    const stored = localStorage.getItem(STORAGE_KEY);
    if(!stored){
        return null;
    }
    try{
        return JSON.parse(stored);
    }catch(error){
        return null;
    }
}

export function clearUser(){    
    localStorage.removeItem(STORAGE_KEY);
}

// Forgot-password flow: the mobile number is verified on the first page,
// then only the user id travels (sessionStorage) to the reset page so a
// refresh or a direct visit cannot pick an account to reset on its own.

export function startPasswordReset(user){
    const pending = { id: user.id, name: user.name, mobile: user.mobile };
    sessionStorage.setItem(RESET_STORAGE_KEY, JSON.stringify(pending));
}

export function getPasswordResetUser(){
    const stored = sessionStorage.getItem(RESET_STORAGE_KEY);
    if(!stored){
        return null;
    }
    try{
        return JSON.parse(stored);
    }catch(error){
        sessionStorage.removeItem(RESET_STORAGE_KEY);
        return null;
    }
}

export function clearPasswordReset(){
    sessionStorage.removeItem(RESET_STORAGE_KEY);
}

export function redirectToRoleHome(user){
    const target = ROLE_HOME[user.role] || LOGIN_PAGE;
    window.location.replace(target);
}

// The session lives in localStorage only, so it can go stale (account deleted,
// role changed). Re-check it in the background after a page guards itself.
// Network failures are ignored on purpose — a dead server must not log you out.
async function revalidateSession(user) {
    // saveUser() always writes an id, so a session without one was hand-edited
    // in devtools. Refuse it instead of skipping the check (that silent skip
    // was a full admin-panel bypass).
    if (user.id === undefined || user.id === null) {
        clearUser();
        window.location.replace(LOGIN_PAGE);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/users/${encodeURIComponent(user.id)}`);
        if (!response.ok) {
            clearUser();
            window.location.replace(LOGIN_PAGE);
            return;
        }

        const fresh = await response.json();

        // Role changed server-side, or the account was deactivated/deleted.
        if (fresh.role !== user.role || fresh.status === false) {
            clearUser();
            window.location.replace(LOGIN_PAGE);
        }
    } catch (error) {
        // Server unreachable — keep the current session.
    }
}

export function requireRole(allowedRole) {
    const user = getUser();

    if (!user) {
        window.location.replace(LOGIN_PAGE);
        return null;
    }

    if (user.role !== allowedRole) {
        redirectToRoleHome(user);
        return null;
    }

    revalidateSession(user);

    return user;
}
