import { decodeArticleId } from "@/lib/articleUtils";
import { extractArticleContent } from "@/lib/articleParser";
import AddNoteButton from "@/app/components/addNoteButton";
import BackButton from "@/app/components/backButton";
import { ExternalLink, Calendar, Clock } from "lucide-react";
import Link from "next/link";
import { Metadata } from "next";
import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const url = decodeArticleId(slug);
  const article = await extractArticleContent(url);

  return {
    title: article?.title
      ? `${article.title} | Antigravity News`
      : "Article | Antigravity News",
    description: article?.excerpt || "Read the full story on Antigravity News.",
    openGraph: {
      images: article?.image ? [article.image] : [],
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const url = decodeArticleId(slug);
  const article = await extractArticleContent(url);

  if (!article) {
    redirect(url);
  }

  const wordCount = article.content.split(/\s+/).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  const articleDate = article.publishedTime
    ? new Date(article.publishedTime)
    : new Date();
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(articleDate)
    .toUpperCase();

  return (
    <main className="min-h-screen bg-white dark:bg-[#0B0F19] selection:bg-blue-100 selection:text-blue-900">
      <article className="w-full px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <BackButton label="Back" />
          </div>
          {article.image && (
            <div className="relative w-full aspect-[16/9] md:aspect-[21/9] rounded-3xl overflow-hidden mb-8 shadow-2xl">
              <img
                src={article.image}
                alt={article.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col md:flex-row gap-4 mb-10 max-w-3xl mx-auto w-full">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg hover:shadow-blue-500/25 group"
            >
              <ExternalLink
                size={20}
                className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
              />
              Open Real Journal
            </a>
            <AddNoteButton
              title={article.title}
              link={url}
              publishedAt={article.publishedTime ?? undefined}
              sourceName={article.siteName}
              buttonLabel="Add Notes"
              buttonIcon="pencil"
              buttonClassName="flex-1 inline-flex items-center justify-center gap-3 px-8 py-4 bg-white dark:bg-[#1A1F2E] border-2 border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 text-slate-900 dark:text-white rounded-2xl font-bold transition-all shadow-sm hover:shadow-md group"
            />
          </div>
        </div>

        <div className="w-full">
          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs font-bold uppercase tracking-wider">
              {article.siteName}
            </span>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Calendar size={14} />
              <span className="font-medium tracking-tight">
                {formattedDate}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Clock size={14} />
              <span>{readTime} min read</span>
            </div>
          </div>

          {/* Title */}
          <h5 className="w-full text-2xl md:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white leading-[1.1] mb-8 tracking-tight">
            {article.title}
          </h5>

          {/* Content */}
          <div className="w-full prose prose-slate dark:prose-invert max-w-none font-sans">
            {article.content.split("\n\n").map((para, i) => (
              <p
                key={i}
                className="text-lg md:text-xl text-slate-700 dark:text-slate-300 leading-relaxed mb-6"
              >
                {para}
              </p>
            ))}
          </div>
        </div>

        {/* AI Disclaimer or Footer */}
        <div className="mt-16 max-w-3xl mx-auto p-8 rounded-3xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-3">
            About this article
          </h3>
          <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed mb-6">
            This detailed view was extracted from the original source for a
            better reading experience. The content belongs to{" "}
            <span className="font-bold">{article.siteName}</span>. If you
            enjoyed this piece, we encourage you to visit the original
            publication.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-bold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Read the full story on {article.siteName}
            <ExternalLink size={14} />
          </a>
        </div>
      </article>
    </main>
  );
}
