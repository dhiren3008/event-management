import { isEmpty, isValidMobile } from './utils.js';
import { findUserByMobile } from './api.js';
import { startPasswordReset } from './auth.js';
import { showFormMessage, clearFormMessage } from './dom.js';

const mobileForm = document.getElementById('forgot-form');
const mobileInput = document.getElementById('forgot-mobile');
const mobileError = document.getElementById('forgot-mobile-error');
const formMessage = document.getElementById('forgot-form-message');
const submitBtn = document.getElementById('forgot-submit');

function showFieldError(element, message) {
    element.textContent = message;
    element.classList.remove('is-hidden');
}

function clearFieldError(element) {
    element.textContent = '';
    element.classList.add('is-hidden');
}

function validate(mobile) {
    clearFieldError(mobileError);

    if (isEmpty(mobile)) {
        showFieldError(mobileError, 'Mobile number is required');
        return false;
    }
    if (!isValidMobile(mobile)) {
        showFieldError(mobileError, 'Enter a valid mobile number (10 to 12 digits)');
        return false;
    }
    return true;
}

async function handleSubmit(event) {
    event.preventDefault();

    const mobile = mobileInput.value.trim();
    clearFormMessage(formMessage);

    if (!validate(mobile)) {
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking...';

    try {
        const user = await findUserByMobile(mobile);

        if (!user) {
            showFieldError(mobileError, 'No account found with this mobile number');
            return;
        }

        // Number verified — hand the account over to the reset page.
        startPasswordReset(user);
        window.location.href = '/reset-password.html';
    } catch (error) {
        console.error(error);
        showFormMessage(formMessage, 'Something went wrong. Please try again', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Continue';
    }
}

mobileInput.setAttribute('minlength', '10');
mobileInput.setAttribute('maxlength', '12');
mobileInput.setAttribute('pattern', '[0-9]{10,12}');
mobileInput.setAttribute('inputmode', 'numeric');

mobileInput.addEventListener('keydown', (e) => {
    if (e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !/^\d$/.test(e.key)) {
        e.preventDefault();
    }
});

mobileInput.addEventListener('input', () => {
    mobileInput.value = mobileInput.value.replace(/\D/g, '').slice(0, 12);
});

mobileForm.addEventListener('submit', handleSubmit);
