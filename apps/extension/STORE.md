# Publishing the help bar (free stores)

`pnpm build` makes both packages in `apps/web-components/dist/downloads/`:

* `digital-bridge-help-bar.zip`: the browser extension (Firefox and Edge)
* `digital-bridge-wordpress.zip`: the WordPress plugin

Privacy policy URL for every store: `https://digital-bridge-six.vercel.app/privacy.html`

## Firefox Add-ons (free; also gives one tap install on Firefox for Android)

1. Sign in at https://addons.mozilla.org/developers/ with a Firefox account.
2. Submit a New Add-on, choose **On this site**, upload `digital-bridge-help-bar.zip`.
3. Tick **Firefox for Android** as well as desktop.
4. Source code: answer that the add-on contains built code, and link the repository
   (`https://github.com/ephrathasamuel/digital-bridge`, build with `pnpm install && pnpm build`).
5. Listing: use the text below, category **Accessibility**, the icon `icons/icon-128.png`, and the privacy URL.

## Microsoft Edge Add-ons (free)

1. Register at https://partner.microsoft.com/dashboard/microsoftedge (no fee).
2. Create a new extension, upload `digital-bridge-help-bar.zip`.
3. Fill in the listing with the text below, category **Accessibility**, logo `icons/icon-128.png` (300x300 is
   recommended; scale the icon up), at least one screenshot (for example the form demo with the bar open).

## WordPress.org plugin directory (free)

1. Create an account at https://wordpress.org and submit `digital-bridge-wordpress.zip` at
   https://wordpress.org/plugins/developers/add/.
2. After review you get an SVN repository; upload the plugin folder to `trunk` and tag `1.1.0`.
3. Before submitting, set "Tested up to" in `readme.txt` to the newest WordPress version.

## Listing text

**Name:** Digital Bridge help bar

**Summary:** Read form fields aloud, answer by voice, type Amharic with English letters and make any page easier to see.

**Description:**

Digital Bridge adds an Accessibility help button to every website. Click a form field, then:

- Read the field aloud: its name, hint, whether it is required and what it holds now.
- Answer by voice: words appear live in a review box, and nothing goes into the form until you press Use this.
- Read as I move: hear each item as you reach it with Tab or the arrow keys, including tables cell by cell.
- Type Amharic with English letters (selam becomes ሰላም).
- Display: bigger text, a strong focus outline, underlined links and more contrast.

Works in English and Amharic, by keyboard (Alt+Shift+H) and screen reader. It never submits a form or sends your
answers anywhere. Open source (MIT): https://github.com/ephrathasamuel/digital-bridge

**Permissions explanation:** The extension asks for no special permissions. It runs on the pages you visit so it can
show the help bar on their forms.
