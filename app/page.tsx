import Script from "next/script";
import { Fredoka, Karla } from "next/font/google";
import OrderWizard from "./components/OrderWizard";
import { getShopBootstrap } from "@/lib/shop.server";
import { getUser, isAdminEmail } from "@/lib/auth.server";
import type { ShopBootstrap } from "@/lib/shop";
import "./order-wizard.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const karla = Karla({
  variable: "--font-karla",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export default async function Home() {
  let boot: ShopBootstrap | null = null;
  let bootError: string | null = null;
  try {
    boot = await getShopBootstrap();
  } catch (e) {
    bootError = e instanceof Error ? e.message : "Something went wrong.";
  }

  const user = await getUser();

  return (
    <div className={`shop ${fredoka.variable} ${karla.variable}`}>
      {/* Draws payment QR codes from pasted text; if it fails to load the
          form shows the text instead. */}
      <Script
        src="https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js"
        strategy="afterInteractive"
      />
      {boot ? (
        // OrderWizard renders its own .shell so the step view can widen into
        // a two-column layout (wizard + price breakdown) on desktop.
        <OrderWizard
          boot={boot}
          signedIn={!!user}
          isAdmin={isAdminEmail(user?.email)}
        />
      ) : (
        <div className="shell">
          <section className="view">
            <header className="masthead">
              <h1 className="steptitle">BEADOOF</h1>
            </header>
            <p className="closed">
              The shop could not be loaded. {bootError} — if this is a fresh
              setup, run the SQL in supabase/migrations/20260918_shop_wizard.sql.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
