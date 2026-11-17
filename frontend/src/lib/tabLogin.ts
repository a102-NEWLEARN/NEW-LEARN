// 「이 탭에서 로그인했다」 표시 — 화면을 다 닫으면 로그아웃하려고 둔다 (2026-11-17 사용자).
// sessionStorage 는 새로 고침에는 남고 탭을 닫으면 사라진다. 그래서 회원 세션이 살아 있는데 표시가 없으면 탭을 닫았다 다시 연 것이다.
// 다만 링크를 새 탭으로 열면(가운데 클릭 · target=_blank) 새 탭에는 표시가 없다 — 열려 있는 로그인한 탭에 물어 답이 오면 이어 간다.
// 브라우저를 닫으면 끝나는 쿠키 · 30분 미사용 만료는 서버가 맡는다(docs/api.md 1절 「인증」)

const KEY = "newlearn.tab-login";
const CHANNEL = "newlearn.tab-login";
/** 다른 탭의 답을 기다리는 시간. 같은 브라우저 안의 메시지라 보통 몇 ms 안에 온다 */
const ASK_WAIT = 150;

export function markTabLogin() {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // 저장소를 못 쓰면 표시 없이 둔다 — 읽을 때도 못 써서 막지 않는다
  }
}

export function clearTabLogin() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // 위와 같다
  }
}

/** 표시가 있나. 저장소를 못 쓰면 null — 그때는 지금처럼 로그인을 막지 않는다 */
function hasMark(): boolean | null {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return null;
  }
}

let answering = false;

/** 다른 탭이 「로그인한 탭 있나」 물으면 이 탭에 표시가 있을 때 답한다. 앱이 뜰 때 한 번 건다(main.tsx) */
export function answerOtherTabs() {
  if (answering || typeof BroadcastChannel === "undefined") return;
  answering = true;
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent) => {
    if (event.data === "ask" && hasMark()) channel.postMessage("here");
  };
}

/**
 * 회원 세션을 이 탭에서 이어 가도 되나. 표시가 있거나, 로그인한 다른 탭이 답하면(표시를 넘겨받는다) true.
 * 저장소 · 탭 사이 채널을 못 쓰는 브라우저면 물을 길이 없어 true — 그런 브라우저에서 로그인이 안 되게 하지 않는다
 */
export async function tabMayKeepLogin(): Promise<boolean> {
  const mark = hasMark();
  if (mark !== false || typeof BroadcastChannel === "undefined") return true;
  const answered = await new Promise<boolean>((resolve) => {
    const channel = new BroadcastChannel(CHANNEL);
    const done = (result: boolean) => {
      window.clearTimeout(timer);
      channel.close();
      resolve(result);
    };
    const timer = window.setTimeout(() => done(false), ASK_WAIT);
    channel.onmessage = (event: MessageEvent) => {
      if (event.data === "here") done(true);
    };
    channel.postMessage("ask");
  });
  if (answered) markTabLogin();
  return answered;
}
