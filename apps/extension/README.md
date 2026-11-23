# Digital Bridge help bar (browser extension)

Adds an "Accessibility help" button to every website, including sites you do not own such as LinkedIn, job boards and
government forms. Click a form field, then:

* **Read this field aloud**: its name, hint, whether it is required and what it holds now.
* **Answer by voice**: speak, and the words go into the field for you to check. It never submits anything.
* **Amharic typing**: type with English letters (for example `selam`) and put ሰላም into the field.
* **Display**: bigger text, a strong focus outline, underlined links and more contrast.

Alt+Shift+H opens and closes the bar. Esc closes it. Settings are remembered per website.

## Install from a store

Firefox Add-ons (desktop and Android) and Microsoft Edge Add-ons are free stores; publishing steps are in
[STORE.md](STORE.md). Until the listings are live, install it yourself as below.

## Install in Firefox (for testing)

1. Download `digital-bridge-help-bar.zip` from https://digital-bridge-six.vercel.app/downloads/digital-bridge-help-bar.zip.
2. Open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on** and pick the zip.
   (Temporary add-ons are removed when Firefox closes; the store version stays.)

## Install (Chrome or Edge)

1. Download this repository (Code, then Download ZIP) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`) and turn on **Developer mode**.
3. Choose **Load unpacked** and pick this `apps/extension` folder.

## Voices

The bar uses the voices on your device first. For languages your device has no voice for, it asks the Digital Bridge
API in `config.js` (open source MMS voices, if the API owner set them up). To use your own voice service, set
`voiceUrl` in `config.js`. Only the text being read is sent; form answers are never sent anywhere.

## Privacy

The extension has no special permissions. It runs on the page you are on, keeps its settings in that page's local
storage and sends nothing except text you ask it to read aloud when a remote voice is used.

`db-assist.js` is built from `apps/web-components/src/assist` by `pnpm build`; do not edit it by hand.
