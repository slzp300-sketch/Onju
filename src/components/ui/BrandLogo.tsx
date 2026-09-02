/**
 * 온주 브랜드 마크 — 시안에서 추출한 나무·새싹 성장 아이콘.
 * 로그인/회원가입/온보딩 등 인증·브랜딩 화면에서 사용.
 */
export default function BrandLogo({ size = 56 }: { size?: number }) {
  return (
    <img
      src="/brand/onju-tree-logo.webp"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className="brand-logo-image"
    />
  );
}
