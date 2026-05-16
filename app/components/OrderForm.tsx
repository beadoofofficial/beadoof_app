"use client";

import { useEffect, useState } from "react";
import type { Bead } from "./DesignBuilder";

type DeliveryType = "pickup" | "courier";

type Props = {
  design: Bead[];
  onClose: () => void;
  onSent?: () => void;
};

export default function OrderForm({ design, onClose, onSent }: Props) {
  const [customerName, setCustomerName] = useState("");
  const [deliveryType, setDeliveryType] = useState<DeliveryType>("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const body = {
        customerName: customerName.trim(),
        deliveryType,
        deliveryAddress:
          deliveryType === "courier" ? deliveryAddress.trim() : undefined,
        customerPhone:
          deliveryType === "courier" ? customerPhone.trim() : undefined,
        customerEmail: customerEmail.trim(),
        design: design.map((b) => ({
          color: b.color,
          stock: b.stock,
          name: b.name,
          assorted: b.assorted,
          lettered: b.lettered,
          letter: b.letter,
          sizeMm: b.sizeMm,
        })),
      };
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Order failed");
        return;
      }
      setSuccess(
        data.mode === "smtp"
          ? "Order sent! The shop has been notified."
          : "Order received! (Email service not configured — check server logs.)",
      );
      onSent?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally {
      setBusy(false);
    }
  };

  const totalBeads = design.length;
  const totalMm = design.reduce((s, b) => s + (b.sizeMm ?? 8), 0);
  const totalIn = (totalMm / 25.4).toFixed(1);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim());
  const canSubmit =
    customerName.trim().length > 0 &&
    emailValid &&
    (deliveryType === "pickup" ||
      (deliveryAddress.trim().length > 0 &&
        customerPhone.trim().length > 0));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 md:p-5 border-b border-[#f1e4d5] flex items-center justify-between">
          <h2 className="text-lg font-bold">Finish your design</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-[#7a6a60] hover:text-[#3b2b22] px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {success ? (
          <div className="p-5 space-y-3 text-center">
            <div className="text-5xl">✓</div>
            <h3 className="text-base font-bold text-emerald-700">{success}</h3>
            <p className="text-sm text-[#7a6a60]">
              {totalBeads} beads · {totalIn} in
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 bg-[#5a3a24] text-white px-5 py-2 rounded-full text-sm font-semibold"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-4 md:p-5 space-y-3 text-sm">
            <div className="text-xs text-[#7a6a60] bg-[#fbf1ea] rounded-lg p-3">
              <strong>{totalBeads}</strong> beads · <strong>{totalIn} in</strong>{" "}
              total. The shop will receive a receipt of materials with your
              design.
            </div>

            <Field label="Your name">
              <input
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                autoFocus
              />
            </Field>

            <Field label="Email">
              <input
                required
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
              />
              <span className="block text-[11px] text-[#7a6a60] mt-1">
                Your receipt will be sent here.
              </span>
            </Field>

            <Field label="Delivery">
              <div className="grid grid-cols-2 gap-2">
                {(["pickup", "courier"] as DeliveryType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDeliveryType(t)}
                    className={[
                      "py-2 rounded-lg border text-sm font-semibold capitalize transition-colors",
                      deliveryType === t
                        ? "bg-[#5a3a24] text-white border-[#5a3a24]"
                        : "bg-white border-[#e4d3c4] text-[#5a3a24] hover:bg-[#fbf1ea]",
                    ].join(" ")}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            {deliveryType === "courier" && (
              <>
                <Field label="Delivery address">
                  <textarea
                    required
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Street, city, postal code"
                    rows={2}
                    className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2 resize-none"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    required
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+63…"
                    className="w-full border border-[#e4d3c4] rounded-lg px-3 py-2"
                  />
                </Field>
              </>
            )}

            {error && (
              <div className="text-xs text-red-700 bg-red-50 rounded-lg p-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || busy}
              className="w-full bg-[#5a3a24] text-white py-2.5 rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy ? "Sending…" : "Send order"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-[#9a8478] mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
