import { redirect } from "next/navigation";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ['view', 'analysis']) {
    const value = params[key];
    if (typeof value === 'string') query.set(key, value);
  }
  redirect(query.size ? `/workspace?${query}` : '/index.html');
}
