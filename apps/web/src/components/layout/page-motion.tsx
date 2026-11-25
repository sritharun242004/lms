/**
 * The app's page wrapper. No enter animation: fading every page in from opacity 0 on each navigation
 * read as a flicker, especially on slower loads.
 */
export function PageMotion({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 w-full flex-1">{children}</div>;
}
