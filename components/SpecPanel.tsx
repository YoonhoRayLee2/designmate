import { markdownToHtml } from '@/lib/markdown';

export default function SpecPanel({ markdown }: { markdown: string }) {
  return (
    <div className="spec-md" dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }} />
  );
}
