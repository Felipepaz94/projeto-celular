"use client";

import {Toaster as Sonner} from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          background: "#151b24",
          border: "1px solid rgba(255,255,255,0.14)",
          color: "#f7f9fc",
        },
      }}
    />
  );
}