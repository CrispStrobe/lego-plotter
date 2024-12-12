import './globals.css'
import Script from 'next/script'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Load PoweredUP library from CDN */}
        <Script 
          src="https://cdn.jsdelivr.net/npm/node-poweredup@latest/dist/browser/poweredup.js"
          strategy="beforeInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
