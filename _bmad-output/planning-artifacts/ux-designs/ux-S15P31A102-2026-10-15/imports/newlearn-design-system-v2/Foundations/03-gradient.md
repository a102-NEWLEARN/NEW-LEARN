# Gradient

그라디언트는 배경과 아이콘에서 입체감이나 AI 기능을 표현할 때 쓰는 색상 토큰입니다. 이 시스템에서는 각 그라디언트의 **stop 색을 색상 토큰으로** 두었습니다. 이름 끝 숫자가 stop 위치(%)입니다. NEW:LEARN은 라이트 테마만 쓰므로 라이트 값을 기준으로 봅니다.

> **NEW:LEARN에서는** 스켈레톤 로딩의 `shimmer-neutral`만 씁니다. magic 계열(glow·highlight·shimmer-magic)은 SEED 원본의 AI 표현이라 NEW:LEARN 브랜드 표현에 쓰지 않고, 버튼·카드·배경에도 그라디언트를 넣지 않습니다. 브랜드 강조는 단색 민트(`bg-brand-accent`)로 합니다.

| 그라디언트 | stop 토큰 | 쓰임 |
| --- | --- | --- |
| glow-magic | `gradient-glow-magic-0`, `-80`, `-100` | 반짝이는 느낌의 AI 배경. Callout·Page Banner의 magic 톤 |
| glow-magic-pressed | `gradient-glow-magic-pressed-0`, `-80`, `-100` | 위의 눌린 상태 |
| highlight-magic | `gradient-highlight-magic-20`, `-100` | 아이콘·도형에서 AI 기능 표현 |
| highlight-magic-pressed | `gradient-highlight-magic-pressed-20`, `-100` | 위의 눌린 상태 |
| shimmer-magic | `gradient-shimmer-magic-0`, `-46`, `-54`, `-100` | AI Skeleton의 반짝임 |
| shimmer-neutral | `gradient-shimmer-neutral-0`, `-46`, `-54`, `-100` | 일반 Skeleton의 반짝임 |

## 조합하기

SEED 컴포넌트는 magic 배경에 88°, Skeleton 반짝임에 90° 방향을 씁니다.

```css
.callout--magic {
  background-image: linear-gradient(88deg,
    var(--gradient-glow-magic-0) 0%,
    var(--gradient-glow-magic-80) 80%,
    var(--gradient-glow-magic-100) 100%);
}
.skeleton::after {
  background-image: linear-gradient(90deg,
    var(--gradient-shimmer-neutral-0) 0%,
    var(--gradient-shimmer-neutral-46) 46%,
    var(--gradient-shimmer-neutral-54) 54%,
    var(--gradient-shimmer-neutral-100) 100%);
}
```

SEED CSS를 쓸 때는 stop 목록 전체가 한 변수(`--seed-gradient-glow-magic`)로 노출되어 `linear-gradient(88deg, var(--seed-gradient-glow-magic))`로 씁니다.

## NEW:LEARN에서 쓰지 않는 이유

magic 계열은 브랜드 역할이 아니라 AI 기능 전용 색이라 원본 값을 유지했습니다. 특히 `highlight-magic`은 당근 오렌지(#ff6600)에서 핑크(#d25aca)로 이어지므로, NEW:LEARN의 민트 화면에서 AI 표시가 브랜드와 다른 색으로 튀어 보일 수 있습니다. 의도한 대비라면 그대로 두고, 아니라면 팀에서 magic 그라디언트를 따로 정의하세요. glow·shimmer는 거의 무채색이라 영향이 적습니다.

## Fade mask (개발 전용)

콘텐츠 끝을 부드럽게 가리는 알파 마스크로, 라이트/다크 값이 같고 Figma에는 없는 토큰입니다. 16개 stop이라 토큰 대신 값을 그대로 적습니다. 알파 0인 쪽이 가려지므로, 방향은 사라지게 할 가장자리 쪽으로 정하세요(아래 예시는 위쪽이 가려짐).

```css
mask-image: linear-gradient(to bottom, #0000 0%, #00000003 8%, #00000005 16%, #0000000d 22%, #00000014 29%, #00000021 35%, #0000002e 41%, #00000040 47%, #00000052 53%, #0006 59%, #0000007a 65%, #00000094 71%, #000000ab 78%, #000000c7 84%, #000000e3 92%, #000 100%);
```
