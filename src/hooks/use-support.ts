import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/src/providers/auth-provider';
import { useSupportRealtime } from '@/src/providers/support-realtime-provider';
import { supportKeys, supportService } from '@/src/services/support';
import type { SupportMessage } from '@/src/types/support';

const MESSAGE_PAGE_SIZE = 50;
const DISCONNECTED_POLL_INTERVAL = 15_000;

export function useSupportTickets(closed: boolean) {
  const { token } = useAuth();
  const { status } = useSupportRealtime();
  return useQuery({
    queryKey: supportKeys.tickets(closed),
    queryFn: () => supportService.list(token!, closed),
    enabled: Boolean(token),
    staleTime: 10_000,
    refetchInterval: status === 'connected' ? false : DISCONNECTED_POLL_INTERVAL,
  });
}

export function useSupportMessages(ticketId: number | null) {
  const { token } = useAuth();
  const { status } = useSupportRealtime();
  return useInfiniteQuery({
    queryKey: supportKeys.messages(ticketId ?? 0),
    queryFn: ({ pageParam }) => supportService.messages(token!, ticketId!, pageParam, MESSAGE_PAGE_SIZE),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.items.length === MESSAGE_PAGE_SIZE
      ? lastPage.items[0]?.id
      : undefined,
    enabled: Boolean(token && ticketId),
    refetchInterval: status === 'connected' ? false : DISCONNECTED_POLL_INTERVAL,
  });
}

export function flattenSupportMessages(
  pages: { items: SupportMessage[] }[] | undefined,
) {
  const seen = new Set<number>();
  return [...(pages ?? [])]
    .reverse()
    .flatMap((page) => page.items)
    .filter((message) => {
      if (seen.has(message.id)) return false;
      seen.add(message.id);
      return true;
    })
    .sort((left, right) => left.id - right.id);
}
