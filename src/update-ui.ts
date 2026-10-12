// The "Update available" button and the version label in the header (src/version.ts does the checking).
import { PENDING_KEY, startUpdateWatch, versionKey, type VersionInfo } from './version.ts';

type Elements = { versionLabel: HTMLElement; updateButton: HTMLButtonElement; notice: HTMLElement };

function readPending(): string | null {
  try { return sessionStorage.getItem(PENDING_KEY); } catch { return null; }
}
function writePending(value: string | null) {
  try { value === null ? sessionStorage.removeItem(PENDING_KEY) : sessionStorage.setItem(PENDING_KEY, value); } catch { /* private mode */ }
}

/** Mount the version label and the update button. `versionUrl` is where version.json lives on the server. */
export function mountUpdateUi(el: Elements, current: VersionInfo, versionUrl: string, reload: () => void = () => location.reload()) {
  el.versionLabel.textContent = `v${current.version}`;
  el.versionLabel.title = `Build ${current.build}`;

  // Did we just reload for an update? Say whether it arrived.
  const pending = readPending();
  if (pending) {
    writePending(null);
    if (pending === versionKey(current)) {
      el.notice.textContent = `Updated to v${current.version}.`;
      el.notice.hidden = false;
      setTimeout(() => { el.notice.hidden = true; }, 6000);
    } else {
      // GitHub Pages can keep serving the old page for up to about ten minutes after a deploy (reported).
      el.notice.textContent = 'The update is still rolling out. Try again in a few minutes.';
      el.notice.hidden = false;
    }
  }

  let offered: VersionInfo | null = null;
  el.updateButton.addEventListener('click', () => {
    if (!offered) return;
    writePending(versionKey(offered));
    el.updateButton.disabled = true;
    el.updateButton.textContent = 'Downloading…';
    reload();
  });

  return startUpdateWatch({
    url: versionUrl,
    current,
    onUpdate: (verdict) => {
      offered = verdict.remote;
      el.updateButton.textContent = verdict.label;
      el.updateButton.hidden = false;
      el.notice.hidden = true;
    },
  });
}
