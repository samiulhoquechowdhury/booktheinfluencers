import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Cancellation policy" };

export default function CancellationPolicyPage() {
  return (
    <LegalPage title="Cancellation policy" updated="26 Oct 2026">
      <p>
        Plans change. This policy explains what happens when a confirmed booking is cancelled. The terms in your signed
        agreement apply if they differ.
      </p>
      <h2>If you cancel</h2>
      <ul>
        <li>Ask your booking manager or use "Need to cancel?" on your booking page. Nothing is cancelled until your manager confirms it with you.</li>
        <li>Any refund depends on how close to the event you cancel and on costs already committed, such as travel. Your manager confirms the exact amount in writing before you decide.</li>
      </ul>
      <h2>If the artist cancels</h2>
      <ul>
        <li>You get a full refund of everything you've paid for that artist, or a replacement artist if you'd prefer one.</li>
      </ul>
      <h2>Rescheduling</h2>
      <p>We'll try to move your booking to a new date with the same artist. Any difference in fee is quoted before you agree.</p>
      <h2>Refunds</h2>
      <p>Refunds go back to the original payment method.</p>
    </LegalPage>
  );
}
