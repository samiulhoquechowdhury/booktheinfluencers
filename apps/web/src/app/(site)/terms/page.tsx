import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { BRAND_NAME } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="26 Oct 2026">
      <p>
        These terms cover your use of {BRAND_NAME}'s website and services. Each booking is also governed by its own
        signed agreement, which takes priority for that booking.
      </p>
      <h2>Our role</h2>
      <p>
        We arrange bookings between clients and artists or their authorised representatives. We check availability,
        prepare quotes and contracts, collect payments and coordinate the event.
      </p>
      <h2>Quotes and confirmation</h2>
      <ul>
        <li>Fee ranges on profiles are indicative and are not offers.</li>
        <li>A quote is valid until the date shown on it.</li>
        <li>A booking is confirmed only after the quote is accepted, the contract is signed, the advance is paid and the artist's team has accepted.</li>
      </ul>
      <h2>Your account</h2>
      <p>You sign in with your mobile number. Keep access to it secure and tell us if you lose it.</p>
      <h2>Artist names and images</h2>
      <p>Artist names and images are shown so you can discover and book them. They don't mean an artist endorses us or you.</p>
      <h2>Contact</h2>
      <p>Questions about these terms? Contact our team using the details on the Contact page.</p>
    </LegalPage>
  );
}
