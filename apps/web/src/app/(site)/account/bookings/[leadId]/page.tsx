import { Suspense } from "react";
import { BookingDetail } from "@/components/account/booking/booking-detail";
import { Spinner } from "@/components/ui/feedback";

export default function BookingPage({ params }: PageProps<"/account/bookings/[leadId]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <Booking params={params} />
    </Suspense>
  );
}

async function Booking({ params }: Pick<PageProps<"/account/bookings/[leadId]">, "params">) {
  const { leadId } = await params;
  return <BookingDetail leadId={leadId} />;
}
