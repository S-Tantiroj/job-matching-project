-- กระจกเงาของ match_candidates แต่ยิงไปตาราง jobs
-- ใช้จัดอันดับงานที่เหมาะกับโปรไฟล์ของผู้ใช้ ไม่มีต้นทุน LLM
-- Additive: เพิ่มฟังก์ชันใหม่ ไม่แตะ jobs หรือฟังก์ชันเดิม
create or replace function match_jobs(query_embedding vector(768), match_count int)
returns table (id uuid, similarity float)
language sql stable as $$
  select j.id, 1 - (j.embedding <=> query_embedding) as similarity
  from jobs j
  where j.embedding is not null
  order by j.embedding <=> query_embedding
  limit match_count;
$$;
