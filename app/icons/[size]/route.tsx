import { ImageResponse } from "next/og";

export async function GET(_req: Request, ctx: { params: Promise<{ size: string }> }) {
  const { size: raw } = await ctx.params;
  const size = raw === "512" ? 512 : 192;
  const ring = Math.round(size * 0.09);
  const inner = Math.round(size * 0.6);
  const dot = Math.round(size * 0.14);
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #fff6ef, #ffe9dd)",
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: inner,
            border: `${ring}px solid #ff4d8d`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: dot, height: dot, borderRadius: dot, background: "#a78bfa" }} />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
