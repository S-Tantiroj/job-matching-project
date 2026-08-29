import { defineConfig } from 'vitest/config'

// ชุด integration — แตะ Supabase และ Gemini จริง
//
// รันเมื่อบริการพร้อม ไม่ใช่ทุกครั้งที่แก้โค้ด ความล้มเหลวชั่วคราวของบริการภายนอก
// จะถูก "ข้าม" ไม่ใช่ "ตก" ผ่าน tolerateOutage ใน test-utils/integration.ts
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.int.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**'],

    // ทุกไฟล์ใช้ฐานข้อมูลเดียวกัน การรันขนานทำให้ fixture ของไฟล์หนึ่งถูกลบระหว่างที่
    // อีกไฟล์กำลังอ่านอยู่ — เคยทำให้ score.int.test.ts พังด้วย "candidate not found"
    // แบบสุ่ม รันทีละไฟล์ช้ากว่าแต่ผลเชื่อถือได้
    fileParallelism: false,

    // การเรียกครั้งแรกของรันหนึ่งๆ ต้องจ่ายค่า DNS + TLS และการปลุกโปรเจกต์ที่หลับอยู่
    // ส่วน Gemini free tier เคยตอบช้าถึง 52 วินาทีแม้กับคำขอเล็ก
    testTimeout: 60000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: { '@': __dirname },
  },
})
