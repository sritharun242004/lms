import { redirect } from "next/navigation";

// Feedback moved into the combined Forms & Feedback page/nav item.
// This keeps any existing /feedback bookmark or link working.
export default function FeedbackPage() {
  redirect("/forms?tab=feedback");
}
