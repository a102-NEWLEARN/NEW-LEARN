import { useEffect } from "react";

const APP_NAME = "NEW:LEARN";

// 브라우저 탭 제목을 「화면 이름 | NEW:LEARN」으로 바꾼다 (EXPERIENCE.md Accessibility Floor).
// 화면을 떠나면 서비스 이름만 남겨, 제목을 정하지 않은 화면에 앞 화면 이름이 남지 않게 한다
export function usePageTitle(name: string) {
  useEffect(() => {
    document.title = `${name} | ${APP_NAME}`;
    return () => {
      document.title = APP_NAME;
    };
  }, [name]);
}
