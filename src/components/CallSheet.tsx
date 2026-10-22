"use client";

import { useEffect, useRef, useState } from "react";
import type { Contact } from "@/lib/types";
import { CheckIcon, PhoneIcon } from "./icons";

const ROLE: Record<Contact["role"], string> = {
  parent: "Your parent",
  aide: "Home aide / carer",
  neighbour: "Neighbour",
  family: "Family",
  other: "Contact",
};

/**
 * Call sheet: shows who you're about to call and their number. On phones "Call now" (tel:) is the
 * main action; on computers, where tel: links open whatever app claims them (e.g. Zoom),
 * "Copy number" is. The call is only logged when one of those two is used.
 */
export function CallSheet({ contact, onClose, onLogged }: { contact: Contact; onClose: () => void; onLogged: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [isPhone, setIsPhone] = useState(true);

  useEffect(() => {
    setIsPhone(window.matchMedia("(pointer: coarse)").matches || /Android|iPhone|iPad/i.test(navigator.userAgent));
    // Guarded: React runs effects twice in development; closing in a cleanup would fire onClose.
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const tel = contact.phone.replace(/[^+0-9]/g, "");
  const callNow = () => {
    onLogged();
    window.location.href = `tel:${tel}`;
    onClose();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contact.phone);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); select the number instead.
      const sel = window.getSelection();
      const el = document.getElementById("call-sheet-number");
      if (sel && el) {
        const r = document.createRange();
        r.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    setCopied(true);
    onLogged();
  };

  const primary = "inline-flex items-center justify-center gap-1.5 rounded-full bg-ink px-5 py-2.5 font-bold text-paper";
  const secondary = "inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-card px-5 py-2.5 font-bold text-ink";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="call-sheet-title"
      className="m-auto w-[min(420px,92vw)] rounded-2xl bg-card p-0 text-ink shadow-2xl backdrop:bg-black/50"
    >
      <div className="p-6">
        <p className="text-sm text-ink-soft">{ROLE[contact.role]}</p>
        <h2 id="call-sheet-title" className="mt-0.5 text-2xl font-bold">
          {contact.name}
        </h2>
        <p id="call-sheet-number" className="mt-2 text-xl tabular-nums tracking-wide">
          {contact.phone}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {isPhone ? (
            <>
              <button autoFocus onClick={callNow} className={primary}>
                <PhoneIcon className="h-4 w-4" /> Call now
              </button>
              <button onClick={copy} className={secondary}>
                {copied ? <CheckIcon className="h-4 w-4" /> : null} {copied ? "Number copied" : "Copy number"}
              </button>
            </>
          ) : (
            <>
              <button autoFocus onClick={copy} className={primary}>
                {copied ? <CheckIcon className="h-4 w-4" /> : null} {copied ? "Number copied" : "Copy number"}
              </button>
              <button onClick={callNow} className={secondary}>
                <PhoneIcon className="h-4 w-4" /> Call now
              </button>
            </>
          )}
          <button onClick={onClose} className="mt-1 text-sm font-bold text-ink-soft underline underline-offset-2">
            {copied ? "Done" : "Cancel"}
          </button>
        </div>
        {!isPhone && <p className="mt-4 text-sm text-ink-soft">Calling opens your phone app; on a computer, copy the number.</p>}
      </div>
    </dialog>
  );
}
