// ชื่อและเวอร์ชันของระบบ — แหล่งเดียวสำหรับทุกที่ที่แสดงให้ผู้ใช้เห็น
//
// **เขียนค่าไว้ตรงๆ ไม่ได้ import `package.json` มาอ่าน** เพราะไฟล์นี้ถูกใช้ใน
// คอมโพเนนต์ที่ถูกส่งไปถึงเบราว์เซอร์ การ import JSON ทั้งไฟล์เข้ามาจะลาก
// รายชื่อ dependency ทั้งหมดไปอยู่ใน bundle ฝั่ง client ด้วย ซึ่งไม่มีใครต้องใช้
//
// ความเสี่ยงคือค่าสองที่ไม่ตรงกัน — `lib/version.test.ts` จึงอ่าน `package.json`
// ตัวจริงมาเทียบ **แก้ที่เดียวโดยลืมอีกที่แล้วเทสต์จะแดงทันที**
// (หลักการเดียวกับ `JOB_TEXT_LIMITS` ที่ต้องตรงกับ DDL ของตาราง `jobs`)

export const APP_NAME = 'Skouth'

/** ต้องตรงกับ `version` ใน package.json — มีเทสต์ตรึงไว้ */
export const APP_VERSION = '1.0.0'

/** ต้องตรงกับ `name` ใน package.json */
export const PACKAGE_NAME = 'skouth'

/** ข้อความที่แสดงจริง เช่น "Skouth v1.0.0" */
export const versionLabel = () => `${APP_NAME} v${APP_VERSION}`
