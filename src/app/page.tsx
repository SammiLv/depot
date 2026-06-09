import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/current-user";

type HomeProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { token } = await searchParams;

  if (token) {
    redirect(`/login/dingtalk/callback?token=${encodeURIComponent(token)}`);
  }

  const currentUser = await getCurrentUser();

  redirect(currentUser ? "/dashboard" : "/login");
}