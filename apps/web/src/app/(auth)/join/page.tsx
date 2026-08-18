import { redirect } from "next/navigation";

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const params = await searchParams;
  const code = Array.isArray(params.code) ? params.code[0] : params.code;
  redirect(code ? `/?code=${encodeURIComponent(code)}` : "/");
}
