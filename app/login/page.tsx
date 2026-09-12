import { redirect } from "next/navigation";
import { currentOwner } from "@/lib/auth";
import { env } from "@/lib/config";
import GoogleLogin from "@/components/google-login";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await currentOwner()) redirect("/");
  const e = env();
  return <GoogleLogin enabled={!!e.firebaseApiKey && !!e.firebaseAppId && !!e.ownerGoogleUid && !!e.ownerGoogleSub}
    config={{ apiKey: e.firebaseApiKey, appId: e.firebaseAppId, projectId: e.gcpProject, authDomain: "dmjone.firebaseapp.com" }} />;
}
