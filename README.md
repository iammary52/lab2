# 오늘의 조각

사진과 짧은 메모를 남기는 모바일 대응 공개 게시판입니다.

## 구성

- 정적 HTML/CSS/JavaScript
- Supabase Database (`posts`)
- Supabase Storage (`post-images`)
- GitHub Pages 배포

별도의 빌드나 로그인 없이 사용할 수 있습니다. 게시글과 사진은 공개되므로
민감한 정보는 올리지 마세요.

## 로컬 실행

정적 파일 서버로 저장소 루트를 열면 됩니다.

```sh
python -m http.server 8000
```

그런 다음 <http://localhost:8000>에 접속하세요.

DB를 새로 구성해야 한다면 Supabase SQL Editor에서
[`supabase-schema.sql`](./supabase-schema.sql)을 실행하세요.
