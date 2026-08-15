import { ImageResponse } from "next/og";

export const alt = "Sid Jain — Applied AI engineer";
export const size = {
  height: 630,
  width: 1200,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background: "#faf9f6",
        color: "#292524",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        justifyContent: "space-between",
        padding: "76px 82px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          fontSize: 25,
          fontWeight: 600,
          justifyContent: "space-between",
          letterSpacing: "-0.02em",
        }}
      >
        <span>Sid Jain</span>
        <span style={{ color: "#78716c", fontSize: 18, fontWeight: 400 }}>
          f0rr0.dev
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            fontFamily: "serif",
            fontSize: 68,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            lineHeight: 1.08,
            maxWidth: 900,
          }}
        >
          Building AI products that hold up in the real world.
        </div>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            marginTop: 52,
            width: "100%",
          }}
        >
          <span
            style={{
              background: "#b45309",
              borderRadius: 999,
              display: "flex",
              height: 14,
              width: 14,
            }}
          />
          <span
            style={{
              background: "#b45309",
              display: "flex",
              height: 2,
              width: 470,
            }}
          />
          <span
            style={{
              background: "#e7e5e4",
              display: "flex",
              height: 2,
              width: 390,
            }}
          />
          <span
            style={{
              background: "#e7e5e4",
              display: "flex",
              height: 82,
              marginLeft: -260,
              marginTop: 80,
              transform: "rotate(-34deg)",
              width: 2,
            }}
          />
        </div>
      </div>
      <div style={{ color: "#78716c", display: "flex", fontSize: 20 }}>
        Applied AI · product systems · open source · writing
      </div>
    </div>,
    size
  );
}
