import './globals.css'
import { APP_NAME } from '@/lib/version'

export const metadata = {
  title: APP_NAME,
  description: 'Internal candidate sourcing and evaluation platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
