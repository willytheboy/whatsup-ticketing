import { redirect } from "next/navigation";

/** Legacy route: My tickets became the Wallet. */
export default function Tickets() {
  redirect("/wallet");
}
