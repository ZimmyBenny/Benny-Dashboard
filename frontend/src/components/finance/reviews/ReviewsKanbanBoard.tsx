import { DndContext, closestCorners, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchReviews, patchReview, type Review, type ReviewStatus } from '../../../api/reviews.api';
import { ALL_STATUSES, nextPipelineStatus } from './reviewStatus';
import { ReviewColumn } from './ReviewColumn';

interface Props {
  selectedYear: number | 'all';
  onCardClick: (r: Review) => void;
}

export function ReviewsKanbanBoard({ selectedYear, onCardClick }: Props) {
  const queryClient = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ['reviews', selectedYear],
    queryFn: () => fetchReviews(selectedYear),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: ReviewStatus }) =>
      patchReview(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['reviews-stats'] });
    },
  });

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const id = Number(active.id);
    const newStatus = over.id as ReviewStatus;
    // Drop-Target kann eine Karten-id sein (wenn ueber einer anderen Karte gedroppt) — wir akzeptieren nur Status-Slugs
    if (!ALL_STATUSES.includes(newStatus)) return;
    const review = reviews.find(r => r.id === id);
    if (!review || review.status === newStatus) return;
    patchMut.mutate({ id, status: newStatus });
  }

  function handleForward(id: number) {
    const review = reviews.find(r => r.id === id);
    if (!review) return;
    const next = nextPipelineStatus(review.status);
    if (!next) return;
    patchMut.mutate({ id, status: next });
  }

  const byStatus = Object.fromEntries(
    ALL_STATUSES.map(s => [s, reviews.filter(r => r.status === s)])
  ) as Record<ReviewStatus, Review[]>;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div style={{
        display: 'flex',
        gap: '1rem',
        overflowX: 'auto',
        paddingBottom: '0.5rem',
        alignItems: 'flex-start',
      }}>
        {ALL_STATUSES.map(status => (
          <ReviewColumn
            key={status}
            status={status}
            reviews={byStatus[status]}
            onCardClick={onCardClick}
            onForward={handleForward}
          />
        ))}
      </div>
    </DndContext>
  );
}
