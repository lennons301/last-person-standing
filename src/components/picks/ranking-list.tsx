'use client'

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core'
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { FormSheetRenderer } from './fixture-row'
import { RankedItem, type RankedPick } from './ranked-item'

interface RankingListProps {
	picks: RankedPick[]
	onReorder: (picks: RankedPick[]) => void
	onRemove: (id: string) => void
	onChangePrediction: (id: string) => void
	/** Passed straight through to each row's form-detail tap-through. */
	competitionId?: string
	roundNumber?: number
	/**
	 * Sheet override, for the database-free `/preview/picks` gallery. Passed to
	 * every row as it stands: a row states which fixture and which side it opened
	 * the sheet for, so there is nothing per-pick left for a factory to close over.
	 */
	renderFormSheet?: FormSheetRenderer
}

export function RankingList({
	picks,
	onReorder,
	onRemove,
	onChangePrediction,
	competitionId,
	roundNumber,
	renderFormSheet,
}: RankingListProps) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (!over || active.id === over.id) return
		const oldIndex = picks.findIndex((p) => p.id === active.id)
		const newIndex = picks.findIndex((p) => p.id === over.id)
		const reordered = arrayMove(picks, oldIndex, newIndex).map((p, i) => ({ ...p, rank: i + 1 }))
		onReorder(reordered)
	}

	function handleMoveUp(id: string) {
		const index = picks.findIndex((p) => p.id === id)
		if (index === 0) return
		const reordered = arrayMove(picks, index, index - 1).map((p, i) => ({ ...p, rank: i + 1 }))
		onReorder(reordered)
	}

	function handleMoveDown(id: string) {
		const index = picks.findIndex((p) => p.id === id)
		if (index === picks.length - 1) return
		const reordered = arrayMove(picks, index, index + 1).map((p, i) => ({ ...p, rank: i + 1 }))
		onReorder(reordered)
	}

	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
			<SortableContext items={picks.map((p) => p.id)} strategy={verticalListSortingStrategy}>
				{picks.map((pick, i) => (
					<RankedItem
						key={pick.id}
						pick={pick}
						isFirst={i === 0}
						isLast={i === picks.length - 1}
						onMoveUp={() => handleMoveUp(pick.id)}
						onMoveDown={() => handleMoveDown(pick.id)}
						onRemove={() => onRemove(pick.id)}
						onChangePrediction={() => onChangePrediction(pick.id)}
						competitionId={competitionId}
						roundNumber={roundNumber}
						renderFormSheet={renderFormSheet}
					/>
				))}
			</SortableContext>
		</DndContext>
	)
}
