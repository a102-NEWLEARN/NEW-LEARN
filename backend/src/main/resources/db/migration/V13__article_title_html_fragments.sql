-- 제목의 HTML 조각을 글자로 되돌린다 (Jira S15P31A102-178, docs/data-model.md article)
--
-- NewsData 제목에 HTML 표기에서 & 가 빠진 조각이 그대로 왔다(운영 약 941건, 본문은 0건).
-- 앞으로 들어오는 기사는 B2 가 같은 표로 고친다(ArticleTitleCleaner.java). 두 곳이 같은지는 ArticleTitleCleanerTest 가 본다
-- 되돌릴 수 없다 — 고치기 전 제목은 이 마이그레이션 직전 백업과 원본 파일에만 남는다
update article
set title = regexp_replace(
        regexp_replace(
            regexp_replace(
                replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(title,
                    'quot;', '"'),
                    'hellip;', '…'),
                    'middot;', '·'),
                    'lsquo;', '‘'),
                    'rsquo;', '’'),
                    'ldquo;', '“'),
                    'rdquo;', '”'),
                    'rarr;', '→'),
                    'uarr;', '↑'),
                    'ndash;', '–'),
                '(?<![A-Za-z])lt;', '<', 'g'),
            '(?<![A-Za-z])gt;', '>', 'g'),
        '(?<=[A-Z])amp;(?=[A-Z])', '&', 'g')
where title ~ '(quot|hellip|middot|lsquo|rsquo|ldquo|rdquo|rarr|uarr|ndash|lt|gt|amp);';
