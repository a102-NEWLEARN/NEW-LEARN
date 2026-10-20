import logoUrl from "../assets/newlearn-logo-horizontal.svg";

type LogoProps = {
  /** 로고 높이(px). 헤더는 20–32px, 최소 20px (DESIGN.md Brand & Style 로고 표) */
  height?: number;
};

// NEW:LEARN 가로 로고. 원본은 디자인 시스템 v2 의 newlearn-logo-horizontal.svg 다.
// Tailwind 기본 스타일(img { height: auto })이 height 속성을 이기므로 높이는 style 로 준다
export function Logo({ height = 24 }: LogoProps) {
  return (
    <img
      src={logoUrl}
      alt="NEW:LEARN"
      style={{ height }}
      className="block w-auto"
    />
  );
}
