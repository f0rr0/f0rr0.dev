import type { ReactNode } from "react";
import { createContext, useContext } from "react";

type AssetContextValue = {
  assetBasePath?: string;
};

const AssetContext = createContext<AssetContextValue>({});

export const useAssetBasePath = () => useContext(AssetContext).assetBasePath;

type MDXContentProps = {
  assetBasePath?: string;
  children: ReactNode;
};

export default function MDXContent({
  assetBasePath,
  children,
}: MDXContentProps) {
  return (
    <AssetContext.Provider value={{ assetBasePath }}>
      {children}
    </AssetContext.Provider>
  );
}
