import { useEffect, useRef } from "react";

// 혼자 눌러도 키보드로 옮긴 것이 아닌 키
const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift", "AltGraph"]);

/**
 * 마지막 입력이 키보드였나 — 그래프 노드처럼 브라우저가 :focus-visible 을 못 그리는 곳에서,
 * 키보드로 받은 포커스에만 테두리를 띄우려고 쓴다. 마우스 · 터치로 누른 노드가 받은 포커스는 호버가 맡는다.
 * 「누르는 중」으로는 못 가린다 — 터치는 손을 뗀 뒤에야 포커스가 온다
 */
export function useKeyboardInput() {
  const keyboardInput = useRef(true);
  useEffect(() => {
    // 수정키만 누른 것(Alt+Tab 으로 창을 오갈 때 등)은 치지 않는다 — 브라우저의 :focus-visible 과 같다
    const onKey = (key: globalThis.KeyboardEvent) => {
      if (MODIFIER_KEYS.has(key.key)) return;
      keyboardInput.current = true;
    };
    const onPointer = () => {
      keyboardInput.current = false;
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  return keyboardInput;
}
