import { buildResultUrl, readS3Folders } from './phantombuster'

// ทดสอบเฉพาะส่วนบริสุทธิ์ — การเรียกเครือข่ายจริงอยู่ในเทสต์ integration
// ของเดิมยัดทุกอย่างไว้ในฟังก์ชันเดียวที่เรียก fetch จึงทดสอบอะไรไม่ได้เลย
// และนั่นคือเหตุผลหนึ่งที่ endpoint ผิดมาตั้งแต่ต้นโดยไม่มีใครรู้

describe('buildResultUrl', () => {
  // ตัวอย่างจากเอกสารของ PhantomBuster โดยตรง
  test('ประกอบตามตัวอย่างในเอกสารได้ตรง', () => {
    expect(buildResultUrl('E5czzj975lU', 'BIcIPWVRhDy3pjF04LyTtw')).toBe(
      'https://phantombuster.s3.amazonaws.com/E5czzj975lU/BIcIPWVRhDy3pjF04LyTtw/result.csv'
    )
  })

  test('ชื่อไฟล์ตั้งต้นคือ result.csv', () => {
    expect(buildResultUrl('a', 'b')).toMatch(/\/result\.csv$/)
  })

  test('เปลี่ยนชื่อไฟล์ได้ สำหรับ phantom ที่ตั้งชื่อผลลัพธ์เอง', () => {
    expect(buildResultUrl('a', 'b', 'leads.csv')).toMatch(/\/leads\.csv$/)
  })

  // ค่าเหล่านี้มาจากบริการภายนอก เราไม่ได้กำหนดเอง จึงต้อง encode
  test('encode อักขระที่ทำให้ URL เพี้ยน', () => {
    const url = buildResultUrl('or g', 'a/b', 'x y.csv')
    expect(url).toContain('or%20g')
    expect(url).toContain('a%2Fb')
    expect(url).toContain('x%20y.csv')
  })

  test('ตัดช่องว่างหัวท้ายก่อนประกอบ', () => {
    expect(buildResultUrl('  a  ', ' b ')).toBe(
      'https://phantombuster.s3.amazonaws.com/a/b/result.csv'
    )
  })
})

describe('readS3Folders', () => {
  test('อ่านสองโฟลเดอร์จากคำตอบปกติ', () => {
    expect(readS3Folders({ orgS3Folder: 'org1', s3Folder: 'ag1', name: 'x' })).toEqual({
      orgS3Folder: 'org1',
      s3Folder: 'ag1',
    })
  })

  // เอกสารระบุว่า phantom ต้องเคยรันอย่างน้อยหนึ่งครั้งถึงจะมีโฟลเดอร์ผลลัพธ์
  // ข้อความต้องชี้ไปที่สาเหตุนี้ ไม่ใช่บอกลอยๆ ว่า "ไม่มีข้อมูล"
  test('ไม่มีโฟลเดอร์ = phantom ยังไม่เคยรัน ต้องบอกให้ตรงสาเหตุ', () => {
    expect(() => readS3Folders({})).toThrow(/ยังไม่เคยรัน/)
  })

  test('มีแค่ตัวเดียวก็ยังไม่พอ', () => {
    expect(() => readS3Folders({ orgS3Folder: 'org1' })).toThrow()
    expect(() => readS3Folders({ s3Folder: 'ag1' })).toThrow()
  })

  test('สตริงว่างและช่องว่างล้วนนับว่าไม่มี', () => {
    expect(() => readS3Folders({ orgS3Folder: '', s3Folder: 'ag1' })).toThrow()
    expect(() => readS3Folders({ orgS3Folder: '  ', s3Folder: 'ag1' })).toThrow()
  })

  test('body ที่ไม่ใช่อ็อบเจ็กต์ต้องไม่ทำให้พังแบบอื่น', () => {
    expect(() => readS3Folders(null)).toThrow(/ยังไม่เคยรัน/)
    expect(() => readS3Folders('nope')).toThrow(/ยังไม่เคยรัน/)
  })
})
