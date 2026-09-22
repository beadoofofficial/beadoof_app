import Script from "next/script";
import { Fredoka, Karla } from "next/font/google";
import OrderWizard from "./components/OrderWizard";
import { getShopBootstrap } from "@/lib/shop.server";
import { getUser, isAdminEmail } from "@/lib/auth.server";
import type { ShopBootstrap } from "@/lib/shop";

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
    <div
      className={`${fredoka.variable} ${karla.variable} min-h-screen bg-paper font-shop text-base leading-normal text-ink antialiased`}
    >
      {/* Draws payment QR codes from pasted text; if it fails to load the
          form shows the text instead. */}
      <Script
        src="https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js"
        strategy="afterInteractive"
      />
      {boot ? (
        // OrderWizard renders its own shell so the step view can widen into
        // a two-column layout (wizard + price breakdown) on desktop.
        <OrderWizard
          boot={boot}
          signedIn={!!user}
          isAdmin={isAdminEmail(user?.email)}
        />
      ) : (
        <div className="mx-auto min-h-screen max-w-[460px] px-[18px] pt-5 pb-7">
          <section className="animate-rise motion-reduce:animate-none">
            <header className="pt-[34px] pb-5 text-center">
              <h1 className="font-display text-[27px] font-medium">BEADOOF</h1>
            </header>
            <p className="mt-[18px] rounded-[14px] bg-lemon px-4 py-3.5 font-bold">
              The shop could not be loaded. {bootError} — if this is a fresh
              setup, run the SQL in supabase/migrations/20260918_shop_wizard.sql.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
