import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DesignMate — NH농협 사내 화면 설계 도우미',
  description: '요구사항을 대화로 다듬어 UI/UX 정의서와 와이어프레임을 만드는 NH농협 사내 도구',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
