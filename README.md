# Crazyparts Quick Nav

**Version:** 5.1 · **Site:** All sites (full nav on crazyparts.com.au only)

A floating navigation panel that gives you instant access to Crazyparts from any website. On Crazyparts itself it shows a full Quick Nav panel with category links and a cart tool; on every other site it shows a compact quick-link tab.

---

## What It Does

### On crazyparts.com.au

- **Quick Nav panel** — direct links to cable sizes (0.3m, 0.5m, 1m, 2m, 3m) and any categories you add
- **Add to Cart tool** — select how many of each cable length/colour and add directly to the Crazyparts cart
- Warns if a selected item is out of stock before adding

### On any other site

- A **draggable tab** on the side of the screen
- Click to open a compact quick-link popup with links to any site you want
- Pre-configured links to **Google Sheets** and **SOS POS** (hardcoded — editable in the script)
- Drag the tab up or down to reposition it

---

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) in Chrome
2. Click **Raw** on the `.user.js` file in this repo
3. Tampermonkey will prompt to install — click **Install**
4. Visit any website — the tab appears on the right edge of the screen

---

## Notes

- The `*://*/*` match is intentional — the quick-link tab is available on every website so you can jump to Crazyparts from anywhere
- Tab position and custom links are saved via `GM_setValue` and persist across browser restarts
- Settings migrate automatically from older versions (v4)

---

## Using Multiple Scripts

If you are using several of the THVjQ Tampermonkey scripts, check the **Issues** tab — a multi-script addon with live updates across all scripts is in progress.
