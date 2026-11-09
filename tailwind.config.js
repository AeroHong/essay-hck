import colors from 'tailwindcss/colors'

// Essay Platform 디자인 토큰 — Classroom-live(Big Data)와 같은 brand 색·canvas 바탕, 글꼴은 StudentHub의 Pretendard.
// 코드 곳곳의 indigo-*/gray-*를 일일이 고치지 않고 팔레트를 바꿔 끼워 전체 화면이 같은 톤이 되게 한다.
const brand = {
  50: '#f3f6f9',
  100: '#e7edf3',
  200: '#cfdae5',
  300: '#a9bccd',
  400: '#7c97b0',
  500: '#5a7a96',
  600: '#3d5872',
  700: '#2a3f53',
  800: '#223344',
  900: '#1b2836',
  950: '#111a24',
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      colors: {
        indigo: brand,
        gray: colors.slate,
        brand: { ...brand, DEFAULT: brand[600], light: brand[500], dark: brand[700], soft: brand[100] },
        accent: '#06b6d4',
        canvas: '#f1f3f6',
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '"Malgun Gothic"', '"Apple SD Gothic Neo"', 'system-ui', 'sans-serif'],
      },
    }
  },
  plugins: []
}
