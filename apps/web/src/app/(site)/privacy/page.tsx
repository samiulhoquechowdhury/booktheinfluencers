import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="26 Oct 2026">
      <p>We collect only what we need to arrange your booking and we don't sell your data.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Contact details: name, mobile number and, if you give it, email, company and GSTIN.</li>
        <li>Your event brief: date, city, venue, audience and budget.</li>
        <li>Booking records: quotes, contracts and payment references. Card and bank details stay with the payment gateway.</li>
      </ul>
      <h2>How we use it</h2>
      <ul>
        <li>To check availability, prepare quotes and contracts, and coordinate your event.</li>
        <li>To send booking updates by SMS, WhatsApp or email.</li>
        <li>To meet legal and tax obligations.</li>
      </ul>
      <h2>Who we share it with</h2>
      <p>
        The artist's team receives the event details they need to perform. Our payment, e-sign and messaging providers
        process data on our behalf.
      </p>
      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, a correction, or deletion where the law allows. Contact us and we'll respond
        within the time the law requires.
      </p>
    </LegalPage>
  );
}
