-- Make match_candidates_filtered matching more forgiving:
--   * field/degree: case-insensitive SUBSTRING (ILIKE) match, ANY term — so
--     "Master" matches "Master of Science" and "Computer Science" matches a
--     longer stored field string. Exact equality was too strict for degree
--     levels and partial field names.
--   * skills: case-insensitive ALL-match (AND) — "python" matches "Python".
-- Additive: create-or-replace of the function from migration 006. Does NOT touch
-- the jobs table or the original match_candidates function.

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
        and exists (
          select 1 from unnest(p_field_or_degree) as term
          where e.field_of_study ilike '%' || term || '%'
             or e.degree ilike '%' || term || '%'
        )))
    and (p_skills is null or (
      select count(distinct lower(s.name))
      from candidate_skills cs join skills s on s.id = cs.skill_id
      where cs.candidate_id = c.id
        and lower(s.name) = any (select lower(x) from unnest(p_skills) as x)
    ) = array_length(p_skills, 1))
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
