import SceneWrapper from "@/components/canvas/SceneWrapper";

export default function PortfolioLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <SceneWrapper style={{ pointerEvents: "none" }} eventPrefix="client" />
    </>
  );
}
