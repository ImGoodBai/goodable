import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Coze2App - 让工作流一键变软件',
  description: 'Coze2App，让工作流一键变软件。管理和运行你的 Coze Bot 和工作流。',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  )
}
