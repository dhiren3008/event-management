import { isEmpty, isValidPassword, PASSWORD_MIN_LENGTH } from './utils.js';
import { updateUser } from './api.js';
import { getPasswordResetUser, clearPasswordReset } from './auth.js';
import { showFormMessage, clearFormMessage } from './dom.js';

const resetForm = document.getElementById('reset-form');
const passwordInput = document.getElementById('reset-password');
const confirmInput = document.getElementById('reset-confirm');
const passwordError = document.getElementById('reset-password-error');
const confirmError = document.getElementById('reset-confirm-error');
const formMessage = document.getElementById('reset-form-message');
const submitBtn = document.getElementById('reset-submit');

// The mobile number was verified on forgot-password.html — without that
// handoff there is no account to reset, so send the visitor back.
const pendingUser = getPasswordResetUser();

function showFieldError(element, message) {
    element.textContent = message;
    element.classList.remove('is-hidden');
}

function clearFieldError(element) {
    element.textContent = '';
    element.classList.add('is-hidden');
}

// Both password fields share one toggle: each button belongs to its own
// .input-wrapper, so the field to flip is found relative to the button.
function togglePasswordVisibility(button) {
    const wrapper = button.closest('.input-wrapper');
    const input = wrapper.querySelector('.input');
    const isHidden = input.type === 'password';

    input.type = isHidden ? 'text' : 'password';
    button.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', String(isHidden));
    wrapper.querySelector('.toggle-eye').classList.toggle('is-hidden', isHidden);
    wrapper.querySelector('.toggle-eye-off').classList.toggle('is-hidden', !isHidden);
}

function initPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
        button.addEventListener('click', () => togglePasswordVisibility(button));
    });
}

function validate(password, confirmation) {
    clearFieldError(passwordError);
    clearFieldError(confirmError);

    let isValid = true;

    if (isEmpty(password)) {
        showFieldError(passwordError, 'Password is required');
        isValid = false;
    } else if (!isValidPassword(password)) {
        showFieldError(passwordError, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
        isValid = false;
    }

    if (isEmpty(confirmation)) {
        showFieldError(confirmError, 'Please reenter your password');
        isValid = false;
    } else if (confirmation !== password) {
        showFieldError(confirmError, 'Passwords do not match');
        isValid = false;
    }

    return isValid;
}

async function handleSubmit(event) {
    event.preventDefault();

    const password = passwordInput.value;
    const confirmation = confirmInput.value;
    clearFormMessage(formMessage);

    if (!validate(password, confirmation)) {
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        await updateUser(pendingUser.id, { password });
        clearPasswordReset();

        showFormMessage(
            formMessage,
            `Password reset successfully${pendingUser.name ? ` for ${pendingUser.name}` : ''}. Taking you to the login page...`,
            'success'
        );
        submitBtn.textContent = 'Redirecting...';
        setTimeout(() => {
            window.location.replace('/login.html');
        }, 1200);
    } catch (error) {
        console.error(error);
        showFormMessage(formMessage, 'Something went wrong. Please try again', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Reset Password';
    }
}

if (!pendingUser || pendingUser.id === undefined || pendingUser.id === null) {
    window.location.replace('/forgot-password.html');
} else {
    initPasswordToggles();
    resetForm.addEventListener('submit', handleSubmit);
}
