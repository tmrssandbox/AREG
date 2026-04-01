/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Map Tailwind color utilities to design tokens so that if Tailwind
      // classes are used for color/type they stay on-brand rather than
      // pulling from Tailwind's default palette.
      colors: {
        primary:         'var(--color-primary)',
        'primary-hover': 'var(--color-primary-hover)',
        'primary-light': 'var(--color-primary-light)',
        accent:          'var(--color-accent)',
        bg:              'var(--color-bg)',
        surface:         'var(--color-surface)',
        'surface-raised':'var(--color-surface-raised)',
        border:          'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        muted:           'var(--color-text-muted)',
        heading:         'var(--color-text-heading)',
        success:         'var(--color-success)',
        error:           'var(--color-error)',
        warning:         'var(--color-warning)',
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
