import { getUser, redirectToRoleHome } from "./auth.js";
import { LOGIN_PAGE } from "./config.js";

function init() {
    const user = getUser();

    if (user) {
        redirectToRoleHome(user);
        return;
    }

    window.location.replace(LOGIN_PAGE);
}

init();