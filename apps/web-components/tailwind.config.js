// apps/web-components/tailwind.config.js
// Default palette, safe for every type of colour blindness (Okabe-Ito blue and amber, told apart by lightness too).
// Class names kept from the first palette. Contrast (WCAG formula):
//   ink #0B0F19 on surface #F4F6FA = 17.7:1 · primary #0B3C8C on surface = 9.5:1 · white on primary = 10.3:1
//   primary-dark #082D6B on tint #E4ECF8 = 11.0:1 · borders #5F6B7D on surface = 5.0:1 · chip #5A3A00 on #FFF0C2 = 9.1:1
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        parchment: '#F4F6FA',
        sand: { DEFAULT: '#5F6B7D', light: '#E6EBF2' },
        terracotta: { DEFAULT: '#0B3C8C', dark: '#082D6B', darker: '#051D47', tint: '#E4ECF8' },
        lagoon: { DEFAULT: '#5A3A00', light: '#FFF0C2' },
        ink: '#0B0F19',
      },
      fontFamily: {
        // --db-font follows the host's Bootstrap font when it has one (see styles/index.css).
        sans: ['var(--db-font)'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 15, 25, 0.08), 0 4px 16px rgba(11, 15, 25, 0.08)',
      },
    },
  },
  plugins: [],
};
