// SF Symbols 風のインラインSVGアイコン（stroke: currentColor）
// サーバー・クライアント両方から使う。装飾用なので aria-hidden。

function Svg(props: { size?: number; children: React.ReactNode; strokeWidth?: number }) {
  const s = props.size ?? 24;
  return (
    <svg
      width={s} height={s} viewBox="0 0 24 24" aria-hidden
      fill="none" stroke="currentColor"
      strokeWidth={props.strokeWidth ?? 1.7} strokeLinecap="round" strokeLinejoin="round"
    >
      {props.children}
    </svg>
  );
}

export function IconNews({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <path d="M7.5 9.5h9M7.5 12.5h9M7.5 15.5h5" />
    </Svg>
  );
}

export function IconList({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.5" cy="6.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17.5" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconRadiowaves({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
      <path d="M8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6" />
      <path d="M5.4 18.6a9.4 9.4 0 0 1 0-13.2M18.6 5.4a9.4 9.4 0 0 1 0 13.2" />
    </Svg>
  );
}

export function IconInfo({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 11.2v5" strokeWidth={2} />
      <circle cx="12" cy="7.8" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconMenu({ size }: { size?: number }) {
  return (
    <Svg size={size} strokeWidth={2}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

// リスト行の末尾シェブロン（iOS の disclosure indicator）
export function Chevron() {
  return (
    <svg className="chevron" width="14" height="14" viewBox="0 0 24 24" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5.5l6.5 6.5L9 18.5" />
    </svg>
  );
}

export function ChevronBack() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5.5L8.5 12l6.5 6.5" />
    </svg>
  );
}

// 外部リンクを示す小さな ↗
export function ExternalArrow() {
  return (
    <svg className="ext-arrow" width="11" height="11" viewBox="0 0 24 24" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7M9.5 7H17v7.5" />
    </svg>
  );
}

export function IconGear({ size }: { size?: number }) {
  const sz = size ?? 20;
  return (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
