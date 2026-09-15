import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/src/providers/auth-provider';
import { reservationsService } from '@/src/services/reservations';

export function usePatientVisits() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['patient-visits'],
    queryFn: () => reservationsService.getVisits(token!),
    enabled: Boolean(token),
    staleTime: 60 * 1000,
  });
}

export function useProcedureOptions() {
  return useQuery({
    queryKey: ['booking-procedure-options'],
    queryFn: () => reservationsService.getProcedureOptions(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useProcedurePrerequisites(procedureId: number | null) {
  return useQuery({
    queryKey: ['procedure-prerequisites', procedureId],
    queryFn: () => reservationsService.getProcedurePrerequisites(procedureId!),
    enabled: procedureId !== null,
    staleTime: 5 * 60 * 1000,
  });
}
