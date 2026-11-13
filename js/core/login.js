import { isEmpty, isValidEmail, isValidMobile, normalizeEmail } from './utils.js';
import { authenticateUser, findUserByMobile } from './api.js';
import { saveUser, redirectToRoleHome } from './auth.js';
import { showFormMessage, clearFormMessage } from './dom.js';


// Login passwords are capped at 10 characters. Kept local to this page because
// the cap is a login-form rule, not a project-wide password policy.
const PASSWORD_MAX_LENGTH = 10;

const tabBtn = document.querySelectorAll('.tabs__btn');
const emailForm = document.getElementById('email-form');
const mobileForm = document.getElementById('mobile-form');
const mobileInput = document.getElementById('mobile');

// eye
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('toggle-password');
const iconEye = document.getElementById('icon-eye');
const iconEyeOff = document.getElementById('icon-eye-off');

// email
const emailInput = document.getElementById('email');
const emailError = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');

// email form
const emailMessage = document.getElementById('email-form-message');
const emailSubmitBtn = document.getElementById('email-submit');

// mobile form
const mobileError = document.getElementById('mobile-error');
const mobileMessage = document.getElementById('mobile-form-message');
const mobileSubmitBtn = document.getElementById('mobile-submit');


const form = {
    email: emailForm,
    mobile: mobileForm,
};

function showTab(tabName) { 
    tabBtn.forEach((button) => {
        const isActive = button.dataset.tab === tabName;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', String((isActive)));
    });

    Object.entries(form).forEach(([name, formEl]) => {
        formEl.classList.toggle('is-hidden', name !== tabName);
    });

    // Errors belong to the tab they were raised on — drop them on switch.
    clearFieldError(emailError);
    clearFieldError(passwordError);
    clearFieldError(mobileError);
    clearFormMessage(emailMessage);
    clearFormMessage(mobileMessage);
}

function initTabs() {
    tabBtn.forEach((button) => {
        button.addEventListener('click', () => {
            showTab(button.dataset.tab);
        });
    });
}

// eye
function togglePasswordVisibility() {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    togglePasswordBtn.setAttribute('aria-pressed', String(isHidden));
    iconEye.classList.toggle('is-hidden', isHidden);
    iconEyeOff.classList.toggle('is-hidden', !isHidden);
}

function initPasswordToggle(){
    togglePasswordBtn.addEventListener('click', togglePasswordVisibility);
}

function initMobileInput() {
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
}
initMobileInput();

// `maxlength` handles typing and pasting, but not a value a password manager or
// script writes straight into `.value` — trim that too so the field can never
// hold more than the cap validateEmailForm() checks.
function initPasswordLimit() {
    passwordInput.addEventListener('input', () => {
        if (passwordInput.value.length > PASSWORD_MAX_LENGTH) {
            passwordInput.value = passwordInput.value.slice(0, PASSWORD_MAX_LENGTH);
        }
    });
}

// email
function showFieldError(element, message) {
    element.textContent = message;
    element.classList.remove('is-hidden');
}

function clearFieldError(element) {
    element.textContent = '';
    element.classList.add('is-hidden');
}

function validateEmailForm(email, password) {
    clearFieldError(emailError);
    clearFieldError(passwordError);
    
    let isValid = true;
    if (isEmpty(email)) {
        showFieldError(emailError, 'Email is required');
        isValid = false;
    }else if (!isValidEmail(email)) {
        showFieldError(emailError, 'Enter a valid email address');
        isValid = false;
    }

    if (isEmpty(password)) {
        showFieldError(passwordError, 'Password is required');
        isValid = false;
    } else if (password.length > PASSWORD_MAX_LENGTH) {
        showFieldError(passwordError, `Password cannot be more than ${PASSWORD_MAX_LENGTH} characters`);
        isValid = false;
    }
    return isValid;
}

async function handleEmailSubmit(event) {
    event.preventDefault();

    const email = normalizeEmail(emailInput.value);
    const password = passwordInput.value;
    clearFormMessage(emailMessage);

    if (!validateEmailForm(email, password)) {
        return;
    }

    emailSubmitBtn.disabled = true;
    emailSubmitBtn.textContent = 'Logging in...';

    try {
        const result = await authenticateUser(email, password);

        if (!result.ok) {
            showFormMessage(
                emailMessage,
                result.reason === 'disabled'
                    ? 'This account has been deactivated. Contact your administrator.'
                    : 'Invalid email or password'
            );
            return;
        }

        saveUser(result.user);
        redirectToRoleHome(result.user);
    } catch(error){
        console.error(error);
        showFormMessage(emailMessage, 'Something went wrong. Please try again');
    } finally{
        emailSubmitBtn.disabled = false;
        emailSubmitBtn.textContent = 'Login';
    }
}

function initEmailForm() {
    emailForm.addEventListener('submit', handleEmailSubmit);
}

// mobile

async function handleMobileSubmit(event) {
    event.preventDefault();

    const mobile = mobileInput.value.trim();
    clearFieldError(mobileError);
    clearFormMessage(mobileMessage);

    if (!isValidMobile(mobile)) {
        showFieldError(mobileError, 'Enter a valid mobile number (10 to 12 digits)');
        return;
    }

    mobileSubmitBtn.disabled = true;
    mobileSubmitBtn.textContent = 'Sending...';

    try {
        const user = await findUserByMobile(mobile);

        if (!user) {
            showFieldError(mobileError, 'No account found with this mobile number');
            return;
        }

        showFormMessage(
            mobileMessage,
            `Hi ${user.name}! OTP login is not enabled yet — please log in with your email and password.`,
            'success'
        );
    } catch (error) {
        console.error(error);
        showFormMessage(mobileMessage, 'Something went wrong. Please try again');
    } finally {
        mobileSubmitBtn.disabled = false;
        mobileSubmitBtn.textContent = 'Get OTP';
    }
}

function initMobileForm() {
    mobileForm.addEventListener('submit', handleMobileSubmit);
}

// init
initTabs();
initPasswordToggle();
initPasswordLimit();
initEmailForm();
initMobileForm();