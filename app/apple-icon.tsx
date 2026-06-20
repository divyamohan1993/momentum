import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// apple-touch-icon (iOS home screen). Sunrise gradient + ring + comet, matching the favicon.
export default function AppleIcon() {
  const ring = 13;
  const inner = 104;
  const dot = 24;
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#ff8a4c,#ff4d8d 52%,#a78bfa)",
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: inner,
            border: `${ring}px solid #ffffff`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
          }}
        >
          <div style={{ width: dot, height: dot, borderRadius: dot, background: "#ffffff", marginTop: -ring - 6 }} />
        </div>
      </div>
    ),
    size,
  );
}
