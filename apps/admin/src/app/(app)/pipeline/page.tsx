import { redirect } from "next/navigation";

/** The pipeline board became the Enquiries inbox; old links still land somewhere useful. */
export default function PipelinePage() {
  redirect("/enquiries");
}
