'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface Props {
  content: string
  className?: string
}

export default function MarkdownRenderer({ content, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
        // Custom heading styles
        h1: ({ children }) => (
          <h1 className="text-lg font-bold text-white/90 mb-2 mt-3 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-base font-semibold text-white/85 mb-2 mt-3">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-white/80 mb-1.5 mt-2">{children}</h3>
        ),
        // Paragraphs
        p: ({ children }) => (
          <p className="text-xs text-white/70 mb-2 leading-relaxed">{children}</p>
        ),
        // Lists
        ul: ({ children }) => (
          <ul className="list-disc list-inside text-xs text-white/70 mb-2 space-y-0.5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside text-xs text-white/70 mb-2 space-y-0.5">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-white/70">{children}</li>
        ),
        // Code blocks
        code: ({ className, children, ...props }) => {
          const isInline = !className
          if (isInline) {
            return (
              <code className="bg-white/10 text-cyan-400 px-1 py-0.5 rounded text-[11px] font-mono" {...props}>
                {children}
              </code>
            )
          }
          return (
            <code className={`block bg-black/40 text-green-400 p-2 rounded text-[11px] font-mono overflow-x-auto ${className}`} {...props}>
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="bg-black/40 rounded p-2 mb-2 overflow-x-auto">{children}</pre>
        ),
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-white/30 pl-3 text-white/60 italic mb-2">{children}</blockquote>
        ),
        // Links
        a: ({ href, children }) => (
          <a href={href} className="text-cyan-400 hover:text-cyan-300 underline" target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2">
            <table className="text-xs border-collapse">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-white/20 bg-white/5 px-2 py-1 text-left text-white/80">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-white/20 px-2 py-1 text-white/70">{children}</td>
        ),
        // Horizontal rule
        hr: () => <hr className="border-white/20 my-3" />,
        // Emphasis
        strong: ({ children }) => (
          <strong className="font-semibold text-white/90">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-white/80">{children}</em>
        ),
        // Task lists
        input: ({ checked, ...props }) => (
          <input
            type="checkbox"
            checked={checked}
            readOnly
            className="mr-1.5 accent-cyan-500"
            {...props}
          />
        ),
      }}
    >
      {content}
      </ReactMarkdown>
    </div>
  )
}
