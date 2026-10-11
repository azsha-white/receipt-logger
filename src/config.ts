// Public settings for the web page. Both values are public by design (anyone can see them in the
// page source), so they live in the repo. Secrets never go here.
//
// The owner pastes the two real values in after setup (docs/SETUP.md, part 4).
// Until then the page shows "Not configured yet".

/** Google Cloud OAuth client id (type "Web application"). Ends in .apps.googleusercontent.com */
export const GOOGLE_CLIENT_ID = 'PASTE_GOOGLE_CLIENT_ID_HERE';

/** Apps Script web app URL, printed by `npm run gas:deploy`. Starts with https://script.google.com/macros/s/ and ends in /exec */
export const APPS_SCRIPT_URL = 'PASTE_APPS_SCRIPT_URL_HERE';
