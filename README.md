# 오늘의 조각

사진과 짧은 메모를 남기는 모바일 대응 공개 게시판입니다.

## 구성

- 정적 HTML/CSS/JavaScript
- Supabase Auth (이메일 인증)
- Supabase Database (`posts`, `comments`) + RLS
- Supabase Storage (`post-images`)
- GitHub Pages 배포

별도의 빌드 없이 사용할 수 있습니다. 열람은 공개이며, 작성·수정·삭제는
이메일 인증을 마친 작성자 본인에게만 허용됩니다.

## 로컬 실행

정적 파일 서버로 저장소 루트를 열면 됩니다.

```sh
python -m http.server 8000
```

그런 다음 <http://localhost:8000>에 접속하세요.

DB를 새로 구성해야 한다면 Supabase SQL Editor에서
[`supabase-schema.sql`](./supabase-schema.sql)을 실행하세요.

기존 공개 DB에 소유권과 RLS를 적용할 때는 먼저 `a@naver.com` 사용자를
확인 완료 상태로 만든 후 [`supabase-rls-migration.sql`](./supabase-rls-migration.sql)을 실행하세요.
