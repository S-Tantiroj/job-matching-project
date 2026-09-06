import { validateProfileDraft, LIMITS, EMPTY_DRAFT } from './profileDraft'

const ok = (v: unknown) => {
  const r = validateProfileDraft(v)
  if (!r.ok) throw new Error(`คาดว่าผ่าน แต่ตกที่ ${r.field}: ${r.message}`)
  return r.draft
}

test('ต้องมี full_name', () => {
  const r = validateProfileDraft({ headline: 'Data Scientist' })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.field).toBe('full_name')
})

test('full_name ที่มีแต่ช่องว่างถือว่าไม่มี', () => {
  const r = validateProfileDraft({ full_name: '   ' })
  expect(r.ok).toBe(false)
})

test('ข้อความเกินเพดานถูกปฏิเสธพร้อมระบุช่อง ไม่ตัดให้เงียบๆ', () => {
  const r = validateProfileDraft({
    full_name: 'Somchai Jaidee',
    summary: 'ก'.repeat(LIMITS.summary + 1),
  })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.field).toBe('summary')
})

test('การศึกษา 21 รายการเกินเพดาน', () => {
  const r = validateProfileDraft({
    full_name: 'Somchai Jaidee',
    education: Array.from({ length: 21 }, () => ({ institution: 'X' })),
  })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.field).toBe('education')
})

test('การศึกษา 11 รายการยังผ่าน', () => {
  // prompt ขอ 10 รายการล่าสุด แต่เซิร์ฟเวอร์ยอมได้ถึง 20 เพราะเราบอกผู้ใช้ว่า
  // "เพิ่มเองได้" ถ้าใครมาปรับสองเพดานให้เท่ากัน ปุ่มเพิ่มรายการจะพังทันที
  // และเทสต์นี้คือสิ่งเดียวที่จะดักไว้
  const d = ok({
    full_name: 'Somchai Jaidee',
    education: Array.from({ length: 11 }, () => ({ institution: 'X' })),
  })
  expect(d.education).toHaveLength(11)
})

test('สกิล 51 รายการเกินเพดาน', () => {
  const r = validateProfileDraft({
    full_name: 'Somchai Jaidee',
    skills: Array.from({ length: 51 }, (_, i) => `s${i}`),
  })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.field).toBe('skills')
})

test('gpa เป็นตัวเลขคงเป็น string ไม่ถูกแปลงเป็น number', () => {
  const d = ok({
    full_name: 'Somchai Jaidee',
    education: [{ institution: 'X', gpa: '3.45' }],
  })
  expect(d.education![0].gpa).toBe('3.45')
  expect(typeof d.education![0].gpa).toBe('string')
})

test('gpa เป็นข้อความไทยยาว 22 code point ผ่าน', () => {
  // ถ้าใครตั้งเพดาน gpa จากการนับตัวอักษรที่ตาเห็น เทสต์นี้จะแดง
  const honours = 'เกียรตินิยมอันดับหนึ่ง'
  expect(honours.length).toBe(22)
  const d = ok({ full_name: 'Somchai Jaidee', education: [{ gpa: honours }] })
  expect(d.education![0].gpa).toBe(honours)
})

test('ปีนอกช่วง 1900-2100 ถูกปฏิเสธ', () => {
  const r = validateProfileDraft({
    full_name: 'Somchai Jaidee',
    education: [{ institution: 'X', end_year: 1800 }],
  })
  expect(r.ok).toBe(false)
  if (!r.ok) expect(r.field).toBe('education.end_year')
})

test('วันที่ผิดรูปถูกปฏิเสธ ไม่เดาเติมให้', () => {
  for (const bad of ['2020', '01/2020', '2020-13-01']) {
    const r = validateProfileDraft({
      full_name: 'Somchai Jaidee',
      experience: [{ company: 'X', start_date: bad }],
    })
    expect(r.ok).toBe(false)
  }
})

test('end_date เป็น null ได้ หมายถึงตำแหน่งปัจจุบัน', () => {
  const d = ok({
    full_name: 'Somchai Jaidee',
    experience: [{ company: 'X', start_date: '2020-01-01', end_date: null }],
  })
  expect(d.experience![0].end_date).toBeUndefined()
})

test('ฟิลด์ที่ไม่รู้จักถูกตัดทิ้ง ไม่ไหลลงฐานผ่าน jsonb', () => {
  const d = ok({
    full_name: 'Somchai Jaidee',
    owner_id: 'attacker-uuid',
    religion: 'พุทธ',
    education: [{ institution: 'X', evil: 1 }],
  }) as Record<string, unknown>
  expect(d.owner_id).toBeUndefined()
  expect(d.religion).toBeUndefined()
  expect((d.education as Record<string, unknown>[])[0].evil).toBeUndefined()
})

test('ค่าที่ผ่านถูกตัดช่องว่างหัวท้าย และช่องว่างเปล่าหายไป', () => {
  const d = ok({ full_name: '  Somchai Jaidee  ', headline: '   ' })
  expect(d.full_name).toBe('Somchai Jaidee')
  expect(d.headline).toBeUndefined()
})

test('EMPTY_DRAFT ผ่านไม่ได้เพราะยังไม่มีชื่อ', () => {
  expect(validateProfileDraft(EMPTY_DRAFT).ok).toBe(false)
})
