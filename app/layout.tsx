import type { Metadata, Viewport } from 'next';
import '../src/style.css';
export const metadata: Metadata = {
  title: '一指盖楼：城市天际线',
  description: '一指盖楼，留下自己的作品，在城市天际线一起长高。',
  icons: { icon: '/favicon.svg' },
};
export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#cfeaff'};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
