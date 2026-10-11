# Owner setup guide (milestone M0)

This guide is for **the owner**: whichever of you will upload most receipts. The Google Sheet, the receipt photos and the small server program (an "Apps Script") all live in the owner's Google account. The other person only ever signs in.

Do every step while signed in to **the owner's Google account**. It takes about 45 minutes. Nothing here costs money.

When you finish, the web page at **https://azsha-white.github.io/receipt-logger/** will let either of you sign in, and you will run four quick checks on your phones (Part 5).

What you need:
- The computer that has the `Receipt Logger` folder, with Node.js installed (it already is on the computer this was built on).
- Both of your Gmail addresses.
- Both phones, plus a computer with Chrome.

---

## Part 1. Turn on the Apps Script API (2 minutes)

1. Open Chrome and make sure the owner's Google account is the one signed in (click your picture in the top-right corner of google.com to check).
2. Go to **https://script.google.com/home/usersettings**
3. Find **Google Apps Script API** and click the switch so it says **On**.

---

## Part 2. Create the Sheet and the script (15 minutes)

### Open a terminal in the project folder
1. In File Explorer, open the `Receipt Logger` folder (the one that contains `package.json`).
2. Click once in the address bar at the top of the window (where the folder path is shown), type `powershell`, and press **Enter**. A blue or black window opens. That is the terminal. You type each command below into it and press **Enter**.

### Log in, create, and upload
3. Type `npm install` and press Enter. Wait until the prompt comes back (about a minute). You only do this once.
4. Type `npm run gas:login` and press Enter.
   - A browser tab opens. Choose **the owner's** Google account.
   - Click **Allow** (or **Continue**) on the screens that ask for access. This lets the `clasp` tool on this computer manage your Apps Script projects.
   - The tab says you are logged in. Close it and go back to the terminal.
5. Type `npm run gas:create` and press Enter.
   - It prints two links: "Created new document" (your new Google Sheet, named **Receipt Logger**) and "Created new script".
   - It also creates a file called `.clasp.json` in the folder. Keep it. It tells this computer which script is yours. It is not a password.
6. Type `npm run gas:push` and press Enter. It uploads the program code to your script. You should see a list of files ending with "Pushed 4 files." (The exact count may differ; any success message is fine.)

### Run setup once
7. Open **Google Drive** (drive.google.com) and open the Sheet named **Receipt Logger**.
8. In the Sheet's menu bar click **Extensions → Apps Script**. The script editor opens in a new tab.
9. In the file list on the left, click **Setup.gs**.
10. In the toolbar above the code, there is a drop-down list of function names. Choose **setup**. Then click **Run**.
11. A box says **Authorization required**. Click **Review permissions**.
    - Choose the owner's account.
    - You will see **"Google hasn't verified this app"**. This is expected: the app is yours, and only you are approving it. Click **Advanced**, then **Go to Receipt Logger (unsafe)**.
    - The next screen lists what the script may do: see and edit *this one spreadsheet*, and connect to an external service (to check sign-ins with Google). Click **Allow**.
12. The **Execution log** at the bottom shows lines such as "Settings: created with default keys" and ends with "Execution completed".
13. Go back to the Sheet tab. You now have four tabs at the bottom: **Settings, Receipts, Items, Categories**.

### Fill in Settings
14. Click the **Settings** tab. In the **Value** column (column B), fill in:
    - `member_1_name`: the owner's first name (for example `Michael`)
    - `member_1_email`: the owner's Gmail address
    - `member_2_name`: the other person's first name (for example `Sarah`)
    - `member_2_email`: the other person's Gmail address
    - Leave `google_client_id` empty for now. You fill it in during Part 3.
    - Do not change column A or row 1.
15. Go back to the Apps Script tab and click **Run** again (with **setup** still selected). This puts your two names into the "share" column headings of the Receipts and Items tabs.

### Publish the script as a web app
16. Back in the terminal, type `npm run gas:deploy` and press Enter.
17. It ends by printing a **Web app URL**, a long line that starts with `https://script.google.com/macros/s/` and ends with `/exec`. Copy it into a note. You need it in Part 4.
18. Check it worked: paste that URL into a new Chrome tab. You should see a short line of text that starts with `{"ok":true,"data":{"service":"receipt-logger"`.
19. Check the access settings: in the Apps Script tab click **Deploy → Manage deployments**. The deployment called "receipt-logger web app" should say **Web app**, **Execute as: Me**, and **Who has access: Anyone**. If it says anything else, write down what it says and report it (see Part 6).

