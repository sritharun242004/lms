import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/cms-logo-wordmark.jpg"
      alt="CMS AI Empowerment"
      width={1560}
      height={640}
      priority={priority}
      sizes="(max-width: 640px) 112px, 160px"
      className={cn("h-auto w-36 rounded-lg", className)}
    />
  );
}
