=== Digital Bridge Help Bar ===
Contributors: ephrathasamuel
Tags: accessibility, forms, voice, amharic, screen reader
Requires at least: 6.3
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.1.0
License: MIT
License URI: https://opensource.org/licenses/MIT

Adds an Accessibility help bar to every form on your site: read aloud, answer by voice, Amharic typing and easier to see display options.

== Description ==

Activate the plugin and every page gets an "Accessibility help" button. Visitors click a form field, then they can:

* **Read the field aloud**: its name, hint, whether it is required and what it holds now.
* **Answer by voice**: words appear live in a review box; nothing goes into the form until they press "Use this".
* **Read as I move**: each item is read as they reach it with Tab or the arrow keys, including tables cell by cell.
* **Type Amharic** with English letters (selam becomes ሰላም).
* **Display options**: bigger text, a strong focus outline, underlined links and more contrast.

The bar works in English and Amharic, by keyboard (Alt+Shift+H) and screen reader, and never submits a form or sends answers anywhere. It follows WCAG 2.2 AA and uses colours that work for every type of colour blindness.

Digital Bridge is open source: https://github.com/ephrathasamuel/digital-bridge

== Installation ==

1. In your dashboard go to Plugins, Add New, and search for "Digital Bridge Help Bar". Or upload the plugin folder.
2. Press Activate. The help bar is on.
3. Optional: Settings, Digital Bridge, to choose the first language, the button position and a voice service.

== Frequently Asked Questions ==

= Does it send my visitors' data anywhere? =

No. Form answers stay in the visitor's browser. If you set a voice service, only the words being read aloud are sent to it, and only when the visitor's device has no voice for their language.

= Does it work with page builders and form plugins? =

Yes. It works with any standard form field, including Contact Form 7, WPForms, Gravity Forms and WooCommerce checkout.

== Privacy ==

The plugin stores no personal data. Help bar settings are kept in each visitor's own browser. See https://digital-bridge-six.vercel.app/privacy.html

== Changelog ==

= 1.1.0 =
* Review box before voice answers are used, Read as I move, arrow keys through tables.

= 1.0.0 =
* First release.
