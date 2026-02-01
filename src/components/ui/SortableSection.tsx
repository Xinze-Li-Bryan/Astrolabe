'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bars3Icon } from '@heroicons/react/24/outline'
import { ReactNode } from 'react'

interface SortableSectionProps {
    id: string
    children: ReactNode
    disabled?: boolean
}

export function SortableSection({ id, children, disabled }: SortableSectionProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1000 : 'auto',
    }

    return (
        <div ref={setNodeRef} style={style} className="relative group/section">
            {/* Drag handle */}
            {!disabled && (
                <button
                    {...attributes}
                    {...listeners}
                    className="absolute -left-1 top-1.5 p-0.5 opacity-0 group-hover/section:opacity-100 text-white/30 hover:text-white/60 cursor-grab active:cursor-grabbing transition-opacity"
                    title="Drag to reorder"
                >
                    <Bars3Icon className="w-3 h-3" />
                </button>
            )}
            {children}
        </div>
    )
}
