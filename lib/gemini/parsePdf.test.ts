import { parseProfileResponse } from './parsePdf'

const wrap = (profile: unknown) => JSON.stringify({ profile })

test('อ่าน JSON ปกติได้', () => {
  const d = parseProfileResponse(
    wrap({ full_name: 'Somchai Jaidee', headline: 'Data Scientist', industry: 'Banking' })
  )
  expect(d.full_name).toBe('Somchai Jaidee')
  expect(d.industry).toBe('Banking')
})

test('แกะ JSON ออกจาก markdown fence ได้', () => {
  const d = parseProfileResponse('```json\n' + wrap({ full_name: 'Somchai Jaidee' }) + '\n```')
  expect(d.full_name).toBe('Somchai Jaidee')
})

test('ไม่มีชื่อ ถือว่าอ่านไม่สำเร็จ', () => {
  expect(() => parseProfileResponse(wrap({ headline: 'Data Scientist' }))).toThrow()
})

test('JSON เสีย โยน error', () => {
  expect(() => parseProfileResponse('ไม่ใช่ JSON เลย')).toThrow()
})

test('ผลลัพธ์ไม่มี raw_text แม้โมเดลจะส่งกลับมา', () => {
  // เลิกเก็บ raw_text แล้ว แต่โมเดลอาจยังส่งมาเองจากความเคยชินของ schema
  // ถ้าหลุดเข้าไปได้ มันจะถูกเขียนลง jsonb แล้วเรากลับไปเก็บ CV ฉบับเต็มโดยไม่ตั้งใจ
  const d = parseProfileResponse(
    JSON.stringify({ profile: { full_name: 'Somchai Jaidee' }, raw_text: 'ข้อความเต็มทั้งฉบับ' })
  ) as Record<string, unknown>
  expect(d.raw_text).toBeUndefined()
})

test('ตัดรายการส่วนเกินให้เหลือตามเพดาน แม้โมเดลจะส่งเกินมา', () => {
  const d = parseProfileResponse(
    wrap({
      full_name: 'Somchai Jaidee',
      experience: Array.from({ length: 40 }, (_, i) => ({ company: `C${i}`, title: 'Dev' })),
    })
  )
  expect(d.experience!.length).toBeLessThanOrEqual(20)
})

test('วันที่ผิดรูปจากโมเดลถูกทิ้ง ไม่ทำให้ทั้งไฟล์อ่านไม่สำเร็จ', () => {
  // โมเดลพลาดรูปวันที่บ่อยแม้ prompt จะสั่งไว้ ถ้าปล่อยให้ตกที่ validateProfileDraft
  // ผู้ใช้จะเจอ "อ่านไฟล์ไม่สำเร็จ" ทั้งที่อ่านได้ครบ เพราะวันที่เดียวผิด
  // ซึ่งเป็นการทิ้งงานที่สำเร็จแล้ว — สิ่งเดียวกับที่ flow นี้ตั้งใจเลิกทำ
  //
  // ผู้ใช้ตรวจฟอร์มอยู่แล้ว ปล่อยช่องว่างให้เขาเติมดีกว่าปฏิเสธทั้งไฟล์
  const d = parseProfileResponse(
    wrap({
      full_name: 'Somchai Jaidee',
      experience: [{ company: 'Agoda', title: 'Dev', start_date: '2020', end_date: 'present' }],
    })
  )
  expect(d.experience![0].company).toBe('Agoda')
  expect(d.experience![0].start_date).toBeUndefined()
})

test('วันที่ไม่มีจริงในปฏิทิน (เช่น Feb 30) ถูกทิ้ง ไม่ทำให้ทั้งไฟล์อ่านไม่สำเร็จ', () => {
  // iso() ต้องตรวจความถูกต้องของปฏิทิน ไม่ใช่แค่รูปแบบ
  // "2023-02-30" ผ่านรูปแบบ แต่ไม่มีวันที่ 30 ของเดือนกุมภาพันธ์
  const d = parseProfileResponse(
    wrap({
      full_name: 'Somchai Jaidee',
      experience: [{ company: 'Agoda', title: 'Dev', start_date: '2023-02-30' }],
    })
  )
  expect(d.experience![0].company).toBe('Agoda')
  expect(d.experience![0].start_date).toBeUndefined()
})

test('เดือนนอกช่วง (เช่น month 13) ถูกทิ้ง ไม่ทำให้ทั้งไฟล์อ่านไม่สำเร็จ', () => {
  // "2020-13-01" ผ่านรูปแบบ แต่เดือนที่ 13 ไม่มีในปฏิทิน
  const d = parseProfileResponse(
    wrap({
      full_name: 'Somchai Jaidee',
      experience: [{ company: 'Agoda', title: 'Dev', end_date: '2020-13-01' }],
    })
  )
  expect(d.experience![0].company).toBe('Agoda')
  expect(d.experience![0].end_date).toBeUndefined()
})

test('ปีนอกช่วงจากโมเดลถูกทิ้ง ไม่ทำให้ทั้งไฟล์อ่านไม่สำเร็จ', () => {
  const d = parseProfileResponse(
    wrap({ full_name: 'Somchai Jaidee', education: [{ institution: 'X', end_year: 0 }] })
  )
  expect(d.education![0].institution).toBe('X')
  expect(d.education![0].end_year).toBeUndefined()
})

test('ข้อความยาวเกินจากโมเดลถูกตัด ไม่ปฏิเสธทั้งไฟล์', () => {
  const d = parseProfileResponse(
    wrap({ full_name: 'Somchai Jaidee', summary: 'ก'.repeat(5000) })
  )
  expect(d.summary!.length).toBeLessThanOrEqual(2000)
})
