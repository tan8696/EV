import { redirect } from "next/navigation";

// The five feature pages merged into one cockpit.
export default function BreakdownPage() {
  redirect("/cockpit");
}
