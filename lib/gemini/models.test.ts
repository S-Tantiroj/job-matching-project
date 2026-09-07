import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { MODEL_TEXT, MODEL_FAST, MODEL_EMBED } from './models'

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) sourceFiles(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

test('ทุกชื่อรุ่นถูกปักหมุด ไม่ใช่ alias ที่ขยับเอง', () => {
  // alias `-latest` เคยขยับไป gemini-3.8-flash เองโดยไม่มีใคร deploy อะไร
  // ทำให้การค้นหาช้าลง 3 เท่าและแพงขึ้น 10 เท่าแบบเงียบๆ
  for (const m of [MODEL_TEXT, MODEL_FAST]) {
    expect(m).not.toContain('latest')
  }
  expect(MODEL_EMBED).toBe('gemini-embedding-001')
})

test('ไม่มีไฟล์ไหนใน lib/ หรือ app/ เขียนชื่อรุ่นตรงๆ นอกจาก models.ts', () => {
  // ถ้าชื่อรุ่นกระจายกลับไปอยู่หลายไฟล์ การเปลี่ยนรุ่นครั้งหน้าจะแก้ไม่ครบ
  // แล้วบางเส้นทางจะยังวิ่งบนรุ่นเก่าโดยไม่มีอาการอะไรให้สังเกต
  const offenders: string[] = []
  for (const dir of ['lib', 'app']) {
    for (const f of sourceFiles(dir)) {
      if (f.endsWith(path.join('gemini', 'models.ts'))) continue
      const src = readFileSync(f, 'utf8')
      // ตัดคอมเมนต์ออกก่อน — พูดถึงชื่อรุ่นในคำอธิบายได้ แต่ห้ามใช้เป็นค่าจริง
      const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      if (/['"`]gemini-[\w.-]+['"`]/.test(code)) offenders.push(f)
    }
  }
  expect(offenders).toEqual([])
})
