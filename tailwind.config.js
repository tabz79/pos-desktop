module.exports = {
  content: ["./index.html", "./renderer.js"],
  safelist: [
    'flex',
    'h-screen',
    'w-64',
    'bg-white',
    'shadow-lg',
    'p-4',
    'text-xl',
    'font-bold',
    'mb-4',
    'space-y-2',
    'w-full',
    'text-left',
    'hover:bg-gray-200',
    'p-2',
    'rounded',
    'flex-1',
    'text-2xl',
    'font-semibold',
    'mt-4',
    'bg-gray-100',
    'text-gray-900',
    'font-sans'
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4F46E5', // Indigo 600
          dark: '#4338CA',    // Indigo 700
          light: '#6366F1',   // Indigo 500
        },
        secondary: {
          DEFAULT: '#6B7280', // Gray 500
          light: '#D1D5DB',   // Gray 300
          dark: '#4B5563',    // Gray 700
        },
        success: '#10B981',   // Green 500
        danger: '#EF4444',    // Red 500
        warning: '#F59E0B',   // Amber 500
        info: '#3B82F6',      // Blue 500
      },
    },
  },
  plugins: [],
}
