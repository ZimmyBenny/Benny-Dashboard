import { useState } from 'react';
import { DndContext, pointerWithin, rectIntersection, PointerSensor, useSensor, useSensors, type DragEndEvent, type CollisionDetection } from '@dnd-kit/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchReviews, patchReview, type Review, type ReviewStatus } from '../../../api/reviews.api';
import { ALL_STATUSES, STATUS_GROUPS, nextPipelineStatus } from './reviewStatus';
import { ReviewGroupSection } from './ReviewGroupSection';
import { SellerNotifiedDialog } from './SellerNotifiedDialog';

interface Props {
  selectedYear: number | 'all';
  onCardClick: (r: Review) => void;
}

// Robuste Collision-Detection: erst Pointer-within-Target, dann Rect-Intersection als Fallback.
// closestCorners hatte Probleme im Multi-Container-Grid-Layout (User-Decision 2026-05-26).
const customCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

export function ReviewsKanbanBoard({ selectedYear, onCardClick }: Props) {
  const queryClient = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ['reviews', selectedYear],
    queryFn: () => fetchReviews(selectedYear),
  });

  // Pending-Move-State fuer Pop-up bei Wechsel zu 'bewertet'
  const [pendingMove, setPendingMove] = useState<{ id: number; productName: string } | null>(null);

  const patchMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Review> }) =>
      patchReview(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['reviews-stats'] });
    },
  });

  // Triggert Status-Wechsel — pruefer ob Bewertet-Dialog noetig ist
  function applyStatusChange(id: number, newStatus: ReviewStatus) {
    const review = reviews.find(r => r.id === id);
    if (!review || review.status === newStatus) return;

    // Pop-up nur wenn neu auf 'bewertet' UND noch nicht gesendet markiert
    if (newStatus === 'bewertet' && review.seller_notified === 0) {
      setPendingMove({ id, productName: review.product_name });
      // patch erfolgt nach Dialog-Antwort
      return;
    }

    patchMut.mutate({ id, payload: { status: newStatus } });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const id = Number(active.id);

    // over.id kann ein Status-Slug (Drop auf leere Spalte) ODER eine Card-ID
    // (Drop auf einer anderen Karte) sein. Beides erlauben.
    let newStatus: ReviewStatus | null = null;
    if (typeof over.id === 'string' && ALL_STATUSES.includes(over.id as ReviewStatus)) {
      newStatus = over.id as ReviewStatus;
    } else {
      // Drop auf einer Karte -> finde deren Status
      const targetReview = reviews.find(r => r.id === Number(over.id));
      if (targetReview) newStatus = targetReview.status;
    }
    if (!newStatus) return;

    applyStatusChange(id, newStatus);
  }

  function handleForward(id: number) {
    const review = reviews.find(r => r.id === id);
    if (!review) return;
    const next = nextPipelineStatus(review.status);
    if (!next) return;
    applyStatusChange(id, next);
  }

  function handleDialogYes() {
    if (!pendingMove) return;
    patchMut.mutate({ id: pendingMove.id, payload: { status: 'bewertet', seller_notified: 1 } });
    setPendingMove(null);
  }
  function handleDialogNotYet() {
    if (!pendingMove) return;
    patchMut.mutate({ id: pendingMove.id, payload: { status: 'bewertet' } });
    setPendingMove(null);
  }
  function handleDialogCancel() {
    setPendingMove(null);
  }

  const byStatus = Object.fromEntries(
    ALL_STATUSES.map(s => [s, reviews.filter(r => r.status === s)])
  ) as Record<ReviewStatus, Review[]>;

  return (
    <DndContext sensors={sensors} collisionDetection={customCollision} onDragEnd={handleDragEnd}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.875rem',
      }}>
        {STATUS_GROUPS.map(group => {
          const groupHasItems = group.statuses.some(s => byStatus[s].length > 0);
          // Final-Gruppe defaultmaessig zugeklappt wenn leer
          const defaultOpen = group.id === 'final' ? groupHasItems : true;
          return (
            <ReviewGroupSection
              key={group.id}
              group={group}
              byStatus={byStatus}
              onCardClick={onCardClick}
              onForward={handleForward}
              defaultOpen={defaultOpen}
            />
          );
        })}
      </div>
      {pendingMove && (
        <SellerNotifiedDialog
          productName={pendingMove.productName}
          onYes={handleDialogYes}
          onNotYet={handleDialogNotYet}
          onCancel={handleDialogCancel}
        />
      )}
    </DndContext>
  );
}