Later, if the program code changes, running `npm run gas:push` and then `npm run gas:deploy` again updates the same web app. The URL stays the same.

---

## Part 3. Create the Google sign-in client (10 minutes)

This makes the "Sign in with Google" button work. It only asks Google *who* is signing in (name and email). It never gets access to your Gmail, Drive or Sheets.

1. Go to **https://console.cloud.google.com/** while signed in as the owner. If it asks you to accept terms of service, accept them.
2. Create a project:
   - Click the project picker at the top of the page (it may say "Select a project").
   - Click **New project**, name it `Receipt Logger`, and click **Create**.
   - When it finishes, make sure `Receipt Logger` is the project shown at the top.
3. In the search bar at the top, type **Google Auth Platform** and open it. (Older screens call this **APIs & Services → OAuth consent screen**.) Click **Get started**.
   - **App name:** `Receipt Logger`
   - **User support email:** the owner's email
   - **Audience:** choose **External**
   - **Contact information:** the owner's email
   - Tick the box to agree to the policy, then click **Create**.
4. Click **Audience** in the left menu. Under **Test users** click **Add users**, enter **both** of your Gmail addresses, and click **Save**. Leave the publishing status as **Testing**. Only the people on this list can sign in, which is what you want.
5. Click **Clients** in the left menu, then **Create client**.
   - **Application type:** **Web application**
   - **Name:** `Receipt Logger web`
   - Under **Authorized JavaScript origins** click **Add URI** and type exactly:
     `https://azsha-white.github.io`
     (no slash at the end, and no `/receipt-logger` part.)
   - Leave **Authorized redirect URIs** empty.
   - Click **Create**.
6. A box shows the **Client ID**, a long value ending in `.apps.googleusercontent.com`. Copy it into your note. Ignore the "Client secret": this app never uses it, so do not paste it anywhere.
7. Open the **Receipt Logger** Sheet, go to the **Settings** tab, and paste the Client ID into the **Value** cell next to `google_client_id`.

Google says new sign-in settings can take a few minutes, occasionally longer, to start working.

---

## Part 4. Put the two values into the web page (5 minutes)

The web page needs the same two values: the Client ID (Part 3) and the Web app URL (Part 2). Neither is a secret, so they live in a public file.

**Option A, on the GitHub website (no terminal):**
1. Sign in to github.com with the account that owns the repository (`azsha-white`).
2. Open **https://github.com/azsha-white/receipt-logger/blob/main/src/config.ts**
3. Click the **pencil** icon ("Edit this file").
4. Replace `PASTE_GOOGLE_CLIENT_ID_HERE` with the Client ID. Keep the single quotes around it.
5. Replace `PASTE_APPS_SCRIPT_URL_HERE` with the Web app URL. Keep the single quotes around it.
   The two lines should end up looking like this (with your own values):
   ```ts
   export const GOOGLE_CLIENT_ID = '1234567890-abc123.apps.googleusercontent.com';
   export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```
6. Click **Commit changes**, then **Commit changes** again in the box that appears.
7. Click the **Actions** tab at the top of the repository. Wait for the newest run to show a green tick (about 1–2 minutes).

