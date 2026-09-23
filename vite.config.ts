import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // ルールは Node、認証・画面遷移の hook はファイル指定の jsdom で検証する。
  // Supabase はモックを使い、実際のアカウントやDBには触れない。
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
