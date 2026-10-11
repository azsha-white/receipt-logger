// Google Identity Services: the "Sign in with Google" button. Identity only (openid email profile);
// the page never asks Google for Sheets or Drive access.

type CredentialResponse = { credential: string };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: { client_id: string; callback: (r: CredentialResponse) => void; auto_select?: boolean }): void;
          renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
        };
      };
    };
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

/** Load GIS and render the button into `container`; `onToken` receives each new id token. */
export async function mountSignInButton(container: HTMLElement, clientId: string, onToken: (idToken: string) => void): Promise<void> {
  await loadScript(GIS_SRC);
  const id = window.google?.accounts.id;
  if (!id) throw new Error('Google sign-in loaded but did not initialise.');
  id.initialize({ client_id: clientId, callback: (r) => onToken(r.credential), auto_select: false });
  id.renderButton(container, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular' });
}
