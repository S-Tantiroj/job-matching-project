# แนวทางวาดไดอะแกรมใหม่ 4 ชุด

ไฟล์นี้บอกว่า**แต่ละภาพต้องมีอะไรบ้าง** พร้อม source ที่เรนเดอร์เป็นภาพได้จริง
ไม่ใช่คำอธิบายลอยๆ ให้ไปตีความเอง

## วิธีใช้ source ในไฟล์นี้

โค้ดในบล็อก ` ```mermaid ` เอาไปวางที่ **<https://mermaid.live>** แล้วกด Actions →
PNG/SVG ได้ภาพทันที

**สำหรับส่งเล่มจริง แนะนำให้ใช้ผลจาก Mermaid เป็นแบบร่าง แล้ววาดจริงใน draw.io**
ด้วยเหตุผลสองข้อ

1. **สัญลักษณ์ UML** — Mermaid วาด Use Case Diagram ตามมาตรฐาน UML ไม่ได้
   (ไม่มีรูปคนแบบ stick figure ไม่มีวงรี ไม่มีกรอบขอบเขตระบบ) ส่วน Activity Diagram
   ก็ไม่มีสัญลักษณ์ Fork/Join และเส้นแบ่ง Swimlane ที่กรรมการคาดหวัง
2. **ฟอนต์ไทย** — ภาพจาก mermaid.live แสดงไทยได้ แต่ควบคุมฟอนต์ให้ตรงกับเล่มไม่ได้

ที่ Mermaid ช่วยได้จริงคือ **ทำให้เห็นครบว่าต้องมีกล่องอะไรและเส้นไปไหนบ้าง**
ก่อนจะเสียเวลาลากเส้นด้วยมือแล้วพบว่าลืมของ

---

# 1. ER Diagram (หัวข้อ 3.5)

## ปัญหาที่ต้องตัดสินใจก่อนวาด

ของจริงมี **17 ตาราง และ 18 ความสัมพันธ์** ยัดลงหน้า A4 เดียวแล้วอ่านไม่ออกแน่นอน
เล่มเดิมมี 10 ตารางซึ่งพอดีหนึ่งหน้า แต่ไม่ตรงกับของจริง

**ทางที่แนะนำ: แบ่งเป็น 2 ภาพ** ใส่ในเล่มทั้งคู่

- **ภาพที่ 3-11 (ก) ER Diagram ส่วนหลัก** — ผู้ใช้ ผู้สมัคร และการจับคู่งาน
  คือส่วนที่ตอบวัตถุประสงค์ของโครงงานโดยตรง
- **ภาพที่ 3-11 (ข) ER Diagram ส่วนสนับสนุน** — การนำเข้าข้อมูล การประเมินตัวเอง
  และการตามรอย

ทางเลือกอื่นคือวาดรวมภาพเดียวแนวนอนเต็มหน้า ซึ่งอ่านได้แต่ตัวหนังสือจะเล็กมาก

## ความสัมพันธ์ทั้ง 18 เส้น (ดึงจากฐานข้อมูลจริง 2026-09-09)

| ตารางลูก | คอลัมน์ | ตารางแม่ | เมื่อลบแม่ |
|---|---|---|---|
| profiles | id | auth.users | ลบตาม |
| candidates | created_by | profiles | **ห้ามลบแม่** |
| candidates | ingest_run_id | ingest_runs | เป็น null |
| education | candidate_id | candidates | ลบตาม |
| experience | candidate_id | candidates | ลบตาม |
| candidate_skills | candidate_id | candidates | ลบตาม |
| candidate_skills | skill_id | skills | ลบตาม |
| shortlists | owner_id | profiles | ลบตาม |
| shortlist_candidates | shortlist_id | shortlists | ลบตาม |
| shortlist_candidates | candidate_id | candidates | ลบตาม |
| analyses | candidate_id | candidates | ลบตาม |
| analyses | job_id | jobs | ลบตาม |
| self_profiles | owner_id | profiles | ลบตาม |
| resume_assessments | profile_id | self_profiles | ลบตาม |
| ingest_runs ← pending_candidates | ingest_run_id | ingest_runs | เป็น null |
| pending_candidates | reviewed_by | profiles | เป็น null |
| suppressed_profiles | created_by | profiles | เป็น null |
| activity_log | actor_id | profiles | เป็น null |

> **`activity_log.entity_id` ไม่ใช่ Foreign Key อย่าลากเส้นไปหา `candidates`**
> เป็นการออกแบบโดยตั้งใจ (เหตุผลอยู่ในหัวข้อ 3.8.6) ถ้าวาดเส้นไว้ ภาพจะขัดกับ
> ทั้งฐานข้อมูลจริงและคำอธิบายในเล่ม
>
> **`jobs` ไม่มี FK ออกไปหาใครเลย** เป็นตารางที่มาจากสคริปต์คนละยุค มีแต่
> `analyses` ที่ชี้เข้ามา

## Source — ภาพ (ก) ส่วนหลัก

```mermaid
erDiagram
    profiles ||--o{ candidates : "created_by (นำเข้า)"
    profiles ||--o{ shortlists : "owner_id (เป็นเจ้าของ)"
    candidates ||--o{ education : "candidate_id"
    candidates ||--o{ experience : "candidate_id"
    candidates ||--o{ candidate_skills : "candidate_id"
    skills ||--o{ candidate_skills : "skill_id"
    shortlists ||--o{ shortlist_candidates : "shortlist_id"
    candidates ||--o{ shortlist_candidates : "candidate_id"
    candidates ||--o{ analyses : "candidate_id"
    jobs ||--o{ analyses : "job_id (null ได้)"

    profiles {
        uuid id PK
        text email "จาก auth.users"
        text display_name
        user_role role "admin/data_manager/member"
        jsonb settings
    }
    candidates {
        uuid id PK
        text full_name
        text headline
        text industry
        int years_experience
        cand_source source
        vector embedding "768 มิติ"
        text embed_hash
    }
    education {
        uuid id PK
        uuid candidate_id FK
        text institution
        text country
        text degree
        text field_of_study
    }
    experience {
        uuid id PK
        uuid candidate_id FK
        text company
        text title
        date start_date
        date end_date
    }
    skills {
        uuid id PK
        text name UK
    }
    candidate_skills {
        uuid candidate_id PK-FK
        uuid skill_id PK-FK
    }
    shortlists {
        uuid id PK
        text name
        uuid owner_id FK
    }
    shortlist_candidates {
        uuid shortlist_id PK-FK
        uuid candidate_id PK-FK
        text note
    }
    jobs {
        uuid id PK
        varchar title
        text description
        text_array required_skills
        varchar category
        vector embedding "768 มิติ"
    }
    analyses {
        uuid id PK
        uuid candidate_id FK
        uuid job_id FK "null ได้"
        text requirement_hash
        int score "0-100"
        text reasoning
    }
```

## Source — ภาพ (ข) ส่วนสนับสนุน

```mermaid
erDiagram
    profiles ||--o{ self_profiles : "owner_id"
    self_profiles ||--o{ resume_assessments : "profile_id"
    ingest_runs ||--o{ candidates : "ingest_run_id"
    ingest_runs ||--o{ pending_candidates : "ingest_run_id"
    profiles ||--o{ pending_candidates : "reviewed_by (ผู้ตรวจ)"
    profiles ||--o{ suppressed_profiles : "created_by (ผู้บันทึก)"
    profiles ||--o{ activity_log : "actor_id (ผู้กระทำ)"

    self_profiles {
        uuid id PK
        uuid owner_id FK
        jsonb parsed_data "ข้อมูลที่ผู้ใช้ยืนยันแล้ว"
        jsonb assessment "ผลวิเคราะห์"
        vector embedding "768 มิติ"
    }
    resume_assessments {
        uuid id PK
        uuid profile_id FK
        text requirement_hash
        int score "0-100"
    }
    ingest_runs {
        uuid id PK
        text trigger "scheduled/manual"
        text source "phantombuster/csv_upload"
        jsonb criteria "หลักฐาน PDPA"
        text status
        int imported
        int skipped_suppressed
    }
    pending_candidates {
        uuid id PK
        uuid ingest_run_id FK
        text full_name
        jsonb payload
        text_array missing "เกณฑ์ที่ยังไม่ผ่าน"
        text status "pending/approved/rejected"
        uuid reviewed_by FK
    }
    suppressed_profiles {
        uuid id PK
        text linkedin_url UK
        text reason
        uuid created_by FK
    }
    activity_log {
        uuid id PK
        uuid actor_id FK "null = ระบบทำเอง"
        text action
        text entity_type
        uuid entity_id "ไม่ใช่ FK โดยตั้งใจ"
        text summary "เก็บสำเร็จรูป"
    }
    profiles {
        uuid id PK
        text email
        user_role role
    }
    candidates {
        uuid id PK
        text full_name
        uuid ingest_run_id FK
    }
```

> **ตาราง `profiles` และ `candidates` โผล่ทั้งสองภาพโดยตั้งใจ** เป็นจุดเชื่อม
> ระหว่างสองส่วน ในภาพ (ข) ใส่เฉพาะคอลัมน์ที่ใช้เชื่อมเท่านั้น ควรวาดด้วยสีจางกว่า
> หรือเส้นประ แล้วเขียนหมายเหตุใต้ภาพว่า "รายละเอียดเต็มดูภาพที่ 3-11 (ก)"

---

# 2. Use Case Diagram (หัวข้อ 3.2)

## สรุปสิ่งที่เปลี่ยน

| เดิมในเล่ม | ทำอย่างไร |
|---|---|
| 1. เข้าสู่ระบบ | คงไว้ |
| 2. จัดการข้อมูลผู้ใช้ | คงไว้ (Admin) |
| 3. ดึงข้อมูล API | คงไว้ แต่เปลี่ยนผู้กระทำเป็น `data_manager` และเพิ่มความสัมพันธ์ `«extend»` ไปยัง "ตรวจสอบคิวข้อมูล" |
| 4. สั่ง AI วิเคราะห์ข้อมูล | **เปลี่ยนชื่อ** → "ประเมินความเหมาะสมของผู้สมัคร" (ข้อ 10 ของรายการแก้เอกสาร) |
| 5. อัปเดตข้อมูลแดชบอร์ด | คงไว้ |
| 6. ตั้งค่าข้อมูลส่วนตัว | คงไว้ (ตอนนี้เปลี่ยนได้ทั้งชื่อและรหัสผ่านจริงแล้ว) |
| 7. ค้นหา/คัดกรอง | คงไว้ |
| 8. บุ๊คมาร์คคนที่สนใจ | **ยุบรวมกับข้อ 9** → "จัดการ Shortlist" (ข้อ 9 ของรายการแก้เอกสาร) |
| 9. สร้าง Grouplist | **ลบ** (รวมเข้าข้อ 8 แล้ว) |
| 10. ดูข้อมูลผ่านแดชบอร์ด | คงไว้ |
| — | **เพิ่ม** "ประเมินโปรไฟล์ของตนเอง" (ข้อ 12) |
| — | **เพิ่ม** "จัดการตำแหน่งงาน" — ดูหมายเหตุข้างล่าง |
| — | **เพิ่ม** "ตรวจสอบคิวข้อมูลและระงับตามคำขอ" — ดูหมายเหตุข้างล่าง |

> ⚠ **สองข้อสุดท้ายยังไม่ได้ตัดสิน** ผมเสนอเพิ่มเพราะทั้งคู่มีอยู่จริงในระบบและ
> ไม่มี Use case รองรับเลย
>
> - **จัดการตำแหน่งงาน** — เล่มมีตาราง `Job_Posting` และ `Matching_Results`
>   ในหัวข้อ 3.6 อยู่แล้ว แต่ไม่มี Use case ว่าใครสร้าง แก้ไข หรือลบตำแหน่งงาน
>   ทั้งที่ระบบทำได้ครบและมีประตูสิทธิ์กั้นไว้ที่ระดับ `data_manager`
> - **ตรวจสอบคิวและระงับตามคำขอ** — เป็นกลไก PDPA ที่หัวข้อ 3.8 (ร่างใหม่)
>   อธิบายไว้ ถ้าไม่มี Use case รองรับ จะมีกลไกที่บทที่ 3 พูดถึงแต่ไม่มีใครสั่งงานมัน
>
> **ถ้าคิดว่าขอบเขตกว้างไปแล้ว ตัดสองข้อนี้ออกได้** แค่ต้องรู้ว่ากำลังตัดอะไรทิ้ง

## Source (ใช้วางแผนเนื้อหา ไม่ใช่ภาพส่งจริง)

```mermaid
flowchart LR
    subgraph actors[" "]
        direction TB
        M(("👤<br>ผู้ใช้ทั่วไป<br>member"))
        D(("👤<br>ผู้จัดการข้อมูล<br>data_manager"))
        A(("👤<br>ผู้ดูแลระบบ<br>admin"))
    end

    subgraph sys["ระบบจับคู่งาน"]
        direction TB
        U1(["1. เข้าสู่ระบบ"])
        U7(["2. ค้นหา/คัดกรองผู้สมัคร"])
        U4(["3. ประเมินความเหมาะสมของผู้สมัคร"])
        U8(["4. จัดการ Shortlist"])
        U10(["5. ดูข้อมูลผ่านแดชบอร์ด"])
        U6(["6. ตั้งค่าข้อมูลส่วนตัว"])
        U11(["7. ประเมินโปรไฟล์ของตนเอง"])
        U3(["8. นำเข้าข้อมูลผู้สมัคร"])
        U12(["9. ตรวจสอบคิวและระงับตามคำขอ"])
        U13(["10. จัดการตำแหน่งงาน"])
        U2(["11. จัดการข้อมูลผู้ใช้"])
    end

    M --- U1
    M --- U7
    M --- U4
    M --- U8
    M --- U10
    M --- U6
    M --- U11

    D --- U3
    D --- U12
    D --- U13

    A --- U2

    U3 -.->|extend| U12
    U7 -.->|include| U1
```

> **สิ่งที่ต้องแก้ตอนวาดจริงใน draw.io**
>
> - เปลี่ยนกล่องสี่เหลี่ยมมนเป็น **วงรี** ตามมาตรฐาน UML
> - เปลี่ยนวงกลมเป็น **รูปคน (stick figure)**
> - ใส่ **กรอบสี่เหลี่ยมรอบ Use case ทั้งหมด** พร้อมชื่อระบบที่ขอบบน
>   (System Boundary) — Mermaid วาด `subgraph` ให้แล้วแต่หน้าตาไม่ใช่ UML
> - ลากเส้น **generalization (หัวลูกศรสามเหลี่ยมโปร่ง)** จาก `data_manager`
>   ไปยัง `member` และจาก `admin` ไปยัง `data_manager`
>   **ข้อนี้สำคัญและเล่มเดิมไม่มี** เพราะระบบใช้สิทธิ์แบบลำดับชั้นจริง —
>   `admin` ทำทุกอย่างที่ `member` ทำได้ ถ้าไม่วาด generalization จะต้องลากเส้น
>   จาก actor ทั้งสามไปยัง use case เดียวกันซ้ำสามรอบ ภาพจะรกและสื่อผิดว่า
>   เป็นสิทธิ์คนละชุดที่บังเอิญเหมือนกัน

---

# 3. Activity Diagram

## 3.4.4 — เขียนใหม่ทั้งอัน

**ชื่อเดิม** "การสั่ง AI วิเคราะห์ข้อมูล" → **ชื่อใหม่** "การประเมินความเหมาะสม
ของผู้สมัครกับตำแหน่งงาน"

```mermaid
flowchart TD
    S((เริ่ม)) --> A1[เปิดหน้ารายละเอียดผู้สมัคร]
    A1 --> A2[กรอกความต้องการของตำแหน่งงาน<br>หรือใช้ค่าตั้งต้นจากหน้าตั้งค่า]
    A2 --> A3[กดปุ่มประเมิน]
    A3 --> B1[ตรวจสอบสิทธิ์การเข้าถึง]
    B1 --> C1{มีสิทธิ์หรือไม่}
    C1 -->|ไม่มี| E1[แจ้งว่าไม่มีสิทธิ์] --> E((จบ))
    C1 -->|มี| B2[คำนวณค่าแฮชของข้อความความต้องการ]
    B2 --> C2{เคยประเมินด้วยความต้องการนี้แล้วหรือไม่}
    C2 -->|เคย| B6[คืนผลที่บันทึกไว้<br>ไม่เรียกใช้ AI ไม่เสียค่าใช้จ่าย]
    C2 -->|ยังไม่เคย| B3[ส่งข้อมูลผู้สมัครและความต้องการ<br>ไปยัง Google Gemini]
    B3 --> C3{AI ตอบกลับภายในเวลาที่กำหนดหรือไม่}
    C3 -->|ไม่ตอบ / ผิดพลาด| E2[แจ้งให้ลองใหม่<br>ไม่บันทึกผลที่ไม่สมบูรณ์] --> E
    C3 -->|ตอบ| B4[รับคะแนน 0-100 และเหตุผลภาษาไทย]
    B4 --> B5[บันทึกผลลงตาราง analyses<br>เพื่อใช้ซ้ำ]
    B5 --> B7[แสดงคะแนนและเหตุผล]
    B6 --> B7
    B7 --> E
```

> **สองจุดที่ควรทำให้เด่นในภาพ** เพราะเป็นการตัดสินใจเชิงออกแบบ
>
> 1. **กิ่ง "เคยประเมินแล้ว → คืนผลเดิม"** คือกลไกแคชที่ทำให้ระบบอยู่ในโควตา
>    ฟรีของ Gemini ได้ ไม่ใช่รายละเอียดการทำงานที่ตัดทิ้งได้
> 2. **"ไม่บันทึกผลที่ไม่สมบูรณ์"** ในกิ่งที่ AI ล้มเหลว

## 3.4.6 — รวม 3.4.6 กับ 3.4.8 เป็นอันเดียว

**ชื่อใหม่** "การจัดการ Shortlist" (ลบ 3.4.8 ทิ้ง เลื่อน 3.4.7 ไปเป็น 3.4.7 เหมือนเดิม)

```mermaid
flowchart TD
    S((เริ่ม)) --> A1[เปิดหน้าผลการค้นหา<br>หรือหน้ารายละเอียดผู้สมัคร]
    A1 --> A2[กดเพิ่มเข้า Shortlist]
    A2 --> B1[แสดงรายการ Shortlist ที่ผู้ใช้เป็นเจ้าของ]
    B1 --> C1{ผู้ใช้เลือกอย่างไร}
    C1 -->|เลือกรายการที่มีอยู่| A3[เลือก Shortlist]
    C1 -->|สร้างใหม่| A4[ตั้งชื่อ Shortlist ใหม่]
    A4 --> B2[สร้างรายการใหม่<br>ผูกกับเจ้าของ] --> A3
    A3 --> B3[บันทึกผู้สมัครเข้า Shortlist]
    B3 --> C2{ผู้สมัครอยู่ในรายการนี้แล้วหรือไม่}
    C2 -->|อยู่แล้ว| B4[ไม่บันทึกซ้ำ] --> B5
    C2 -->|ยังไม่อยู่| B6[เพิ่มรายการ] --> B5
    B5[แสดงผลการบันทึก] --> E((จบ))
```

> **จุดที่การรวมสองไดอะแกรมทำให้เห็นชัดขึ้น** — เดิมเล่มแยก "บุ๊กมาร์ก" กับ
> "สร้าง Grouplist" เป็นสองภาพ ซึ่งบังคับให้ผู้ใช้ตัดสินใจตั้งแต่ต้นว่าจะทำอย่างไหน
> พอรวมแล้วจะเห็นว่ามันคือ flow เดียวที่มีทางแยกตรงกลาง (เลือกรายการเดิม หรือ
> สร้างใหม่) ซึ่งตรงกับที่ระบบทำจริงและง่ายกว่าสำหรับผู้ใช้
>
> **กิ่ง "อยู่แล้ว → ไม่บันทึกซ้ำ"** มาจากคีย์หลักคู่ `(shortlist_id, candidate_id)`
> ในฐานข้อมูล ไม่ใช่ตรรกะที่เขียนเพิ่ม

## 3.4.9 — ใหม่

ผังลำดับอยู่ใน **ส่วน ง** ของไฟล์ `2026-09-09-new-sections-draft.md` แล้ว
ด้านล่างคือ source สำหรับเรนเดอร์

```mermaid
flowchart TD
    S((เริ่ม)) --> A1[เปิดหน้าประเมินตัวเอง]
    A1 --> B1[แสดงทางเลือกสองทาง]
    B1 --> C1{ผู้ใช้เลือกอย่างไร}
    C1 -->|กรอกเอง| B5
    C1 -->|อัปโหลดไฟล์| A2[เลือกไฟล์ PDF]
    A2 --> B2[ส่งไฟล์ให้ AI อ่านแบบ Multimodal]
    B2 --> C2{อ่านสำเร็จหรือไม่}
    C2 -->|ไม่สำเร็จ| E1[แจ้งข้อผิดพลาด<br>เสนอให้กรอกเอง] --> B5
    C2 -->|สำเร็จ| B3[สกัดข้อมูลเป็นร่าง<br>ไม่สกัดข้อมูลอ่อนไหว]
    B3 --> B4["<b>ไม่บันทึกลงฐานข้อมูล</b>"]
    B4 --> B5[แสดงแบบฟอร์มให้ตรวจสอบ]
    B5 --> A3[ตรวจสอบและแก้ไขข้อมูล]
    A3 --> A4[กดยืนยันบันทึก]
    A4 --> B6[ตรวจความถูกต้องฝั่งเซิร์ฟเวอร์]
    B6 --> C3{ข้อมูลถูกต้องหรือไม่}
    C3 -->|ไม่ถูกต้อง| E2[แจ้งช่องที่ผิด] --> A3
    C3 -->|ถูกต้อง| B7[AI วิเคราะห์จุดแข็ง จุดที่ยังขาด<br>และสิ่งที่ควรพัฒนา]
    B7 --> B8[สร้างเวกเตอร์ความหมาย 768 มิติ]
    B8 --> C4{ทุกขั้นตอนสำเร็จหรือไม่}
    C4 -->|ล้มเหลว| E3["แจ้งข้อผิดพลาด<br><b>ไม่บันทึกสิ่งใดเลย</b>"] --> E((จบ))
    C4 -->|สำเร็จ| B9[บันทึกลงตาราง self_profiles]
    B9 --> B10[แสดงผลวิเคราะห์]
    B10 --> B11[จัดอันดับตำแหน่งงานที่เหมาะสม<br>เปรียบเทียบเวกเตอร์ ไม่เรียกใช้ AI]
    B11 --> A5[ดูรายการตำแหน่งงาน] --> E
```

> **ทั้งสามไดอะแกรมข้างบนควรวาดจริงแบบ Swimlane 2 ช่อง** (ผู้ใช้ / ระบบ)
> ให้เหมือนกับ Activity Diagram อื่นในเล่ม กล่องที่ขึ้นต้นด้วย "A" ในโค้ดคือ
> ฝั่งผู้ใช้ ส่วน "B" คือฝั่งระบบ — แบ่งไว้ให้แล้วเพื่อให้ลากเส้นแบ่งช่องได้ง่าย

---

# 4. System Architecture Design (หัวข้อ 3.1)

## สิ่งที่ต้องเอาออกและใส่เข้า

| เอาออก | เพราะ |
|---|---|
| กล่อง **Express.js** | ไม่มีในระบบ API เป็น Route Handler ของ Next.js (ข้อ 1) |
| กล่อง **Docker** | ไม่มีในระบบ deploy บน Vercel (ข้อ 2) |

| ใส่เข้า | เพราะ |
|---|---|
| **Supabase** แทน "PostgreSQL" ลอยๆ | ทำหน้าที่ทั้งฐานข้อมูล ระบบบัญชี และ REST API (ข้อ 3) |
| **pgvector** ในกล่องฐานข้อมูล | เป็นสิ่งที่ทำให้ RAG ในหัวข้อ 2.3.5 ทำงานได้จริง |
| **GitHub Actions** | รอบดึงข้อมูลอัตโนมัติทุกคืน ไม่ได้รันบนเว็บเซิร์ฟเวอร์ |
| **Vercel** | สภาพแวดล้อมที่ระบบทำงานอยู่ |

## Source

```mermaid
flowchart TB
    subgraph browser["เบราว์เซอร์ผู้ใช้"]
        UI["หน้าเว็บ<br>(React Server + Client Component)"]
    end

    subgraph vercel["Vercel (Serverless)"]
        NEXT["Next.js 15 App Router"]
        API["API Route Handler<br>app/api/**/route.ts"]
        MW["Middleware<br>ตรวจสอบการเข้าสู่ระบบ"]
    end

    subgraph gha["GitHub Actions"]
        CRON["สคริปต์ดึงข้อมูลอัตโนมัติ<br>ทำงานทุกคืน 02:00 น."]
    end

    subgraph supabase["Supabase (สิงคโปร์/สหรัฐอเมริกา)"]
        AUTH["Supabase Auth<br>บัญชีผู้ใช้และรหัสผ่าน"]
        PG[("PostgreSQL 17<br>+ extension pgvector")]
        RLS["Row Level Security<br>+ Column-level Grant"]
    end

    subgraph google["Google (นอกประเทศไทย)"]
        GEN["Gemini<br>สกัดข้อมูล / ให้คะแนน / วิเคราะห์"]
        EMB["Gemini Embedding<br>แปลงข้อความเป็นเวกเตอร์ 768 มิติ"]
    end

    PB["PhantomBuster<br>ดึงข้อมูลโปรไฟล์จาก LinkedIn"]

    UI -->|"HTTPS"| NEXT
    UI -.->|"อ่านข้อมูลจำกัดสิทธิ์<br>ผ่าน anon key"| RLS
    NEXT --> MW
    MW --> API
    API -->|"service-role key<br>(ฝั่งเซิร์ฟเวอร์เท่านั้น)"| PG
    API --> GEN
    API --> EMB
    AUTH --- PG
    RLS --- PG
    PB -->|"ไฟล์ CSV"| CRON
    CRON -->|"service-role key"| PG
    CRON --> EMB
```

> **สามอย่างที่ภาพนี้ต้องสื่อให้ได้ ไม่งั้นวาดใหม่ก็ยังไม่ตรง**
>
> 1. **เบราว์เซอร์ต่อฐานข้อมูลได้ 2 เส้นทาง** — เส้นทึบผ่าน API ของเรา (ใช้กุญแจ
>    service-role ตรวจสิทธิ์เอง) และเส้นประตรงไปยังฐานข้อมูลด้วยกุญแจสาธารณะ
>    ซึ่งถูกกั้นด้วย RLS + Column Grant **เส้นประนี้คือเหตุผลทั้งหมดที่ต้องมี
>    การควบคุมสิทธิ์ที่ฐานข้อมูล** ถ้าวาดแค่เส้นเดียวผ่าน API หัวข้อ 3.8.1
>    จะอ่านแล้วไม่เข้าใจว่ากันอะไรอยู่
> 2. **สคริปต์ดึงข้อมูลไม่ได้รันบนเว็บเซิร์ฟเวอร์** อยู่คนละกล่องกับ Vercel
>    เพราะงานนำเข้าข้อมูลหลายร้อยรายการใช้เวลาเกินเพดานของ Serverless Function
> 3. **กล่อง Google และ Supabase อยู่นอกประเทศไทย** ควรเขียนที่ตั้งกำกับไว้ในภาพ
>    เพราะเป็นสิ่งที่หัวข้อ 3.8.4 อ้างถึงเรื่องการโอนข้อมูลข้ามพรมแดน

---

# ลำดับที่แนะนำ

1. **System Architecture (3.1)** ก่อน — ง่ายที่สุดและเป็นภาพที่คนอ่านเจอก่อนเพื่อน
2. **ER Diagram (3.5)** — ใช้เวลานานที่สุด ทำตอนยังมีแรง
3. **Use Case Diagram (3.2)** — ต้องตัดสินเรื่อง 2 use case ที่ค้างอยู่ก่อน
4. **Activity Diagram** ทั้งสามอัน — ทำท้ายสุดเพราะอ้างอิงจากสามอันข้างบน
