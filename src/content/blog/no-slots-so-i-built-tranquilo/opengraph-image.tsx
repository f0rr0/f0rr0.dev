import { ImageResponse } from "next/og";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background:
          "radial-gradient(circle at 82% 16%, #143c2b 0, #07100c 33%, #030504 72%)",
        color: "#f3f7f5",
        display: "flex",
        flexDirection: "column",
        fontFamily: "sans-serif",
        height: "100%",
        justifyContent: "space-between",
        padding: "68px 76px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          fontSize: 24,
          fontWeight: 700,
          gap: 14,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        <div
          style={{
            background: "#42e59b",
            borderRadius: 999,
            boxShadow: "0 0 36px #42e59b88",
            display: "flex",
            height: 14,
            width: 14,
          }}
        />
        Tranquilo
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 82,
            fontWeight: 800,
            letterSpacing: "-0.055em",
            lineHeight: 0.96,
            maxWidth: 900,
          }}
        >
          <span>No slots.</span>
          <span style={{ color: "#42e59b" }}>So I built a watcher.</span>
        </div>
        <div
          style={{
            color: "#a8b7b0",
            display: "flex",
            fontSize: 29,
            lineHeight: 1.35,
            maxWidth: 880,
          }}
        >
          Ranked availability, OS-native watches, safe MCP tools, and a
          human-controlled UPI checkout.
        </div>
      </div>

      <div
        style={{
          alignItems: "center",
          border: "1px solid #28483a",
          borderRadius: 16,
          color: "#a8b7b0",
          display: "flex",
          fontFamily: "monospace",
          fontSize: 22,
          gap: 16,
          padding: "18px 22px",
        }}
      >
        <span style={{ color: "#42e59b" }}>$</span>
        tranquilo househelp watch create --window after-work
      </div>
    </div>,
    {
      height: 630,
      width: 1200,
    }
  );
}
