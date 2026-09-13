import { currentIdentity } from "@/lib/auth";
import { env } from "@/lib/config";
import GoogleLogin from "@/components/google-login";
import SharedLists from "@/components/shared-lists";
export const dynamic = "force-dynamic";
export default async function SharedPage() {
  const user = await currentIdentity();
  if (user) return <SharedLists uid={user.uid} email={user.email} />;
  const e = env();
  return <GoogleLogin enabled={!!e.firebaseApiKey && !!e.firebaseAppId} destination="/shared"
    config={{ apiKey: e.firebaseApiKey, appId: e.firebaseAppId, projectId: e.gcpProject, authDomain: "dmjone.firebaseapp.com" }} />;
}
