import { splitKnownSkills, unusedSkillNotice } from './knownSkills'

const KNOWN = ['Python', 'Machine Learning', 'Deep Learning', 'Financial Modeling']

describe('splitKnownSkills', () => {
  // กรณีที่ทำให้ไฟล์นี้ถูกสร้าง — พบจาก UAT 18 ก.ย. 2026
  // `known` คือสกิลที่**มีผู้สมัครถืออยู่จริง** ไม่ใช่ทุกชื่อในตาราง `skills`
  test('"Data Science" ไม่มีใครถือ จึงไม่ถูกใช้กรอง', () => {
    expect(splitKnownSkills(['Data Science'], KNOWN)).toEqual({
      usable: [],
      unknown: ['Data Science'],
    })
  })

  test('สกิลที่มีคนถือยังกรองได้ตามเดิม', () => {
    expect(splitKnownSkills(['Python'], KNOWN)).toEqual({ usable: ['Python'], unknown: [] })
  })

  test('ปนกันได้ ใช้เฉพาะตัวที่มีคนถือ', () => {
    // **นี่คือพฤติกรรมที่สำคัญที่สุด** — ชิปปลอมหนึ่งตัวต้องไม่ทำให้ชิปจริงใช้ไม่ได้
    // RPC เทียบแบบ "ต้องครบทุกตัว" ถ้าส่งทั้งสองไปจะเหลือศูนย์เหมือนเดิม
    expect(splitKnownSkills(['Python', 'Data Science'], KNOWN)).toEqual({
      usable: ['Python'],
      unknown: ['Data Science'],
    })
  })

  test('เทียบแบบไม่สนตัวพิมพ์ แต่คืนรูปที่ผู้ใช้เห็น', () => {
    // RPC lower() ทั้งสองข้างอยู่แล้ว · คืนรูปเดิมเพื่อให้ข้อความตรงกับชิปบนจอ
    expect(splitKnownSkills(['python'], KNOWN).usable).toEqual(['python'])
    expect(splitKnownSkills(['MACHINE LEARNING'], KNOWN).usable).toEqual(['MACHINE LEARNING'])
    expect(splitKnownSkills(['Python'], ['python']).usable).toEqual(['Python'])
  })

  test('ตัดช่องว่างและค่าว่างทิ้ง', () => {
    expect(splitKnownSkills(['  Python  ', '', '   '], KNOWN).usable).toEqual(['Python'])
  })

  test('ชิปซ้ำนับครั้งเดียว', () => {
    // ส่งซ้ำเข้า RPC แล้ว array_length จะนับเกิน ทำให้เงื่อนไข "ครบทุกตัว" ไม่มีวันจริง
    expect(splitKnownSkills(['Python', 'python'], KNOWN)).toEqual({
      usable: ['Python'],
      unknown: [],
    })
    expect(splitKnownSkills(['Data Science', 'data science'], KNOWN).unknown).toEqual([
      'Data Science',
    ])
  })

  test('ไม่มีชิปเลยก็ไม่พัง', () => {
    expect(splitKnownSkills([], KNOWN)).toEqual({ usable: [], unknown: [] })
  })
})

describe('unusedSkillNotice', () => {
  test('ไม่มีชิปที่ใช้ไม่ได้ก็ไม่มีข้อความ', () => {
    expect(unusedSkillNotice([])).toBe('')
  })

  test('บอกว่ายังใช้จัดอันดับอยู่ ไม่ใช่พิมพ์ไปเปล่าๆ', () => {
    const m = unusedSkillNotice(['Data Science'])
    expect(m).toContain('Data Science')
    expect(m).toContain('ไม่ถูกใช้เป็นตัวกรอง')
    // **พูดถึงผู้สมัคร ไม่ใช่ฐานข้อมูล** — "ไม่มีสกิลนี้ในฐานข้อมูล" จะผิดในกรณีที่
    // ชื่อมีอยู่จริงแต่ไม่มีใครถือ ซึ่งเป็นกรณีที่เจอจริงกับ Data Science
    expect(m).toContain('ผู้สมัคร')
    expect(m).not.toContain('ฐานข้อมูล')
    // คำเหล่านั้นอยู่ในข้อความที่ถูก embed จึงยังมีผลต่อลำดับจริง
    expect(m).toContain('จัดอันดับ')
  })

  test('หลายตัวคั่นให้อ่านออก', () => {
    expect(unusedSkillNotice(['UX', 'UI'])).toContain('UX · UI')
  })
})
