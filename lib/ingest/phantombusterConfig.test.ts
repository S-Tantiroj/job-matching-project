import {
  readPhantombusterConfig,
  describePhantombusterConfig,
  PHANTOMBUSTER_VARS,
} from './phantombusterConfig'

const KEY = 'PHANTOMBUSTER_API_KEY'
const AGENT = 'PHANTOMBUSTER_AGENT_ID'

describe('readPhantombusterConfig', () => {
  test('ครบทั้งสองตัวได้ ok พร้อมค่า', () => {
    const c = readPhantombusterConfig({ [KEY]: 'k1', [AGENT]: 'a1' })
    expect(c).toEqual({ kind: 'ok', apiKey: 'k1', agentId: 'a1' })
  })

  test('ไม่มีเลยสักตัว = ยังไม่ได้ตั้งค่า ไม่ใช่ความล้มเหลว', () => {
    const c = readPhantombusterConfig({})
    expect(c.kind).toBe('not-configured')
  })

  // นี่คือกรณีที่ทำให้ workflow แดงติดกันสามคืน — GitHub แทน secret ที่ไม่มีอยู่
  // ด้วยสตริงว่าง ไม่ใช่ปล่อยให้ตัวแปรหายไป การเช็คแค่ undefined จะมองไม่เห็น
  test('สตริงว่างนับว่าไม่มี ไม่ใช่มีค่าว่าง', () => {
    const c = readPhantombusterConfig({ [KEY]: '', [AGENT]: '' })
    expect(c.kind).toBe('not-configured')
  })

  test('ช่องว่างล้วนก็นับว่าไม่มี', () => {
    const c = readPhantombusterConfig({ [KEY]: '   ', [AGENT]: '\t\n' })
    expect(c.kind).toBe('not-configured')
  })

  // สภาวะที่ต้องดัง — มีคนตั้งใจตั้งค่าแล้วทำพลาด หรือลบทิ้งไปตัวหนึ่ง
  test('มีบางตัว ขาดบางตัว = ตั้งค่าไม่ครบ ต้องแยกจาก "ยังไม่ได้ตั้ง"', () => {
    const c = readPhantombusterConfig({ [KEY]: 'k1' })
    expect(c.kind).toBe('incomplete')
    if (c.kind !== 'incomplete') throw new Error('unreachable')
    expect(c.missing).toEqual([AGENT])
    expect(c.present).toEqual([KEY])
  })

  test('ขาดอีกด้านก็ต้องเป็น incomplete เหมือนกัน', () => {
    const c = readPhantombusterConfig({ [AGENT]: 'a1' })
    expect(c.kind).toBe('incomplete')
    if (c.kind !== 'incomplete') throw new Error('unreachable')
    expect(c.missing).toEqual([KEY])
  })

  test('ตัดช่องว่างหัวท้ายของค่าที่ใช้จริง', () => {
    const c = readPhantombusterConfig({ [KEY]: '  k1  ', [AGENT]: ' a1 ' })
    expect(c).toEqual({ kind: 'ok', apiKey: 'k1', agentId: 'a1' })
  })

  test('ไม่สนใจตัวแปรอื่นใน env', () => {
    const c = readPhantombusterConfig({ [KEY]: 'k1', [AGENT]: 'a1', GEMINI_API_KEY: 'g' })
    expect(c.kind).toBe('ok')
  })
})

describe('describePhantombusterConfig', () => {
  test('ข้อความตอนยังไม่ตั้งค่าต้องบอกวิธีทำต่อ ไม่ใช่แค่บอกว่าขาดอะไร', () => {
    const msg = describePhantombusterConfig(readPhantombusterConfig({}))
    expect(msg).toContain('ข้าม')
    expect(msg).toContain(AGENT)
    // คนที่มาเจอ log นี้อีกหกเดือนต้องรู้ว่าต้องไปทำอะไรที่ไหน
    expect(msg).toContain('Secrets')
    expect(msg).toContain('cron')
  })

  test('ข้อความตอนตั้งไม่ครบต้องบอกทั้งที่มีและที่ขาด', () => {
    const msg = describePhantombusterConfig(readPhantombusterConfig({ [KEY]: 'k1' }))
    expect(msg).toContain(KEY)
    expect(msg).toContain(AGENT)
  })

  test('ตอน ok ไม่มีข้อความชวนสับสน', () => {
    const msg = describePhantombusterConfig(readPhantombusterConfig({ [KEY]: 'k', [AGENT]: 'a' }))
    expect(msg).not.toContain('ข้าม')
  })
})

test('รายชื่อตัวแปรตรงกับที่ workflow ส่งเข้ามา', () => {
  // ดักการเพิ่มตัวแปรใหม่แล้วลืมใส่ใน workflow หรือกลับกัน
  expect([...PHANTOMBUSTER_VARS]).toEqual([KEY, AGENT])
})
