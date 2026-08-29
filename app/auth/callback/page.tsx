import { redirect } from "next/navigation";

export default function CognitoCallbackPage() {
  // Perfect Shade uses server actions for custom authentication. Reject any unsolicited Hosted
  // UI callback without rendering or forwarding authorization parameters.
  redirect("/sign-in?error=challenge");
}
