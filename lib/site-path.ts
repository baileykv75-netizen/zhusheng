/**
 * Keeps public assets working both at the local root and under a GitHub Pages
 * project subpath. NEXT_PUBLIC_BASE_PATH is injected at build time only for
 * the Pages workflow.
 */
const configuredBasePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

export function publicAssetPath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${configuredBasePath}${normalizedPath}`;
}
