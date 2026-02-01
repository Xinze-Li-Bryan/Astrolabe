'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { ReactNode } from 'react'

interface SortableSectionProps {
    id: string
    children: ReactNode
    disabled?: boolean
    order?: number
}

export function SortableSection({ id, children, disabled, order }: SortableSectionProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : 'auto',
        order: order ?? 0,
    }

    return (
        <div ref={setNodeRef} style={style} className="relative group/section">
            {/* Drag handle - positioned on the right, vertically centered */}
            {!disabled && (
                <button
                    {...attributes}
                    {...listeners}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover/section:opacity-100 text-white/40 hover:text-white/70 cursor-grab active:cursor-grabbing transition-opacity z-10"
                    title="Drag to reorder"
                >
                    <Bars3Icon className="w-4 h-4" />
                </button>
            )}
            {children}
        </div>
    )
}
