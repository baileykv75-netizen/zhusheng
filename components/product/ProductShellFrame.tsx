import type { ProductArea, ProductPresentationMode } from "@/lib/product/building-context";

export function ProductShellFrame({
  mode,
  area,
  children
}: {
  mode: ProductPresentationMode;
  area: ProductArea;
  children: React.ReactNode;
}) {
  const legacyLayoutClass = mode === "CINEMATIC" ? "exhibit-shell" : "app-shell journey-shell";
  return <div className={`product-shell ${legacyLayoutClass}`} data-product-mode={mode.toLowerCase()} data-product-area={area.toLowerCase()}>{children}</div>;
}
