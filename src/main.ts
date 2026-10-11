import './style.css';
import { APPS_SCRIPT_URL, GOOGLE_CLIENT_ID } from './config.ts';
import { callApi, checkConfig, type ApiCall } from './api.ts';
import { decodeJwtPayload } from './token.ts';
import { sniffImageFormat, spike4Verdict } from './files.ts';
import { mountSignInButton } from './gis.ts';

declare const __BUILD_ID__: string;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const banner = $('config-banner');
const signinButton = $('signin-button');
const signinStatus = $('signin-status');
const whoamiBtn = $<HTMLButtonElement>('whoami-btn');
const whoamiOut = $('whoami-out');
const testrowBtn = $<HTMLButtonElement>('testrow-btn');
const testrowOut = $('testrow-out');
const photoInput = $<HTMLInputElement>('photo-input');
const photoOut = $('photo-out');

$('build-id').textContent = __BUILD_ID__;
$('ua').textContent = navigator.userAgent;

let idToken: string | null = null;
const config = checkConfig(GOOGLE_CLIENT_ID, APPS_SCRIPT_URL);

function setBusy(busy: boolean) {
  const ready = config.configured && idToken !== null && !busy;
  whoamiBtn.disabled = !ready;
  testrowBtn.disabled = !ready;
}

function show(out: HTMLElement, call: ApiCall) {
  const head = `${call.result.ok ? 'OK' : 'ERROR ' + call.result.error.code} · ${call.ms} ms · HTTP ${call.status ?? 'none'}`;
  out.textContent = `${head}\n\n${JSON.stringify(call.result, null, 2)}`;
  out.dataset.state = call.result.ok ? 'ok' : 'error';
}

async function run(action: string, out: HTMLElement) {
  if (!idToken) return;
  setBusy(true);
  out.textContent = `Calling ${action}…`;
  out.dataset.state = '';
  try {
    show(out, await callApi(APPS_SCRIPT_URL, idToken, action));
  } finally {
    setBusy(false);
  }
}

function onToken(token: string) {
  idToken = token;
  const claims = decodeJwtPayload(token);
  const mins = claims?.exp ? Math.round((claims.exp * 1000 - Date.now()) / 60000) : null;
  signinStatus.textContent = `Signed in with Google as ${claims?.email ?? 'unknown'}` +
    (mins !== null ? ` (sign-in valid for about ${mins} min).` : '.') +
    ' The script decides whether this account is a household member.';
  setBusy(false);
}

if (!config.configured) {
  banner.hidden = false;
  banner.innerHTML = '<strong>Not configured yet.</strong> The owner still needs to paste in: ' +
    config.missing.map((m) => `<em>${m}</em>`).join(' and ') +
    '. See docs/SETUP.md in the repository. The photo picker check below works without it.';
  signinStatus.textContent = 'Sign-in is off until the Google client id is set.';
} else {
  mountSignInButton(signinButton, GOOGLE_CLIENT_ID, onToken).catch((err: unknown) => {
    signinStatus.textContent = `Google sign-in failed to load: ${err instanceof Error ? err.message : String(err)}`;
  });
}

whoamiBtn.addEventListener('click', () => void run('whoami', whoamiOut));
testrowBtn.addEventListener('click', () => void run('test.add_row', testrowOut));

photoInput.addEventListener('change', async () => {
  const file = photoInput.files?.[0];
  if (!file) {
    photoOut.textContent = 'No file picked.';
    photoOut.dataset.state = '';
    return;
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffImageFormat(head);
  const verdict = spike4Verdict(file.type, sniffed);
  photoOut.textContent = [
    verdict.summary,
    '',
    `Name:       ${file.name}`,
    `MIME type:  ${file.type || '(empty)'}`,
    `Real bytes: ${sniffed}`,
    `Size:       ${(file.size / 1024).toFixed(0)} KB`,
  ].join('\n');
  photoOut.dataset.state = verdict.pass ? 'ok' : 'error';
});

setBusy(false);
