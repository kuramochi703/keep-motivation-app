import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // ルール（state/ と avatar/ の純粋関数）のテストだけを見る。
  // 画面は 3D / Supabase を抱えていてブラウザが要るので、ここでは動かさない。
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
