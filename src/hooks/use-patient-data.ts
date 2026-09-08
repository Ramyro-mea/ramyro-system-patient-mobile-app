import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/src/providers/auth-provider';
import { patientPortalService } from '@/src/services/patient-portal';

export function usePatientProfile() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['patient-profile'],
    queryFn: () => patientPortalService.getProfile(token!),
    enabled: Boolean(token),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePatientWorklist() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['patient-worklist'],
    queryFn: () => patientPortalService.getWorklist(token!),
    enabled: Boolean(token),
    staleTime: 2 * 60 * 1000,
  });
}

