// อีเมลกลางขององค์กร — เปลี่ยนที่นี่ที่เดียว
//
// เทสต์ใน docAssets.test.ts จะตกถ้าค่านี้ยังเป็น placeholder
// ซึ่งเป็นเจตนา ไม่ใช่บั๊ก: หน้า help ที่บอกช่องทางติดต่อที่ไม่มีอยู่จริง
// แย่กว่าไม่มีหน้า help เพราะคนที่เขียนไปหาจะรอคำตอบที่ไม่มีวันมา
//
// ต้องระบุชนิดเป็น string ทั้งคู่ ไม่ใช่ปล่อยให้ TypeScript อนุมานเป็น literal type
// มิฉะนั้นการเปรียบเทียบข้างล่างจะเป็น error TS2367 ("ไม่มีทางเท่ากันได้")
// ทันทีที่ค่าจริงต่างจาก placeholder — คือพังตอน build ทุกครั้งที่ทำถูกต้อง
const PLACEHOLDER: string = 'contact@example.com'

export const CONTACT_EMAIL: string = 'skouth.contact@gmail.com'
export const CONTACT_IS_PLACEHOLDER = CONTACT_EMAIL === PLACEHOLDER
