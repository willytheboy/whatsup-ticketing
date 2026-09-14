import { redirect } from "next/navigation";

/** Legacy route: Live became Radio. */
export default function Live() {
  redirect("/radio");
}
