import { Suspense } from "react";
import { PortalBookingDetail } from "@/components/portal/portal-booking-detail";
import { Spinner } from "@/components/ui/feedback";

export default function PortalBookingPage({ params }: PageProps<"/portal/bookings/[id]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <Booking params={params} />
    </Suspense>
  );
}

async function Booking({ params }: Pick<PageProps<"/portal/bookings/[id]">, "params">) {
  const { id } = await params;
  return <PortalBookingDetail bookingId={id} />;
}
