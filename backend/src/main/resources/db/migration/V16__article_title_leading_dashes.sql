-- 제목 앞에 붙은 줄표 · 공백을 떼낸다 (Jira S15P31A102-213, docs/data-model.md article)
--
-- 팀원이 화면에서 「--코스피 또 폭락… AI·반도체 성장 제동 위기감」을 찾았다. 파싱이 덜 된 꼴로 보인다.
-- 2026-11-15 운영 전수(공개 · 숨김 합쳐 165,255건)에서 앞이 줄표 · 공백인 제목은 2건뿐이다.
--   기사 119022 「--코스피 또 폭락…」 — 뗀다
--   기사  11556 「-4% 급락하더니 돌연 ‘빨간불’…」 — 그대로 둔다. 이 「-」는 음수 부호다
-- 그래서 숫자 바로 앞의 줄표는 떼지 않는다((?![0-9])). 「[속보]」 · 「"」 · 「<신화통신>」은 정상이라 둔다.
-- 🔴 처음 판(2026-11-15 머지)은 공개 기사 23,439건만 세서 음수 부호를 못 봤다. 운영은 그때 V15 였고
--    이 마이그레이션은 한 번도 돌지 않아 파일을 그 자리에서 고쳤다 — 이미 돌렸다면 새 파일로 고쳐야 한다.
-- 앞으로 들어오는 기사는 B2 가 같은 규칙으로 뗀다(ArticleTitleCleaner.java). 두 곳이 같은지는 ArticleTitleMigrationTest 가 본다.
-- 떼고 나서 빈 값이 되는 제목(줄표뿐)은 그대로 둔다 — 같은 조건이 손질기에도 있다.
-- 되돌릴 수 없다 — 고치기 전 제목은 이 마이그레이션 직전 백업과 원본 파일에만 남는다
with cleaned as (
    select a.id,
           regexp_replace(regexp_replace(a.title, '^[\s\-‐-―]+(?![0-9])', ''), '^\s+', '') as title
    from article a
    where a.title ~ '^[\s\-‐-―]'
)
update article a
set title = c.title
from cleaned c
where c.id = a.id
  and c.title <> ''
  and c.title <> a.title;
