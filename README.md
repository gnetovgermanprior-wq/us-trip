# Orlando & New York trip planner

One page (`index.html`) that everyone opens to suggest and see activities for each day of the trip
(24 Dec 2026 – 3 Jan 2027). Everything is free: GitHub Pages hosts the page, Firebase (Spark plan)
stores the shared suggestions, and microlink.io turns pasted links into preview cards.

Without setup the page runs in **demo mode**: it works, but suggestions are saved only in your own browser.
Do the steps below once (about 15 minutes) to make it shared.

## 1. Create the free database (Firebase)
1. Go to https://console.firebase.google.com and sign in with your Google account.
2. **Add project** → name it e.g. `us-trip` → you can switch Google Analytics off → **Create**.
3. Left menu **Build → Firestore Database → Create database** → pick a location (e.g. `eur3`) → **Start in production mode**.
4. Open the **Rules** tab, paste everything from `firestore.rules`, replace `YOUR-EMAIL@gmail.com`
   with your Google email (add your girlfriend's too if she should approve: `['a@gmail.com', 'b@gmail.com']`) → **Publish**.
5. Left menu **Build → Authentication → Get started → Google → Enable** → choose a support email → **Save**.
6. Gear icon **Project settings → General → Your apps → `</>` (Web)** → nickname `site` → **Register app**.
   Copy the `firebaseConfig = { ... }` object it shows.

## 2. Paste the settings into index.html
Near the top of `index.html`:
```js
window.TRIP_CONFIG = {
  firebase: { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." },
  admins: ["your-email@gmail.com"]
};
```
(The Firebase web config is meant to be public; the rules from step 1 are what protect the data.)

## 3. Put it online (GitHub Pages)
1. The code lives in your GitHub repo. In the repo: **Settings → Pages → Source: Deploy from a branch → `main` / root → Save**.
2. After a minute the site is at `https://<your-github-name>.github.io/<repo-name>/`.
3. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain** → `<your-github-name>.github.io`.

Share the link. Anyone can add suggestions and like them; you click **Admin sign in** (Google) to approve,
edit or delete. Approved cards move into the **Approved plan** tab, sorted by time next to the flights.

## Notes
- Link previews use microlink.io's free tier (about 50 previews a day, no key). If a site blocks it,
  just type the name; a festive placeholder image is used.
- Flights and cities are in the `DAYS` list in `index.html` if anything changes.
