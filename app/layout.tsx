import './globals.css'

export const metadata = {
  title: 'Skouth',
  description: 'Internal candidate sourcing and evaluation platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
