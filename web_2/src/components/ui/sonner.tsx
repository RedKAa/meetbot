"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

export function Toaster({ ...props }: React.ComponentProps<typeof Sonner>) {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-center"
      expand
      richColors
      closeButton
      toastOptions={{
        style: {
          background: 'rgba(255, 255, 255, 0.1)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: '#ffffff',
          borderRadius: '12px',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          fontSize: '14px',
          fontWeight: '500',
        },
        className: 'group toast group-[.toaster]:bg-transparent group-[.toaster]:text-white group-[.toaster]:border-white/20 group-[.toaster]:shadow-2xl',
      }}
      {...props}
    />
  )
}
