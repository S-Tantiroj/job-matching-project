import { defineConfig } from 'vitest/config'

// ชุด unit — ตรรกะล้วน ไม่แตะเครือข่าย
//
// ต้องเขียวเสมอ ทุกครั้ง ไม่ว่า Gemini หรือ Supabase จะเป็นอย่างไร ถ้าชุดนี้แดง
// แปลว่าโค้ดผิดจริง ซึ่งเป็นเหตุผลเดียวที่ชุดเทสต์ควรแดง
//
// เทสต์ที่ต้องใช้บริการจริงอยู่ในไฟล์ *.int.test.ts และมี config แยก
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    exclude: ['**/node_modules/**', '**/.next/**', '**/*.int.test.ts'],
  },
  resolve: {
    alias: { '@': __dirname },
  },
})
