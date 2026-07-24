-- Interactive filter-chip search. Additive: adds a nullable column and a NEW
-- function. Does NOT drop/alter existing tables, the jobs table, or the
-- existing match_candidates function.

alter table public.candidates add column if not exists years_experience int;

-- Vector search with hard filters applied in SQL BEFORE ranking. Every filter
-- param is null / false / empty = "no constraint".
--   p_skills:          candidate must have ALL of these skill names (AND)
--   p_any_foreign:     true => must have an education row with country <> 'Thailand'
--   p_countries:       must have an education row whose country is in this list
--   p_min_years:       candidates.years_experience >= this
--   p_field_or_degree: must have an education row whose field_of_study OR degree
--                      is in this list (ANY)
create or replace function match_candidates_filtered(
  query_embedding vector(768),
  match_count int,
  p_skills text[] default null,
  p_any_foreign boolean default false,
  p_countries text[] default null,
  p_min_years int default null,
  p_field_or_degree text[] default null
)
returns table (id uuid, similarity float)
language sql stable as $$
  select c.id, 1 - (c.embedding <=> query_embedding) as similarity
  from candidates c
  where c.embedding is not null
    and (p_min_years is null or c.years_experience >= p_min_years)
    and (p_any_foreign = false or exists (
      select 1 from education e
      where e.candidate_id = c.id and e.country is not null and e.country <> 'Thailand'))
    and (p_countries is null or exists (
      select 1 from education e
      where e.candidate_id = c.id and e.country = any(p_countries)))
    and (p_field_or_degree is null or exists (
      select 1 from education e
      where e.candidate_id = c.id
        and (e.field_of_study = any(p_field_or_degree) or e.degree = any(p_field_or_degree))))
    and (p_skills is null or (
      select count(distinct s.name)
      from candidate_skills cs join skills s on s.id = cs.skill_id
      where cs.candidate_id = c.id and s.name = any(p_skills)
    ) = array_length(p_skills, 1))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