**Option B, in the terminal (for whoever is comfortable with git):** edit `src/config.ts` the same way, then run
`git add src/config.ts .clasp.json`, `git commit -m "Configure sign-in client and script URL"`, `git push`.
(`.clasp.json` holds only the script's id. It is safe to publish, and committing it lets another computer push script updates.)

**Check:** open **https://azsha-white.github.io/receipt-logger/**. The yellow "Not configured yet" box is gone and a **Sign in with Google** button appears. If the yellow box is still there, wait a minute and reload.

---

## Part 5. The four checks ("spikes") on real devices (15 minutes)

These checks prove the design works on your actual phones before any more is built. Run them on **three browsers**:
- **iPhone, Safari**
- **Android, Chrome**
- **A computer, Chrome**

On each one, open **https://azsha-white.github.io/receipt-logger/**.

Each result box on the page starts with **OK** (green edge) or **ERROR** plus a code (red edge), and shows how many milliseconds (ms) the call took. Write down what each box says, or take a screenshot.

### Check 1: the page can talk to the script
1. Tap **Sign in with Google** and choose your account.
2. Tap **Call whoami**.
3. **Pass:** the box says `OK`, and shows your email, your name and `member_index` (1 for the owner, 2 for the other person).
4. **Fail:** the box says `ERROR NETWORK`. Take a screenshot. This is the most important result to report, because it changes how the app must be built.
5. Write down the **ms** number, and also the number from a second tap.

### Check 2: only household members get in
1. Tap **Call whoami** twice. The first reply says `"token_cache": "miss"` or `"hit"`; the second must say `"token_cache": "hit"`. (That means the script remembered your verified sign-in instead of asking Google again.)
2. Do this once, on the computer: in the Sheet's **Settings** tab, change your own email in the Value column, for example by adding an `x` to the front of it. Go back to the page and click **Call whoami**.
   **Pass:** `ERROR NOT_A_MEMBER`.
3. **Undo the change in the Sheet**, click **Call whoami** again, and confirm it says `OK`.

### Check 3: the second person sees no permission screen
1. The **other person** (not the owner) does Check 1 on their own phone.
2. **Pass:** they only see Google's normal "choose an account / sign in to Receipt Logger" screens. They are **never** asked to allow access to Google Sheets or Google Drive. Whoami then says `OK` with `member_index: 2`.
3. Report which screens they saw. A screenshot of anything unexpected helps.

### Check 4: the photo picker gives a readable photo (phones only)
1. Tap **Choose a photo**.
2. Pick **Photo Library** and choose a recent photo taken with the phone's camera. (iPhones store these as HEIC by default, which the receipt reader cannot read, so this is the important case.)
3. **Pass:** the box starts with `PASS: the file is really JPEG` (PNG or WebP is also fine).
   **Fail:** it starts with `FAIL`.
4. Repeat with **Take Photo** (iPhone) or **Camera** (Android), photographing any piece of paper.
5. Copy the whole text of the box each time.

### Also on the computer: the test row and the header guard
1. Click **Add test row**. **Pass:** `OK` with a `row_number`. Open the Sheet's **Receipts** tab and you will see a row with Store `TEST ROW (M0)`.
2. In the Receipts tab, change cell **C1** from `Store` to `Shop`. Click **Add test row** again.
   **Pass:** `ERROR SCHEMA_MISMATCH`, with a message saying column C should be "Store".
3. Change C1 back to `Store`. Then delete the TEST ROW rows (right-click the row number → **Delete row**).

---

## Part 6. What to report back

Copy this, fill it in, and send it (screenshots welcome):

```
Part 2 step 19 (Manage deployments says):
Check 1 whoami  — iPhone Safari:     OK / ERROR ____   ms: ____ then ____
                — Android Chrome:    OK / ERROR ____   ms: ____ then ____
                — Computer Chrome:   OK / ERROR ____   ms: ____ then ____
Check 2 cache hit on 2nd tap:        yes / no
Check 2 changed email → NOT_A_MEMBER: yes / no
Check 3 other person saw a Sheets/Drive permission screen: yes / no   (which phone: ____)
Check 4 iPhone library photo:  (paste box text)
Check 4 iPhone camera photo:   (paste box text)
Check 4 Android library photo: (paste box text)
Check 4 Android camera photo:  (paste box text)
Test row OK: yes / no      Header edit → SCHEMA_MISMATCH: yes / no
Anything odd:
```

---

## If something goes wrong

| What you see | What it usually means | What to do |
|---|---|---|
| `npm run gas:create` says the Apps Script API is not enabled | Part 1 not done, or done on a different account | Redo Part 1 on the owner's account, wait 2 minutes, retry |
| The sign-in button says "origin not allowed" or "invalid client" | The JavaScript origin in Part 3 step 5 is not exactly `https://azsha-white.github.io`, or Google has not picked it up yet | Fix the origin, wait 5–10 minutes, reload |
| `ERROR BAD_TOKEN` "different app (client id mismatch)" | The Client ID in the Sheet's Settings tab and in `src/config.ts` are different | Make them identical |
| `ERROR BAD_TOKEN` "no google_client_id yet" | Part 3 step 7 not done | Paste the Client ID into Settings |
| `ERROR NOT_A_MEMBER` for one of you | The email in Settings does not match the Google account you signed in with | Fix the email in Settings |
| `ERROR NOT_JSON` showing a Google page | The script is not authorized or not deployed as a web app | Repeat Part 2 steps 10–11 (Run setup and Allow), then `npm run gas:deploy` |
| `ERROR SCHEMA_MISMATCH` | A heading in row 1 of a tab was changed | Change it back to what the message says. Sorting and filtering are fine; renaming or moving row 1 is not |
| "Access blocked" when signing in | The account is not on the Test users list | Part 3 step 4 |
