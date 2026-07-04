begin;

alter table public.posts
  add column if not exists author_id uuid references auth.users(id) on delete restrict;
alter table public.comments
  add column if not exists author_id uuid references auth.users(id) on delete restrict;

alter table public.posts alter column author_id set default auth.uid();
alter table public.comments alter column author_id set default auth.uid();

do $$
declare
  legacy_id uuid;
begin
  select id into legacy_id
  from auth.users
  where email = 'a@naver.com'
  limit 1;

  if legacy_id is null then
    raise exception 'legacy author a@naver.com not found';
  end if;

  update public.posts set author_id = legacy_id where author_id is null;
  update public.comments set author_id = legacy_id where author_id is null;
  update storage.objects
  set owner_id = legacy_id::text
  where bucket_id = 'post-images' and owner_id is null;
end $$;

alter table public.posts alter column author_id set not null;
alter table public.comments alter column author_id set not null;

alter table public.posts enable row level security;
alter table public.comments enable row level security;

revoke insert, update, delete on public.posts from anon;
revoke insert, update, delete on public.comments from anon;
grant select on public.posts to anon, authenticated;
grant select, insert, update, delete on public.posts to authenticated;
grant select on public.comments to anon, authenticated;
grant select, insert, update, delete on public.comments to authenticated;
grant usage, select on sequence public.posts_id_seq to authenticated;
grant usage, select on sequence public.comments_id_seq to authenticated;

drop policy if exists "posts_public_read" on public.posts;
drop policy if exists "posts_owner_insert" on public.posts;
drop policy if exists "posts_owner_update" on public.posts;
drop policy if exists "posts_owner_delete" on public.posts;

create policy "posts_public_read"
on public.posts for select to anon, authenticated using (true);

create policy "posts_owner_insert"
on public.posts for insert to authenticated
with check (auth.uid() = author_id);

create policy "posts_owner_update"
on public.posts for update to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

create policy "posts_owner_delete"
on public.posts for delete to authenticated
using (auth.uid() = author_id);

drop policy if exists "comments_public_read" on public.comments;
drop policy if exists "comments_owner_insert" on public.comments;
drop policy if exists "comments_owner_update" on public.comments;
drop policy if exists "comments_owner_delete" on public.comments;

create policy "comments_public_read"
on public.comments for select to anon, authenticated using (true);

create policy "comments_owner_insert"
on public.comments for insert to authenticated
with check (auth.uid() = author_id);

create policy "comments_owner_update"
on public.comments for update to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

create policy "comments_owner_delete"
on public.comments for delete to authenticated
using (auth.uid() = author_id);

drop policy if exists "Public read post images" on storage.objects;
drop policy if exists "Public upload post images" on storage.objects;
drop policy if exists "Public update post images" on storage.objects;
drop policy if exists "Public delete post images" on storage.objects;
drop policy if exists "post_images_public_read" on storage.objects;
drop policy if exists "post_images_owner_insert" on storage.objects;
drop policy if exists "post_images_owner_update" on storage.objects;
drop policy if exists "post_images_owner_delete" on storage.objects;

create policy "post_images_public_read"
on storage.objects for select to anon, authenticated
using (bucket_id = 'post-images');

create policy "post_images_owner_insert"
on storage.objects for insert to authenticated
with check (bucket_id = 'post-images' and owner_id = auth.uid()::text);

create policy "post_images_owner_update"
on storage.objects for update to authenticated
using (bucket_id = 'post-images' and owner_id = auth.uid()::text)
with check (bucket_id = 'post-images' and owner_id = auth.uid()::text);

create policy "post_images_owner_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'post-images' and owner_id = auth.uid()::text);

commit;
