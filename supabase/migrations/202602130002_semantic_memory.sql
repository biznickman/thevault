create extension if not exists vector;

create index if not exists idx_member_facts_embedding on member_facts
  using hnsw (fact_embedding vector_cosine_ops);

create or replace function match_member_facts_by_embedding(
  p_member_id uuid,
  p_query_embedding vector(1536),
  p_limit integer default 5
)
returns table (
  category text,
  fact text,
  confidence real,
  updated_at timestamptz,
  similarity real
)
language sql
stable
as $$
  select
    mf.category,
    mf.fact,
    mf.confidence,
    mf.updated_at,
    (1 - (mf.fact_embedding <=> p_query_embedding))::real as similarity
  from member_facts mf
  where mf.member_id = p_member_id
    and mf.is_active = true
    and mf.fact_embedding is not null
  order by mf.fact_embedding <=> p_query_embedding
  limit greatest(p_limit, 1);
$$;
