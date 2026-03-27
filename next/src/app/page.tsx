import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingPage } from "@/components/landing/landing-page";
import { getFreeSpotsRemaining } from "@/actions/registration";

const githubEnabled = !!(
  (process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID) &&
  (process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET)
);

export default async function RootPage() {
  const session = await auth();

  if (session?.user?.email) {
    redirect("/finance");
  }

  const freeSpots = await getFreeSpotsRemaining();

  return <LandingPage freeSpots={freeSpots} githubEnabled={githubEnabled} />;
}
